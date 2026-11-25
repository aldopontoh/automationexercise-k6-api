import { fail, group } from 'k6';
import {
  BASE_URL,
  DEFAULT_HEADERS,
  FORM_HEADERS,
  buildFormBody,
  requestWithRetry,
  thinkTime,
} from '../lib/config.js';
import { assertApiResponse } from '../lib/assertions.js';
import { searchAuthTierDuration, trafficMixHits, writeTierDuration } from '../lib/metrics.js';

/**
 * Generates an isolated, collision-free ephemeral test user per VU and iteration.
 */
export function buildUniqueTestUser() {
  const uniqueSuffix = `vu${__VU}_iter${__ITER}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  return {
    name: `QA Perf User ${uniqueSuffix}`,
    email: `${uniqueSuffix}@testmail.local`,
    password: `K6Test!${__VU}${__ITER}987`,
    title: 'Mr',
    birth_date: '15',
    birth_month: '06',
    birth_year: '1992',
    firstname: 'PerfQA',
    lastname: `Tester${__VU}`,
    company: 'QA Automation Lab',
    address1: '100 Performance Way',
    address2: 'Suite 404',
    country: 'United States',
    zipcode: '90210',
    state: 'California',
    city: 'Los Angeles',
    mobile_number: '5550199283',
  };
}

/**
 * Lightweight Auth Validation bucket (20% traffic-mix share in load/stress/spike/soak/throughput).
 * Exercises APIs 8, 9, and 10 without triggering heavy DB account creation on every hit.
 */
export function runAuthValidationBucket() {
  trafficMixHits.add(1, { bucket: 'auth_profile' });

  group('Auth Validation Bucket (APIs 8-10)', () => {
    // API 8: POST /api/verifyLogin without email parameter -> 400
    const loginMissingEmailRes = requestWithRetry(
      'POST',
      `${BASE_URL}/api/verifyLogin`,
      buildFormBody({ password: 'SampleCheckPassword123' }),
      {
        headers: FORM_HEADERS,
        tags: { api: 'API-8-verifyLogin-missing-email', module: 'account-lifecycle', tier: 'search_auth' },
      }
    );
    searchAuthTierDuration.add(loginMissingEmailRes.timings.duration);
    assertApiResponse(loginMissingEmailRes, {
      label: 'API 8 - POST /api/verifyLogin (missing email 400)',
      expectedHttpStatus: 200,
      expectedResponseCode: 400,
      expectedMessage: 'Bad request, email or password parameter is missing in POST request.',
      abortOnFail: true,
    });
    thinkTime();

    // API 9: DELETE /api/verifyLogin -> 405
    const loginDeleteRes = requestWithRetry('DELETE', `${BASE_URL}/api/verifyLogin`, null, {
      headers: FORM_HEADERS,
      tags: { api: 'API-9-verifyLogin-DELETE', module: 'account-lifecycle', tier: 'search_auth' },
    });
    searchAuthTierDuration.add(loginDeleteRes.timings.duration);
    assertApiResponse(loginDeleteRes, {
      label: 'API 9 - DELETE /api/verifyLogin (405)',
      expectedHttpStatus: 200,
      expectedResponseCode: 405,
      expectedMessage: 'This request method is not supported.',
      abortOnFail: true,
    });
    thinkTime();

    // API 10: POST /api/verifyLogin with invalid details -> 404
    const loginInvalidRes = requestWithRetry(
      'POST',
      `${BASE_URL}/api/verifyLogin`,
      buildFormBody({
        email: `nonexistent_${__VU}_${__ITER}_${Date.now()}@testmail.local`,
        password: 'InvalidPassword!000',
      }),
      {
        headers: FORM_HEADERS,
        tags: { api: 'API-10-verifyLogin-invalid', module: 'account-lifecycle', tier: 'search_auth' },
      }
    );
    searchAuthTierDuration.add(loginInvalidRes.timings.duration);
    assertApiResponse(loginInvalidRes, {
      label: 'API 10 - POST /api/verifyLogin (invalid 404)',
      expectedHttpStatus: 200,
      expectedResponseCode: 404,
      expectedMessage: 'User not found!',
      abortOnFail: true,
    });
    thinkTime();
  });
}

/**
 * Executes AutomationExercise Account & Auth Lifecycle APIs (APIs 7–14)
 * plus duplicate-email race/idempotency check in a self-cleaning sequence:
 *   API 11 (createAccount) -> API 11 Duplicate Check (400 Email already exists!)
 *   -> API 7 (verifyLogin valid) -> API 14 (getUserDetailByEmail)
 *   -> API 13 (updateAccount) -> API 8 -> API 9 -> API 10
 *   -> API 12 (deleteAccount in finally teardown).
 *
 * Traceability: API-REQ-ACC-01..10 -> API-TC-ACC-01..10.
 */
export function runAccountLifecycleScenario() {
  trafficMixHits.add(1, { bucket: 'account_crud' });

  group('Account & Auth Lifecycle API (APIs 7-14)', () => {
    const user = buildUniqueTestUser();
    let accountCreated = false;
    let firstFailureMessage = null;

    const recordFailure = (result) => {
      if (!result.passed && !firstFailureMessage) {
        firstFailureMessage = result.failureMessage;
      }
    };

    // API 11: POST /api/createAccount -> 201 (API-REQ-ACC-01 / API-TC-ACC-01)
    const createRes = requestWithRetry('POST', `${BASE_URL}/api/createAccount`, buildFormBody(user), {
      headers: FORM_HEADERS,
      tags: { api: 'API-11-createAccount-POST', module: 'account-lifecycle', tier: 'write' },
    });
    writeTierDuration.add(createRes.timings.duration);

    const createCheck = assertApiResponse(createRes, {
      label: 'API 11 - POST /api/createAccount (201)',
      expectedHttpStatus: 200,
      expectedResponseCode: 201,
      expectedMessage: 'User created!',
      abortOnFail: true,
    });
    accountCreated = createCheck.passed;
    thinkTime();

    try {
      // Duplicate-Email Race / Idempotency Check (API-REQ-ACC-10 / API-TC-ACC-10)
      const duplicateCreateRes = requestWithRetry(
        'POST',
        `${BASE_URL}/api/createAccount`,
        buildFormBody(user),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-11-createAccount-duplicate', module: 'account-lifecycle', tier: 'write' },
        }
      );
      writeTierDuration.add(duplicateCreateRes.timings.duration);
      recordFailure(
        assertApiResponse(duplicateCreateRes, {
          label: 'API 11 - POST /api/createAccount (duplicate email 400)',
          expectedHttpStatus: 200,
          expectedResponseCode: 400,
          expectedMessage: 'Email already exists!',
        })
      );
      thinkTime();

      // API 7: POST /api/verifyLogin with valid details -> 200 (API-REQ-ACC-02 / API-TC-ACC-02)
      const loginValidRes = requestWithRetry(
        'POST',
        `${BASE_URL}/api/verifyLogin`,
        buildFormBody({ email: user.email, password: user.password }),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-7-verifyLogin-valid', module: 'account-lifecycle', tier: 'search_auth' },
        }
      );
      searchAuthTierDuration.add(loginValidRes.timings.duration);
      recordFailure(
        assertApiResponse(loginValidRes, {
          label: 'API 7 - POST /api/verifyLogin (valid 200)',
          expectedHttpStatus: 200,
          expectedResponseCode: 200,
          expectedMessage: 'User exists!',
        })
      );
      thinkTime();

      // API 14: GET /api/getUserDetailByEmail -> 200 (API-REQ-ACC-03 / API-TC-ACC-03)
      const getUserRes = requestWithRetry(
        'GET',
        `${BASE_URL}/api/getUserDetailByEmail?email=${encodeURIComponent(user.email)}`,
        null,
        {
          headers: DEFAULT_HEADERS,
          tags: { api: 'API-14-getUserDetailByEmail-GET', module: 'account-lifecycle', tier: 'search_auth' },
        }
      );
      searchAuthTierDuration.add(getUserRes.timings.duration);
      recordFailure(
        assertApiResponse(getUserRes, {
          label: 'API 14 - GET /api/getUserDetailByEmail (200)',
          expectedHttpStatus: 200,
          expectedResponseCode: 200,
          extraChecks: {
            'user object matches registered email and name': (body) =>
              Boolean(body.user && body.user.email === user.email && body.user.name === user.name),
          },
        })
      );
      thinkTime();

      // API 13: PUT /api/updateAccount -> 200 (API-REQ-ACC-04 / API-TC-ACC-04)
      const updatedUser = {
        ...user,
        name: `${user.name} Updated`,
        company: 'QA Automation Lab Updated',
        city: 'San Francisco',
      };
      const updateRes = requestWithRetry(
        'PUT',
        `${BASE_URL}/api/updateAccount`,
        buildFormBody(updatedUser),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-13-updateAccount-PUT', module: 'account-lifecycle', tier: 'write' },
        }
      );
      writeTierDuration.add(updateRes.timings.duration);
      recordFailure(
        assertApiResponse(updateRes, {
          label: 'API 13 - PUT /api/updateAccount (200)',
          expectedHttpStatus: 200,
          expectedResponseCode: 200,
          expectedMessage: 'User updated!',
        })
      );
      thinkTime();

      // API 8: POST /api/verifyLogin without email parameter -> 400 (API-REQ-ACC-05 / API-TC-ACC-05)
      const loginMissingEmailRes = requestWithRetry(
        'POST',
        `${BASE_URL}/api/verifyLogin`,
        buildFormBody({ password: user.password }),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-8-verifyLogin-missing-email', module: 'account-lifecycle', tier: 'search_auth' },
        }
      );
      searchAuthTierDuration.add(loginMissingEmailRes.timings.duration);
      recordFailure(
        assertApiResponse(loginMissingEmailRes, {
          label: 'API 8 - POST /api/verifyLogin (missing email 400)',
          expectedHttpStatus: 200,
          expectedResponseCode: 400,
          expectedMessage: 'Bad request, email or password parameter is missing in POST request.',
        })
      );
      thinkTime();

      // API 9: DELETE /api/verifyLogin -> 405 (API-REQ-ACC-06 / API-TC-ACC-06)
      const loginDeleteRes = requestWithRetry('DELETE', `${BASE_URL}/api/verifyLogin`, null, {
        headers: FORM_HEADERS,
        tags: { api: 'API-9-verifyLogin-DELETE', module: 'account-lifecycle', tier: 'search_auth' },
      });
      searchAuthTierDuration.add(loginDeleteRes.timings.duration);
      recordFailure(
        assertApiResponse(loginDeleteRes, {
          label: 'API 9 - DELETE /api/verifyLogin (405)',
          expectedHttpStatus: 200,
          expectedResponseCode: 405,
          expectedMessage: 'This request method is not supported.',
        })
      );
      thinkTime();

      // API 10: POST /api/verifyLogin with invalid details -> 404 (API-REQ-ACC-07 / API-TC-ACC-07)
      const loginInvalidRes = requestWithRetry(
        'POST',
        `${BASE_URL}/api/verifyLogin`,
        buildFormBody({
          email: `nonexistent_${__VU}_${__ITER}_${Date.now()}@testmail.local`,
          password: 'InvalidPassword!000',
        }),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-10-verifyLogin-invalid', module: 'account-lifecycle', tier: 'search_auth' },
        }
      );
      searchAuthTierDuration.add(loginInvalidRes.timings.duration);
      recordFailure(
        assertApiResponse(loginInvalidRes, {
          label: 'API 10 - POST /api/verifyLogin (invalid 404)',
          expectedHttpStatus: 200,
          expectedResponseCode: 404,
          expectedMessage: 'User not found!',
        })
      );
      thinkTime();
    } finally {
      // API 12: DELETE /api/deleteAccount -> 200 (API-REQ-ACC-08 / API-TC-ACC-08)
      // Always executed whenever accountCreated is true to guarantee zero orphaned test users.
      if (accountCreated) {
        const deleteRes = requestWithRetry(
          'DELETE',
          `${BASE_URL}/api/deleteAccount`,
          buildFormBody({ email: user.email, password: user.password }),
          {
            headers: FORM_HEADERS,
            tags: { api: 'API-12-deleteAccount-DELETE', module: 'account-lifecycle', tier: 'write' },
          }
        );
        writeTierDuration.add(deleteRes.timings.duration);
        recordFailure(
          assertApiResponse(deleteRes, {
            label: 'API 12 - DELETE /api/deleteAccount (cleanup 200)',
            expectedHttpStatus: 200,
            expectedResponseCode: 200,
            expectedMessage: 'Account deleted!',
          })
        );
        thinkTime();
      }
    }

    if (firstFailureMessage) {
      fail(firstFailureMessage);
    }
  });
}
