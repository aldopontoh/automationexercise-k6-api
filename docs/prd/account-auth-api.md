# PRD — Account & Authentication API Module (`ACC`)

## 1. Module Scope
Covers AutomationExercise **APIs 7–14**: end-to-end self-cleaning user account registration, credential verification (valid, missing parameter, unsupported HTTP method, invalid credentials), user detail retrieval by email, account profile update, and mandatory account deletion teardown.

## 2. Atomic Requirements & Acceptance Criteria

### `API-REQ-ACC-01` — Register New User Account with Unique Dynamic Email (API 11)
- **Endpoint:** `POST /api/createAccount`
- **Request Body (`application/x-www-form-urlencoded`):** `name`, `email` (unique per VU/iteration), `password`, `title`, `birth_date`, `birth_month`, `birth_year`, `firstname`, `lastname`, `company`, `address1`, `address2`, `country`, `zipcode`, `state`, `city`, `mobile_number`.
- **Priority:** P0 (Critical)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** a uniquely generated test user payload for the current VU and iteration,
  - **When** a client sends an HTTP `POST` request to `/api/createAccount`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 201`, and `message` equals `"User created!"`.

### `API-REQ-ACC-02` — Verify Login with Valid Credentials (API 7)
- **Endpoint:** `POST /api/verifyLogin`
- **Request Body (`application/x-www-form-urlencoded`):** `email`, `password` (matching the account created in `API-REQ-ACC-01`).
- **Priority:** P0 (Critical)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** a registered user account exists from `API-REQ-ACC-01`,
  - **When** a client sends an HTTP `POST` request to `/api/verifyLogin` with valid `email` and `password`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 200`, and `message` equals `"User exists!"`.

### `API-REQ-ACC-03` — Retrieve User Account Detail by Email (API 14)
- **Endpoint:** `GET /api/getUserDetailByEmail?email=<email>`
- **Priority:** P0 (Critical)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** a registered user account exists,
  - **When** a client sends an HTTP `GET` request to `/api/getUserDetailByEmail` with query parameter `email`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 200`, and `user` is an object whose `email` and `name` match the registered user.

### `API-REQ-ACC-04` — Update Existing User Account Profile (API 13)
- **Endpoint:** `PUT /api/updateAccount`
- **Request Body (`application/x-www-form-urlencoded`):** Same 17 account fields with updated profile attributes (`name`, `company`, `city`) and valid `email`/`password`.
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** a registered user account exists,
  - **When** a client sends an HTTP `PUT` request to `/api/updateAccount` with updated profile values,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 200`, and `message` equals `"User updated!"`.

### `API-REQ-ACC-05` — Reject Verify Login Missing `email` Parameter (API 8)
- **Endpoint:** `POST /api/verifyLogin`
- **Request Body (`application/x-www-form-urlencoded`):** `password` only (`email` omitted).
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** both `email` and `password` are mandatory for login verification,
  - **When** a client sends an HTTP `POST` request to `/api/verifyLogin` with only `password`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 400`, and `message` equals `"Bad request, email or password parameter is missing in POST request."`.

### `API-REQ-ACC-06` — Reject Unsupported DELETE on Verify Login (API 9)
- **Endpoint:** `DELETE /api/verifyLogin`
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** `/api/verifyLogin` does not support HTTP `DELETE`,
  - **When** a client sends an HTTP `DELETE` request to `/api/verifyLogin`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 405`, and `message` equals `"This request method is not supported."`.

### `API-REQ-ACC-07` — Reject Verify Login with Invalid Credentials (API 10)
- **Endpoint:** `POST /api/verifyLogin`
- **Request Body (`application/x-www-form-urlencoded`):** Non-existent `email` and invalid `password`.
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** credentials that do not correspond to any registered user,
  - **When** a client sends an HTTP `POST` request to `/api/verifyLogin`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 404`, and `message` equals `"User not found!"`.

### `API-REQ-ACC-08` — Delete Created User Account Cleanup (API 12)
- **Endpoint:** `DELETE /api/deleteAccount`
- **Request Body (`application/x-www-form-urlencoded`):** `email`, `password` of the dynamically created test user.
- **Priority:** P0 (Critical — Data Hygiene Guardrail)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** a test user account was created during the current scenario iteration,
  - **When** the scenario reaches teardown (`finally` block) and sends `DELETE /api/deleteAccount` with the user's `email` and `password`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 200`, and `message` equals `"Account deleted!"`, leaving zero orphaned test accounts.

### `API-REQ-ACC-09` — Account Lifecycle Performance SLA & Isolation
- **Endpoints:** All endpoints in `scenarios/account-lifecycle.js` (APIs 7–14)
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** multiple VUs execute isolated account lifecycles with unique dynamic emails and pacing `sleep()`,
  - **When** the full CRUD + auth flow executes,
  - **Then** no VU collides on email registration, all SLA thresholds pass (`http_req_failed < 0.05`, `http_req_duration p(95) < 5000ms`, `checks > 0.99`), and every created account is deleted before iteration exit.
