# AutomationExercise k6 API Performance & Functional Verification Suite

Modular Grafana k6 API performance & functional verification suite validating all 14 REST endpoints documented at [https://automationexercise.com/api_list](https://automationexercise.com/api_list) across **6 professional performance profiles**, tiered per-endpoint SLA thresholds, realistic e-commerce 70/20/10 traffic weighting, self-cleaning user lifecycles, dual visual HTML dashboards, and Windows Jenkins CI/CD.

## Repository Layout

```text
automationexercise-k6-api/
├── data/
│   └── search_terms.csv          # CSV data source for API 5 searchProduct variations
├── docs/
│   ├── 00-test-strategy.md       # Risk-based k6 API test strategy & 6 load profiles
│   ├── TRACEABILITY.md           # 100% API -> API-REQ -> API-TC -> k6 mapping
│   ├── prd/                      # Per-module PRDs (API-REQ-CAT-01..07, API-REQ-ACC-01..10)
│   └── test-cases/               # ISTQB Test Case Matrices (1:1 mapped)
├── lib/
│   ├── assertions.js             # Safe JSON parsing & transport + responseCode checks
│   ├── config.js                 # 6 performance profiles, tiered SLAs, retry & thinkTime
│   ├── html-reporter.js          # CSP-safe dark Grafana-style SVG visual dashboard
│   └── metrics.js                # Custom per-tier latency, payload size & traffic mix metrics
├── reports/                      # Git-ignored outputs (dashboard.html, summary.html, summary.json)
├── scenarios/
│   ├── account-lifecycle.js      # APIs 7–14 + duplicate-email 400 race check + cleanup
│   ├── api-suite.js              # Main orchestrator (smoke deterministic; load 70/20/10 mix)
│   └── catalog-search.js         # APIs 1–6 (products, brands, unsupported methods, CSV search)
├── .gitignore
├── GEMINI.md
├── Jenkinsfile                   # Windows CI/CD pipeline archiving HTML & JSON dashboards
└── README.md
```

## 6 Professional Performance Profiles (`-e TEST_PROFILE=<name>`)

All profiles are safely calibrated for the public `automationexercise.com` demo server and support exporting k6's native interactive time-series dashboard (`reports/dashboard.html`) alongside our Jenkins-CSP-safe SVG dashboard (`reports/summary.html`):

| Profile | Command (Windows CMD) | VUs / Ramp | Traffic Pattern |
| :--- | :--- | :--- | :--- |
| **1. `smoke`** (CI Default) | `set K6_WEB_DASHBOARD=true&& set K6_WEB_DASHBOARD_PERIOD=3s&& set K6_WEB_DASHBOARD_EXPORT=reports\dashboard.html&& k6 run scenarios\api-suite.js` | `2 VUs`, `2 iters` | Deterministic 100% APIs 1–14 + duplicate-email check |
| **2. `load`** (Average Load) | `set K6_WEB_DASHBOARD=true&& set K6_WEB_DASHBOARD_PERIOD=3s&& set K6_WEB_DASHBOARD_EXPORT=reports\dashboard.html&& k6 run -e TEST_PROFILE=load scenarios\api-suite.js` | `10s -> 3`, `25s -> 6`, `10s -> 0` | 70/20/10 weighted mix + 1–3s think time |
| **3. `stress`** (Peak / Stress) | `set K6_WEB_DASHBOARD=true&& set K6_WEB_DASHBOARD_PERIOD=3s&& set K6_WEB_DASHBOARD_EXPORT=reports\dashboard.html&& k6 run -e TEST_PROFILE=stress scenarios\api-suite.js` | `4 -> 8 -> 12 -> 16 -> 0` | 70/20/10 mix (override via `-e STRESS_MAX_VUS=20`) |
| **4. `spike`** (Spike Recovery) | `set K6_WEB_DASHBOARD=true&& set K6_WEB_DASHBOARD_PERIOD=3s&& set K6_WEB_DASHBOARD_EXPORT=reports\dashboard.html&& k6 run -e TEST_PROFILE=spike scenarios\api-suite.js` | `2 -> 14 (15s) -> 2 -> 0` | Measures post-spike latency recovery |
| **5. `soak`** (Endurance) | `set K6_WEB_DASHBOARD=true&& set K6_WEB_DASHBOARD_PERIOD=5s&& set K6_WEB_DASHBOARD_EXPORT=reports\dashboard.html&& k6 run -e TEST_PROFILE=soak -e SOAK_DURATION=10m scenarios\api-suite.js` | Steady `4 VUs` for `10m` | Detects gradual latency drift / memory leaks |
| **6. `throughput`** (Arrival Rate) | `set K6_WEB_DASHBOARD=true&& set K6_WEB_DASHBOARD_PERIOD=3s&& set K6_WEB_DASHBOARD_EXPORT=reports\dashboard.html&& k6 run -e TEST_PROFILE=throughput -e TARGET_RPS=2 scenarios\api-suite.js` | `constant-arrival-rate` (`2/s`, `45s`) | Forces fixed arrival rate regardless of latency |

## Tiered SLA Thresholds (`lib/config.js`)

| Metric / Endpoint Tier | Smoke / Load / Soak / Throughput | Stress / Spike |
| :--- | :--- | :--- |
| `http_req_duration{tier:read}` (APIs 1, 3) | `p(95)<2000`, `p(99)<3000` | `p(95)<3500`, `p(99)<5000` |
| `http_req_duration{tier:search_auth}` (APIs 5–10, 14) | `p(95)<2500` | `p(95)<4000` |
| `http_req_duration{tier:write}` (APIs 11–13) | `p(95)<3500` | `p(95)<5000` |
| `http_req_duration` (Global) | `p(95)<3500` | `p(95)<5000` |
| `http_req_failed` | `rate<0.02` | `rate<0.05` |
| `checks` | `rate>0.99` | `rate>0.99` |
| `api_contract_failures` | `count==0` | `count==0` |

## Viewing the Visual Dashboards

1. **Interactive k6 Native Time-Series Web Dashboard (Picture 3 UI):**
   - Local: `start "" "D:\Work\Automation Projects\Playwright\automationexercise-k6-api\reports\dashboard.html"`
   - Jenkins Artifact: `http://localhost:8080/job/automationexercise-k6-api-ci/lastSuccessfulBuild/artifact/reports/dashboard.html` *(download & open locally if Jenkins default CSP blocks inline JS)*
2. **CSP-Safe Dark SVG Performance Dashboard (renders natively inside Jenkins UI):**
   - Local: `start "" "D:\Work\Automation Projects\Playwright\automationexercise-k6-api\reports\summary.html"`
   - Jenkins Artifact: `http://localhost:8080/job/automationexercise-k6-api-ci/lastSuccessfulBuild/artifact/reports/summary.html`
