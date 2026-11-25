# Requirements & Test Case Traceability Matrix

This document maintains 100% forward and backward traceability across all **14 AutomationExercise APIs**, **16 atomic PRD requirements (`API-REQ-*`)**, **16 ISTQB test cases (`API-TC-*`)**, and their corresponding **k6 implementation symbols and checks**.

## Summary Metrics
- **Documented APIs Covered:** 14 / 14 (100%) + Duplicate-Email Idempotency Check
- **Total Requirements (`API-REQ-*`):** 17 (7 Catalog/Search + 10 Account/Auth)
- **Total Test Cases (`API-TC-*`):** 17 (1:1 mapped to requirements)
- **Orphan Requirements / Unmapped Test Cases:** 0

## End-to-End Traceability Table

| API # | Endpoint & Method | PRD Requirement ID | Test Case ID | k6 File | k6 Function / Export | k6 Check / Threshold Identifier |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **API 1** | `GET /api/productsList` | `API-REQ-CAT-01` | `API-TC-CAT-01` | `scenarios/catalog-search.js` | `runCatalogSearchScenario()` | `API 1 - GET /api/productsList` (`assertApiResponse`) |
| **API 2** | `POST /api/productsList` | `API-REQ-CAT-02` | `API-TC-CAT-02` | `scenarios/catalog-search.js` | `runCatalogSearchScenario()` | `API 2 - POST /api/productsList (405)` (`assertApiResponse`) |
| **API 3** | `GET /api/brandsList` | `API-REQ-CAT-03` | `API-TC-CAT-03` | `scenarios/catalog-search.js` | `runCatalogSearchScenario()` | `API 3 - GET /api/brandsList` (`assertApiResponse`) |
| **API 4** | `PUT /api/brandsList` | `API-REQ-CAT-04` | `API-TC-CAT-04` | `scenarios/catalog-search.js` | `runCatalogSearchScenario()` | `API 4 - PUT /api/brandsList (405)` (`assertApiResponse`) |
| **API 5** | `POST /api/searchProduct` (CSV valid) | `API-REQ-CAT-05` | `API-TC-CAT-05` | `scenarios/catalog-search.js` | `runCatalogSearchScenario()` | `API 5 - POST /api/searchProduct (CSV valid)` (`assertApiResponse`) |
| **API 6** | `POST /api/searchProduct` (missing param) | `API-REQ-CAT-06` | `API-TC-CAT-06` | `scenarios/catalog-search.js` | `runCatalogSearchScenario()` | `API 6 - POST /api/searchProduct (missing param 400)` (`assertApiResponse`) |
| **APIs 1–6** | Catalog & Search SLA | `API-REQ-CAT-07` | `API-TC-CAT-07` | `lib/config.js`, `scenarios/api-suite.js` | `THRESHOLDS`, `getSuiteOptions()` | `http_req_failed`, `http_req_duration`, `checks`, `api_contract_failures` |
| **API 11** | `POST /api/createAccount` | `API-REQ-ACC-01` | `API-TC-ACC-01` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 11 - POST /api/createAccount (201)` (`assertApiResponse`) |
| **API 7** | `POST /api/verifyLogin` (valid) | `API-REQ-ACC-02` | `API-TC-ACC-02` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 7 - POST /api/verifyLogin (valid 200)` (`assertApiResponse`) |
| **API 14** | `GET /api/getUserDetailByEmail` | `API-REQ-ACC-03` | `API-TC-ACC-03` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 14 - GET /api/getUserDetailByEmail (200)` (`assertApiResponse`) |
| **API 13** | `PUT /api/updateAccount` | `API-REQ-ACC-04` | `API-TC-ACC-04` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 13 - PUT /api/updateAccount (200)` (`assertApiResponse`) |
| **API 8** | `POST /api/verifyLogin` (missing email) | `API-REQ-ACC-05` | `API-TC-ACC-05` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 8 - POST /api/verifyLogin (missing email 400)` (`assertApiResponse`) |
| **API 9** | `DELETE /api/verifyLogin` | `API-REQ-ACC-06` | `API-TC-ACC-06` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 9 - DELETE /api/verifyLogin (405)` (`assertApiResponse`) |
| **API 10** | `POST /api/verifyLogin` (invalid) | `API-REQ-ACC-07` | `API-TC-ACC-07` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 10 - POST /api/verifyLogin (invalid 404)` (`assertApiResponse`) |
| **API 12** | `DELETE /api/deleteAccount` (cleanup) | `API-REQ-ACC-08` | `API-TC-ACC-08` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` (`finally`) | `API 12 - DELETE /api/deleteAccount (cleanup 200)` (`assertApiResponse`) |
| **APIs 7–14** | Account Lifecycle SLA & Hygiene | `API-REQ-ACC-09` | `API-TC-ACC-09` | `lib/config.js`, `scenarios/account-lifecycle.js` | `buildUniqueTestUser()`, `getThresholds()` | `http_req_failed`, `http_req_duration{tier:search_auth}`, `http_req_duration{tier:write}`, `checks`, `api_contract_failures` |
| **API 11 (Dup)** | `POST /api/createAccount` (duplicate email) | `API-REQ-ACC-10` | `API-TC-ACC-10` | `scenarios/account-lifecycle.js` | `runAccountLifecycleScenario()` | `API 11 - POST /api/createAccount (duplicate email 400)` (`assertApiResponse`) |
