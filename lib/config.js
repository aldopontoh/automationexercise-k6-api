import http from 'k6/http';
import { sleep } from 'k6';

/**
 * Shared k6 configuration, form helpers, transient-5xx retry wrapper,
 * load profiles, and SLA thresholds for the AutomationExercise REST API suite.
 */

export const BASE_URL = __ENV.BASE_URL || 'https://automationexercise.com';

export const TEST_PROFILE = (__ENV.TEST_PROFILE || 'smoke').toLowerCase();

export const PACING_SECONDS = Number(__ENV.PACING_SECONDS || 0.75);

export const MAX_TRANSIENT_RETRIES = Number(__ENV.MAX_TRANSIENT_RETRIES || 2);

const TRANSIENT_HTTP_STATUSES = new Set([0, 429, 502, 503, 504]);

export const DEFAULT_HEADERS = {
  Accept: 'application/json',
};

export const FORM_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded',
};

export const THRESHOLDS = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<5000'],
  checks: ['rate>0.99'],
  api_contract_failures: ['count==0'],
};

/**
 * Serializes a flat key/value object as application/x-www-form-urlencoded.
 * Safe for POST, PUT, and DELETE requests in k6.
 */
export function buildFormBody(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

/**
 * Executes an HTTP request with polite exponential backoff ONLY on transient
 * upstream gateway/queue errors (HTTP 0, 429, 502, 503, 504).
 * Never retries 2xx or 4xx API responses so contract assertions remain strict.
 */
export function requestWithRetry(method, url, body = null, params = {}) {
  let res = null;
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    res = http.request(method, url, body, params);
    if (!TRANSIENT_HTTP_STATUSES.has(res.status)) {
      return res;
    }
    if (attempt < MAX_TRANSIENT_RETRIES) {
      sleep(1.5 * (attempt + 1));
    }
  }
  return res;
}

/**
 * Returns controlled execution options safe for the external AutomationExercise API.
 * - smoke (default): 2 VUs, 2 shared iterations; cleanly overridable via CLI --vus/--iterations.
 * - load: gentle staged ramp-up peaking at 6 VUs.
 */
export function getSuiteOptions() {
  const baseOptions = {
    thresholds: THRESHOLDS,
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max'],
  };

  if (TEST_PROFILE === 'load') {
    return {
      ...baseOptions,
      stages: [
        { duration: '10s', target: 3 },
        { duration: '20s', target: 6 },
        { duration: '10s', target: 0 },
      ],
    };
  }

  return {
    ...baseOptions,
    vus: 2,
    iterations: 2,
  };
}
