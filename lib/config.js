import http from 'k6/http';
import { sleep } from 'k6';

/**
 * Shared k6 configuration, 6 professional performance profiles, per-endpoint
 * tiered SLA thresholds, realistic think-time helper, and transient-5xx retry.
 */

export const BASE_URL = __ENV.BASE_URL || 'https://automationexercise.com';

export const TEST_PROFILE = (__ENV.TEST_PROFILE || 'smoke').toLowerCase();

export const PACING_SECONDS = Number(__ENV.PACING_SECONDS || 0.6);

export const MAX_TRANSIENT_RETRIES = Number(__ENV.MAX_TRANSIENT_RETRIES || 2);

const TRANSIENT_HTTP_STATUSES = new Set([0, 429, 502, 503, 504]);

export const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'Accept-Encoding': 'gzip, deflate, br',
};

export const FORM_HEADERS = {
  Accept: 'application/json',
  'Accept-Encoding': 'gzip, deflate, br',
  'Content-Type': 'application/x-www-form-urlencoded',
};

/**
 * Profile catalog covering all 6 professional performance testing types,
 * safely calibrated for the shared public automationexercise.com demo host.
 */
export const PROFILE_METADATA = {
  smoke: {
    title: '1. Smoke / CI Gate',
    description: '2 VUs, 2 iterations — deterministic 100% API 1–14 + duplicate-email verification',
  },
  load: {
    title: '2. Average Load Test',
    description: 'Staged ramp 3 -> 6 VUs (~45s) with 70/20/10 traffic mix & 1–3s think time',
  },
  stress: {
    title: '3. Peak / Stress Test',
    description: 'Stepped ramp 4 -> 8 -> 12 -> 16 VUs (~95s) to locate latency knee point safely',
  },
  spike: {
    title: '4. Spike Recovery Test',
    description: '2 VUs -> sudden jump to 14 VUs -> drop back to 2 VUs (~55s) to measure recovery',
  },
  soak: {
    title: '5. Soak / Endurance Test',
    description: 'Steady 4 VUs for 10m (or SOAK_DURATION) to detect gradual latency/memory drift',
  },
  throughput: {
    title: '6. Constant Arrival Rate (Throughput)',
    description: 'Fixed arrival rate (default 2 iter/s, overridable via TARGET_RPS) for 45s',
  },
};

/**
 * Tiered SLA thresholds calibrated from empirical baseline latency on public internet:
 * - Read-only endpoints (APIs 1, 3): p(95) < 2000ms, p(99) < 3000ms
 * - Search & Auth endpoints (APIs 5–10, 14): p(95) < 2500ms
 * - Write CRUD lifecycle (APIs 11–13): p(95) < 3500ms
 * - Stress/Spike profiles relax error-rate threshold slightly (5%) so knee-point runs report cleanly.
 */
export function getThresholds(profile = TEST_PROFILE) {
  const isDestructiveProfile = profile === 'stress' || profile === 'spike';
  const isSmoke = profile === 'smoke';

  return {
    http_req_failed: [isSmoke ? 'rate<0.02' : 'rate<0.05'],
    http_req_duration: [isDestructiveProfile ? 'p(95)<5000' : 'p(95)<3500'],
    'http_req_duration{tier:read}': [
      isDestructiveProfile ? 'p(95)<3500' : 'p(95)<2000',
      isDestructiveProfile ? 'p(99)<5000' : 'p(99)<3000',
    ],
    'http_req_duration{tier:search_auth}': [isDestructiveProfile ? 'p(95)<4000' : 'p(95)<2500'],
    'http_req_duration{tier:write}': [isDestructiveProfile ? 'p(95)<5000' : 'p(95)<3500'],
    checks: ['rate>0.99'],
    api_contract_failures: ['count==0'],
  };
}

export const THRESHOLDS = getThresholds(TEST_PROFILE);

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
 * Polite pacing helper:
 * - In smoke mode: deterministic short pause (PACING_SECONDS) for fast CI execution.
 * - In performance profiles (load/stress/spike/soak/throughput): randomized human think time (1–3s).
 */
export function thinkTime() {
  if (TEST_PROFILE === 'smoke') {
    sleep(PACING_SECONDS);
    return;
  }
  sleep(1 + Math.random() * 2);
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
 * Returns k6 execution options for the selected TEST_PROFILE.
 */
export function getSuiteOptions() {
  const baseOptions = {
    thresholds: getThresholds(TEST_PROFILE),
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  };

  switch (TEST_PROFILE) {
    case 'load': {
      const hold = __ENV.LOAD_HOLD || '25s';
      return {
        ...baseOptions,
        stages: [
          { duration: '10s', target: 3 },
          { duration: hold, target: 6 },
          { duration: '10s', target: 0 },
        ],
      };
    }

    case 'stress': {
      const maxVus = Number(__ENV.STRESS_MAX_VUS || 16);
      const step1 = Math.max(2, Math.round(maxVus * 0.25));
      const step2 = Math.max(4, Math.round(maxVus * 0.5));
      const step3 = Math.max(6, Math.round(maxVus * 0.75));
      return {
        ...baseOptions,
        stages: [
          { duration: '20s', target: step1 },
          { duration: '20s', target: step2 },
          { duration: '20s', target: step3 },
          { duration: '20s', target: maxVus },
          { duration: '15s', target: 0 },
        ],
      };
    }

    case 'spike': {
      const spikeVus = Number(__ENV.SPIKE_VUS || 14);
      return {
        ...baseOptions,
        stages: [
          { duration: '10s', target: 2 },
          { duration: '5s', target: spikeVus },
          { duration: '15s', target: spikeVus },
          { duration: '5s', target: 2 },
          { duration: '15s', target: 2 },
          { duration: '5s', target: 0 },
        ],
      };
    }

    case 'soak': {
      const soakDuration = __ENV.SOAK_DURATION || '10m';
      const soakVus = Number(__ENV.SOAK_VUS || 4);
      return {
        ...baseOptions,
        stages: [
          { duration: '15s', target: soakVus },
          { duration: soakDuration, target: soakVus },
          { duration: '15s', target: 0 },
        ],
      };
    }

    case 'throughput': {
      const targetRps = Number(__ENV.TARGET_RPS || 2);
      const duration = __ENV.THROUGHPUT_DURATION || '45s';
      return {
        ...baseOptions,
        scenarios: {
          constant_throughput: {
            executor: 'constant-arrival-rate',
            rate: targetRps,
            timeUnit: '1s',
            duration,
            preAllocatedVUs: 4,
            maxVUs: 12,
          },
        },
      };
    }

    case 'smoke':
    default:
      return {
        ...baseOptions,
        vus: 2,
        iterations: 2,
      };
  }
}
