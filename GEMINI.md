# GEMINI.md — k6 API Performance & Functional Verification Governance

## 1. Repository & Modular Architecture
All k6 source code under `automationexercise-k6-api` MUST follow a strict modular separation of concerns:

- `lib/config.js`: Centralizes `BASE_URL`, default HTTP headers, URL-encoded form payload builders, load profile definitions (`smoke` and `load`), and explicit `options.thresholds`.
- `lib/assertions.js`: Centralizes safe JSON parsing (`parseJsonSafe`) and contract verification helpers (`assertApiResponse`) so no scenario duplicates raw JSON parsing or status checks.
- `scenarios/catalog-search.js`: Covers APIs 1–6 (Products list, Brands list, unsupported methods, and CSV-driven Product Search + negative search validation).
- `scenarios/account-lifecycle.js`: Covers APIs 7–14 (Account creation, login verification, user detail retrieval, profile update, negative/unsupported login calls, and mandatory account deletion cleanup).
- `scenarios/api-suite.js`: Main orchestrator combining scenarios, shared `options`, and CI-enforced SLA thresholds.
- `data/search_terms.csv`: Version-controlled CSV input loaded once per VU pool via `k6/data`'s `SharedArray`.
- `docs/`: Contains the risk-based Test Strategy (`00-test-strategy.md`), per-module PRDs (`prd/`), ISTQB Test Case Matrices (`test-cases/`), and the 1:1 Traceability Matrix (`TRACEABILITY.md`).

## 2. HTTP-200-With-JSON-`responseCode` Rule (Non-Negotiable)
AutomationExercise endpoints frequently return **HTTP 200** at the transport layer even when the logical API outcome is an error (`400`, `404`, `405`) or creation (`201`).

Every API verification MUST:
1. Validate the HTTP transport status (`res.status === 200`, or the explicitly expected transport status when applicable).
2. Parse `res.body` inside a `try/catch` guard (never assume `res.json()` cannot throw on HTML error pages or gateways).
3. Assert the JSON body's `responseCode` field against the documented API contract (`200`, `201`, `400`, `404`, or `405`).
4. Assert expected payload fields (`message`, `products`, `brands`, `user`) inside k6 `check()` blocks.
5. Enforce `checks: ['rate>0.99']` (and `http_req_failed`, `http_req_duration`) in `options.thresholds` so any contract or SLA failure causes k6 to exit with a non-zero status code in CI.

## 3. Live-Site Safety & Dynamic Account Cleanup Rule
- Never run unthrottled load against `https://automationexercise.com`. Keep default VU counts conservative (`2–10 VUs`), use staged ramp-up/steady-state/ramp-down profiles, and include `sleep()` pacing between endpoint calls.
- Every account created via `POST /api/createAccount` (API 11) MUST generate a unique email per VU and iteration (e.g., `vu${__VU}_iter${__ITER}_${Date.now()}_${random}@testmail.local`).
- Every created account MUST be deleted via `DELETE /api/deleteAccount` (API 12) within the same scenario iteration using a `try { ... } finally { ... }` cleanup guard so test data is never orphaned even if an intermediate assertion fails.
- Never hardcode or commit real user credentials, API tokens, or secrets.

## 4. Requirements & Test Case Traceability Rule
- Every atomic functional and performance requirement is defined in `docs/prd/<module>.md` using ID format `API-REQ-<MOD>-XX`.
- Every requirement MUST map 1:1 to an ISTQB test case in `docs/test-cases/<module>.md` using ID format `API-TC-<MOD>-XX`.
- `docs/TRACEABILITY.md` MUST maintain a complete 100% forward and backward mapping:
  `API Endpoint (API 1–14) -> API-REQ-<MOD>-XX -> API-TC-<MOD>-XX -> k6 File / Function / Check Name`.
- Any change to an endpoint contract, assertion, or threshold requires updating the corresponding PRD, test case matrix, and `docs/TRACEABILITY.md` in the same commit.
