# AutomationExercise k6 API Performance & Functional Verification Suite

Modular Grafana k6 API test suite validating all 14 REST endpoints documented at [https://automationexercise.com/api_list](https://automationexercise.com/api_list), combining functional contract verification, CSV-driven search testing, self-cleaning user account lifecycles, SLA thresholds, and Windows Jenkins CI/CD execution.

## Repository Layout

```text
automationexercise-k6-api/
├── data/
│   └── search_terms.csv          # CSV data source for API 5 searchProduct variations
├── docs/
│   ├── 00-test-strategy.md       # Risk-based k6 API test strategy & load profiles
│   ├── TRACEABILITY.md           # 100% API -> API-REQ -> API-TC -> k6 mapping
│   ├── prd/
│   │   ├── 00-system-overview.md
│   │   ├── catalog-search-api.md
│   │   └── account-auth-api.md
│   └── test-cases/
│       ├── catalog-search-api.md
│       └── account-auth-api.md
├── lib/
│   ├── assertions.js             # Safe JSON parsing & transport + responseCode checks
│   └── config.js                 # Base URL, headers, load profiles, SLA thresholds
├── reports/                      # Git-ignored runtime output summaries (summary.json)
├── scenarios/
│   ├── account-lifecycle.js      # APIs 7–14 (self-cleaning CRUD + auth negative paths)
│   ├── api-suite.js              # Main orchestrator entry point
│   └── catalog-search.js         # APIs 1–6 (products, brands, unsupported methods, search)
├── .gitignore
├── GEMINI.md                     # Architectural & QA governance rules
├── Jenkinsfile                   # Windows declarative CI/CD pipeline
└── README.md
```

## Prerequisites

- [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed and available on `PATH` (verified with `k6 version`).
- Network access to `https://automationexercise.com`.

## Local Execution Commands

### 1. Default Suite Run (Controlled Smoke Profile)
```cmd
cd /d "D:\Work\Automation Projects\Playwright\automationexercise-k6-api"
k6 run scenarios\api-suite.js
```

### 2. Quick CLI Verification Smoke Run (2 VUs, 2 Shared Iterations = 1 per VU)
```cmd
k6 run --vus 2 --iterations 2 scenarios\api-suite.js
```

### 3. Staged Load Profile (Safe External-Site Ramp: up to 6 VUs)
```cmd
k6 run -e TEST_PROFILE=load --summary-export=reports\summary.json scenarios\api-suite.js
```

### 4. View Visual HTML Report
Every run automatically generates a self-contained visual HTML dashboard in `reports/summary.html` (plus `reports/report.css` and `reports/summary.json`):
```cmd
cd /d "D:\Work\Automation Projects\Playwright\automationexercise-k6-api"
if not exist reports mkdir reports
k6 run scenarios\api-suite.js
start "" "reports\summary.html"
```
In Jenkins, open `http://localhost:8080/job/automationexercise-k6-api-ci/lastSuccessfulBuild/artifact/reports/summary.html`.

## Configured SLA Thresholds

Defined in `lib/config.js` and enforced in `scenarios/api-suite.js`:

| Metric | Threshold | Purpose |
| :--- | :--- | :--- |
| `http_req_failed` | `rate<0.05` | Transport-level HTTP error rate must stay below 5% |
| `http_req_duration` | `p(95)<5000` | 95th percentile response latency must remain under 5,000 ms |
| `checks` | `rate>0.99` | Over 99% of functional & contract checks must pass |
| `api_contract_failures` | `count==0` | Custom counter ensuring zero critical JSON contract violations |

If any threshold fails, `k6` automatically exits with a non-zero exit code (code `99`), failing the Jenkins build.

## Jenkins CI/CD Pipeline (`automationexercise-k6-api-ci`)

The Windows-compatible `Jenkinsfile` executes the following stages:
1. **Checkout**: Pulls branch `main` from `https://github.com/aldopontoh/automationexercise-k6-api.git`.
2. **Verify k6 & Clean Workspace Reports**: Verifies `k6 version` on `PATH` and recreates a clean `reports/` directory.
3. **Run k6 API Suite**: Executes `k6 run --summary-export=reports/summary.json scenarios/api-suite.js` in CLI mode, failing the build if any threshold or check breaches SLA.
4. **Post (Always)**: Archives `reports/**` with `allowEmptyArchive: true` so summary metrics are preserved on both passing and failing runs.
