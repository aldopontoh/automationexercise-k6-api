import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';

export const apiContractFailures = new Counter('api_contract_failures');

/**
 * Safely parses a k6 HTTP response body as JSON without throwing uncaught exceptions
 * if an upstream gateway returns HTML or an empty body.
 */
export function parseJsonSafe(res) {
  if (!res || typeof res.body !== 'string' || res.body.trim().length === 0) {
    return { ok: false, data: null, error: 'Empty or non-string response body' };
  }

  try {
    return { ok: true, data: JSON.parse(res.body), error: null };
  } catch (err) {
    return { ok: false, data: null, error: err.message };
  }
}

/**
 * Validates transport-layer HTTP status, safe JSON parsing, logical JSON responseCode,
 * optional exact response message, and any custom domain payload checks.
 *
 * @param {object} res - k6 http.Response
 * @param {object} spec - Contract expectation descriptor
 * @param {string} spec.label - Traceable check prefix (e.g., "API 1 - GET /api/productsList")
 * @param {number} [spec.expectedHttpStatus=200] - Expected HTTP transport status
 * @param {number} spec.expectedResponseCode - Expected JSON responseCode value
 * @param {string} [spec.expectedMessage] - Expected exact JSON message field
 * @param {Record<string, (body: any, res: object) => boolean>} [spec.extraChecks] - Additional payload checks
 * @param {boolean} [spec.abortOnFail=false] - Calls k6 fail() immediately if checks fail (only when no teardown is pending)
 * @returns {{ passed: boolean, body: any, failureMessage: string | null }}
 */
export function assertApiResponse(res, spec) {
  const {
    label,
    expectedHttpStatus = 200,
    expectedResponseCode,
    expectedMessage,
    extraChecks = {},
    abortOnFail = false,
  } = spec;

  const parsed = parseJsonSafe(res);
  const body = parsed.data;

  const checkMap = {
    [`${label}: HTTP status is ${expectedHttpStatus}`]: () => res.status === expectedHttpStatus,
    [`${label}: response body is valid JSON`]: () => parsed.ok && body !== null && typeof body === 'object',
    [`${label}: JSON responseCode is ${expectedResponseCode}`]: () =>
      parsed.ok && Number(body.responseCode) === expectedResponseCode,
  };

  if (expectedMessage !== undefined) {
    checkMap[`${label}: JSON message matches "${expectedMessage}"`] = () =>
      parsed.ok && body.message === expectedMessage;
  }

  for (const [desc, predicate] of Object.entries(extraChecks)) {
    checkMap[`${label}: ${desc}`] = () => parsed.ok && Boolean(predicate(body, res));
  }

  const passed = check(res, checkMap);

  let failureMessage = null;
  if (!passed) {
    apiContractFailures.add(1, { endpoint: label });
    const snippet = res && typeof res.body === 'string' ? res.body.slice(0, 200) : String(res && res.body);
    failureMessage = `[CONTRACT FAILURE] ${label} | HTTP=${res ? res.status : 'N/A'} | JSON_CODE=${
      body ? body.responseCode : 'PARSE_ERR'
    } | BODY=${snippet}`;

    if (abortOnFail) {
      fail(failureMessage);
    }
  }

  return { passed, body, failureMessage };
}
