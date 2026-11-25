# k6 API Performance & Functional Verification Strategy

## 1. Document Control
- **System Under Test (SUT):** AutomationExercise Public REST API (`https://automationexercise.com/api/*`)
- **API Documentation Baseline:** `https://automationexercise.com/api_list` (APIs 1–14)
- **Tooling Stack:** Grafana k6 (CLI JavaScript), GitHub (`aldopontoh/automationexercise-k6-api`), Jenkins (`automationexercise-k6-api-ci` on Windows)
- **Roles:** Performance QA Automation Architect, API QA Lead, Strict QA Code Reviewer

## 2. Scope & Objectives
### In Scope
- Functional contract verification across all **14 documented endpoints** (Catalog read, Search, Authentication verification, User Account CRUD lifecycle, and negative/unsupported HTTP method handling).
- Transport-layer HTTP status (`res.status`) **and** logical application-layer JSON status (`body.responseCode`) validation.
- Data-driven search verification using `data/search_terms.csv` via `SharedArray`.
- Controlled performance and latency verification against explicit k6 SLA thresholds (`http_req_failed`, `http_req_duration`, `checks`, and custom contract-failure counter).
- Automated CI/CD execution in Jenkins with archived summary artifacts (`reports/summary.json`).

### Out of Scope
- Stress/soak/DDoS load testing against the shared external demo server (`automationexercise.com`).
- UI/browser functional flows (covered separately by Playwright UI suites).
- Security penetration testing or credential brute-forcing.

## 3. Risk-Based Analysis & Mitigation Matrix

| Risk ID | Risk Description | Likelihood | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | **HTTP 200 False Positives:** AutomationExercise returns HTTP `200 OK` even for `400`, `404`, and `405` logical errors (`{"responseCode": 405, ...}`). Relying solely on `http_req_failed` hides contract regressions. | High | Critical | Parse JSON safely in `lib/assertions.js` and assert **both** HTTP transport status and JSON `responseCode` + `message`/schema fields in every `check()`. Enforce `checks: ['rate>0.99']` and `api_contract_failures: ['count==0']`. |
| **RSK-02** | **External Server Rate-Limiting / Overload:** Aggressive VUs or zero-sleep tight loops could disrupt the public demo server or trigger HTTP 429/5xx throttling. | Medium | High | Cap VU concurrency (`2` VUs default smoke; staged ramp up to `6` VUs max for load), enforce `sleep()` pacing (`0.5s–1.0s`) between calls, and disable concurrent Jenkins builds. |
| **RSK-03** | **Test Data Collision & Orphaned Accounts:** Reusing static emails across concurrent VUs causes `400 Email already exists!` failures or leaves stale accounts on the server. | High | High | Generate collision-free emails per VU/iteration (`vu${__VU}_iter${__ITER}_${Date.now()}_${rand}@testmail.local`) and wrap APIs 7, 14, 13, 8, 9, 10 in `try { ... } finally { deleteAccount }` so API 12 cleanup always executes. |
| **RSK-04** | **Non-JSON Gateway / HTML Error Pages:** Upstream proxy errors or transient 502/503 responses return HTML instead of JSON, crashing unguarded `res.json()` calls. | Medium | Medium | Guard all parsing inside `parseJsonSafe(res)` with `try/catch`, recording clean check failures instead of unhandled runtime exceptions. |
| **RSK-05** | **Form-Encoding Mismatch:** Endpoints expect `application/x-www-form-urlencoded` payloads (not raw JSON bodies) for `POST`, `PUT`, and `DELETE`. | High | High | Centralize URL-encoded body helpers (`buildFormPayload`) and headers (`FORM_HEADERS`) in `lib/config.js` so `POST`, `PUT`, and `DELETE` consistently transmit valid form fields. |

## 4. Load Profiles & Live-Site Safety Guardrails

Six controlled execution profiles are selectable via `-e TEST_PROFILE=<smoke|load|stress|spike|soak|throughput>`:

| Profile | Mode / Executor | VUs / Stages | Pacing / Think Time | Traffic Pattern |
| :--- | :--- | :--- | :--- | :--- |
| **`smoke`** (CI Default) | Shared iterations | `vus: 2`, `iterations: 2` | `0.6s` fixed pacing | Deterministic 100% APIs 1–14 + duplicate-email race check |
| **`load`** (Average Load) | Ramping VUs | `10s -> 3`, `25s -> 6`, `10s -> 0` | `1–3s` randomized think time | 70% Browse/Search, 20% Auth, 10% Account CRUD |
| **`stress`** (Peak / Stress) | Stepped VUs | `20s -> 4`, `20s -> 8`, `20s -> 12`, `20s -> 16`, `15s -> 0` | `1–3s` randomized think time | 70/20/10 weighted mix (safe public-host cap) |
| **`spike`** (Spike Recovery) | Ramping VUs | `10s -> 2`, `5s -> 14`, `15s -> 14`, `5s -> 2`, `15s -> 2`, `5s -> 0` | `1–3s` randomized think time | Measures post-spike latency recovery |
| **`soak`** (Endurance) | Ramping VUs | `15s -> 4`, `10m -> 4`, `15s -> 0` | `1–3s` randomized think time | Detects gradual latency/memory degradation |
| **`throughput`** (Arrival Rate) | `constant-arrival-rate` | `2 iter/s` for `45s` (`preAllocatedVUs: 4`, `maxVUs: 12`) | `1–3s` randomized think time | Fixed arrival-rate throughput capacity test |

## 5. Tiered SLA Thresholds & CI Quality Gates

| Metric / Endpoint Tier | Smoke / Load / Soak / Throughput | Stress / Spike | Rationale |
| :--- | :--- | :--- | :--- |
| `http_req_duration{tier:read}` | `p(95)<2000`, `p(99)<3000` | `p(95)<3500`, `p(99)<5000` | Read-only catalog endpoints (`APIs 1, 3`) stay fast |
| `http_req_duration{tier:search_auth}` | `p(95)<2500` | `p(95)<4000` | Search & auth lookups (`APIs 5–10, 14`) stay responsive |
| `http_req_duration{tier:write}` | `p(95)<3500` | `p(95)<5000` | DB mutation lifecycle (`APIs 11–13`) stays bounded |
| `http_req_duration` (Global) | `p(95)<3500` | `p(95)<5000` | Tightened from `5000ms` based on live baseline (`~650–1500ms`) |
| `http_req_failed` | `rate<0.02` | `rate<0.05` | Stricter 2% transport error budget for CI/load |
| `checks` | `rate>0.99` | `rate>0.99` | Over 99% functional & JSON contract checks must pass |
| `api_contract_failures` | `count==0` | `count==0` | Zero tolerance for JSON `responseCode` or schema violations |

Threshold breach causes `k6` to return exit code `99`, automatically failing the Jenkins pipeline stage.

## 6. Test Data Isolation & Hygiene Policy
- **Static Read-Only Inputs:** `data/search_terms.csv` (tracked in Git, loaded once in init stage via `SharedArray`) provides 5 catalog search terms: `top`, `tshirt`, `jean`, `dress`, `men`.
- **Dynamic Account Inputs:** Every iteration of `scenarios/account-lifecycle.js` synthesizes an ephemeral test account with non-routable domain `@testmail.local` and generated password, never stored in source control.
- **Guaranteed Teardown:** `DELETE /api/deleteAccount` runs inside a `finally` block whenever `createAccount` succeeds.

## 7. Entry & Exit Criteria
### Entry Criteria
- `https://automationexercise.com/api_list` inspected and documented across APIs 1–14.
- `k6` binary installed and verified (`k6 version`).
- Per-module PRDs, ISTQB test case matrices, and `docs/TRACEABILITY.md` completed.

### Exit Criteria
- 100% of APIs 1–14 covered by automated k6 checks with 1:1 `API-REQ -> API-TC` traceability.
- Local smoke execution (`k6 run --vus 2 --iterations 1 scenarios\api-suite.js` and `k6 run scenarios\api-suite.js`) exits with code `0` and 100% checks passing.
- Zero hardcoded secrets or untracked report artifacts committed to Git.
- Jenkins job `automationexercise-k6-api-ci` passes with status `SUCCESS` and archives `reports/summary.json`.
