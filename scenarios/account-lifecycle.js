import http from 'k6/http';
import { fail, group, sleep } from 'k6';
import {
  BASE_URL,
  DEFAULT_HEADERS,
  FORM_HEADERS,
  PACING_SECONDS,
  buildFormBody,
} from '../lib/config.js';
import { assertApiResponse } from '../lib/assertions.js';

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
 * Executes AutomationExercise Account & Auth Lifecycle APIs (APIs 7–14)
 * in a self-cleaning sequence:
 *   API 11 (createAccount) -> API 7 (verifyLogin valid) -> API 14 (getUserDetailByEmail)
 *   -> API 13 (updateAccount) -> API 8 (verifyLogin missing email) -> API 9 (DELETE verifyLogin)
 *   -> API 10 (verifyLogin invalid) -> API 12 (deleteAccount in finally teardown).
 *
 * Traceability: API-REQ-ACC-01..08 -> API-TC-ACC-01..08.
 */
export function runAccountLifecycleScenario() {
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
    const createRes = http.post(`${BASE_URL}/api/createAccount`, buildFormBody(user), {
      headers: FORM_HEADERS,
      tags: { api: 'API-11-createAccount-POST', module: 'account-lifecycle' },
    });
    const createCheck = assertApiResponse(createRes, {
      label: 'API 11 - POST /api/createAccount (201)',
      expectedHttpStatus: 200,
      expectedResponseCode: 201,
      expectedMessage: 'User created!',
      abortOnFail: true,
    });
    accountCreated = createCheck.passed;
    sleep(PACING_SECONDS);

    try {
      // API 7: POST /api/verifyLogin with valid details -> 200 (API-REQ-ACC-02 / API-TC-ACC-02)
      const loginValidRes = http.post(
        `${BASE_URL}/api/verifyLogin`,
        buildFormBody({ email: user.email, password: user.password }),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-7-verifyLogin-valid', module: 'account-lifecycle' },
        }
      );
      recordFailure(
        assertApiResponse(loginValidRes, {
          label: 'API 7 - POST /api/verifyLogin (valid 200)',
          expectedHttpStatus: 200,
          expectedResponseCode: 200,
          expectedMessage: 'User exists!',
        })
      );
      sleep(PACING_SECONDS);

      // API 14: GET /api/getUserDetailByEmail -> 200 (API-REQ-ACC-03 / API-TC-ACC-03)
      const getUserRes = http.get(
        `${BASE_URL}/api/getUserDetailByEmail?email=${encodeURIComponent(user.email)}`,
        {
          headers: DEFAULT_HEADERS,
          tags: { api: 'API-14-getUserDetailByEmail-GET', module: 'account-lifecycle' },
        }
      );
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
      sleep(PACING_SECONDS);

      // API 13: PUT /api/updateAccount -> 200 (API-REQ-ACC-04 / API-TC-ACC-04)
      const updatedUser = {
        ...user,
        name: `${user.name} Updated`,
        company: 'QA Automation Lab Updated',
        city: 'San Francisco',
      };
      const updateRes = http.put(`${BASE_URL}/api/updateAccount`, buildFormBody(updatedUser), {
        headers: FORM_HEADERS,
        tags: { api: 'API-13-updateAccount-PUT', module: 'account-lifecycle' },
      });
      recordFailure(
        assertApiResponse(updateRes, {
          label: 'API 13 - PUT /api/updateAccount (200)',
          expectedHttpStatus: 200,
          expectedResponseCode: 200,
          expectedMessage: 'User updated!',
        })
      );
      sleep(PACING_SECONDS);

      // API 8: POST /api/verifyLogin without email parameter -> 400 (API-REQ-ACC-05 / API-TC-ACC-05)
      const loginMissingEmailRes = http.post(
        `${BASE_URL}/api/verifyLogin`,
        buildFormBody({ password: user.password }),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-8-verifyLogin-missing-email', module: 'account-lifecycle' },
        }
      );
      recordFailure(
        assertApiResponse(loginMissingEmailRes, {
          label: 'API 8 - POST /api/verifyLogin (missing email 400)',
          expectedHttpStatus: 200,
          expectedResponseCode: 400,
          expectedMessage: 'Bad request, email or password parameter is missing in POST request.',
        })
      );
      sleep(PACING_SECONDS);

      // API 9: DELETE /api/verifyLogin -> 405 (API-REQ-ACC-06 / API-TC-ACC-06)
      const loginDeleteRes = http.del(`${BASE_URL}/api/verifyLogin`, null, {
        headers: FORM_HEADERS,
        tags: { api: 'API-9-verifyLogin-DELETE', module: 'account-lifecycle' },
      });
      recordFailure(
        assertApiResponse(loginDeleteRes, {
          label: 'API 9 - DELETE /api/verifyLogin (405)',
          expectedHttpStatus: 200,
          expectedResponseCode: 405,
          expectedMessage: 'This request method is not supported.',
        })
      );
      sleep(PACING_SECONDS);

      // API 10: POST /api/verifyLogin with invalid details -> 404 (API-REQ-ACC-07 / API-TC-ACC-07)
      const loginInvalidRes = http.post(
        `${BASE_URL}/api/verifyLogin`,
        buildFormBody({
          email: `nonexistent_${__VU}_${__ITER}_${Date.now()}@testmail.local`,
          password: 'InvalidPassword!000',
        }),
        {
          headers: FORM_HEADERS,
          tags: { api: 'API-10-verifyLogin-invalid', module: 'account-lifecycle' },
        }
      );
      recordFailure(
        assertApiResponse(loginInvalidRes, {
          label: 'API 10 - POST /api/verifyLogin (invalid 404)',
          expectedHttpStatus: 200,
          expectedResponseCode: 404,
          expectedMessage: 'User not found!',
        })
      );
      sleep(PACING_SECONDS);
    } finally {
      // API 12: DELETE /api/deleteAccount -> 200 (API-REQ-ACC-08 / API-TC-ACC-08)
      // Always executed whenever accountCreated is true to guarantee zero orphaned test users.
      if (accountCreated) {
        const deleteRes = http.del(
          `${BASE_URL}/api/deleteAccount`,
          buildFormBody({ email: user.email, password: user.password }),
          {
            headers: FORM_HEADERS,
            tags: { api: 'API-12-deleteAccount-DELETE', module: 'account-lifecycle' },
          }
        );
        recordFailure(
          assertApiResponse(deleteRes, {
            label: 'API 12 - DELETE /api/deleteAccount (cleanup 200)',
            expectedHttpStatus: 200,
            expectedResponseCode: 200,
            expectedMessage: 'Account deleted!',
          })
        );
        sleep(PACING_SECONDS);
      }
    }

    if (firstFailureMessage) {
      fail(firstFailureMessage);
    }
  });
}
