# PRD — Catalog & Search API Module (`CAT`)

## 1. Module Scope
Covers AutomationExercise **APIs 1–6**: product catalog retrieval, brand directory retrieval, unsupported HTTP method rejection, and keyword-based product search (positive CSV-driven queries and negative missing-parameter validation).

## 2. Atomic Requirements & Acceptance Criteria

### `API-REQ-CAT-01` — Retrieve All Products List (API 1)
- **Endpoint:** `GET /api/productsList`
- **Priority:** P0 (Critical)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** the AutomationExercise catalog API is reachable,
  - **When** a client sends an HTTP `GET` request to `/api/productsList`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 200`, and `products` is a non-empty array where the first element contains `id`, `name`, `price`, `brand`, and `category`.

### `API-REQ-CAT-02` — Reject Unsupported POST on Products List (API 2)
- **Endpoint:** `POST /api/productsList`
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** `/api/productsList` only supports read operations,
  - **When** a client sends an HTTP `POST` request to `/api/productsList`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 405`, and `message` equals `"This request method is not supported."`.

### `API-REQ-CAT-03` — Retrieve All Brands List (API 3)
- **Endpoint:** `GET /api/brandsList`
- **Priority:** P0 (Critical)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** the AutomationExercise catalog API is reachable,
  - **When** a client sends an HTTP `GET` request to `/api/brandsList`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 200`, and `brands` is a non-empty array where the first element contains `id` and `brand`.

### `API-REQ-CAT-04` — Reject Unsupported PUT on Brands List (API 4)
- **Endpoint:** `PUT /api/brandsList`
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** `/api/brandsList` only supports read operations,
  - **When** a client sends an HTTP `PUT` request to `/api/brandsList`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 405`, and `message` equals `"This request method is not supported."`.

### `API-REQ-CAT-05` — Search Products with Valid CSV Terms (API 5)
- **Endpoint:** `POST /api/searchProduct`
- **Request Body (`application/x-www-form-urlencoded`):** `search_product=<term>` sourced from `data/search_terms.csv` (`top`, `tshirt`, `jean`, `dress`, `men`).
- **Priority:** P0 (Critical)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** a valid search keyword loaded from `data/search_terms.csv`,
  - **When** a client sends an HTTP `POST` request to `/api/searchProduct` with form parameter `search_product`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 200`, and `products` is a non-empty array whose entries include `id`, `name`, and `price`.

### `API-REQ-CAT-06` — Reject Product Search Missing `search_product` Parameter (API 6)
- **Endpoint:** `POST /api/searchProduct`
- **Request Body:** Empty / omitted `search_product` field.
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** `search_product` is a mandatory parameter for product search,
  - **When** a client sends an HTTP `POST` request to `/api/searchProduct` without `search_product`,
  - **Then** the transport status is `200`, the JSON body contains `responseCode === 400`, and `message` equals `"Bad request, search_product parameter is missing in POST request."`.

### `API-REQ-CAT-07` — Catalog & Search Performance SLA Compliance
- **Endpoints:** All endpoints in `scenarios/catalog-search.js` (APIs 1–6)
- **Priority:** P1 (High)
- **Acceptance Criteria (Given/When/Then):**
  - **Given** the k6 suite runs under configured `smoke` or `load` profiles with controlled pacing,
  - **When** APIs 1–6 are executed across VUs,
  - **Then** transport failure rate stays `< 5%` (`http_req_failed: rate<0.05`), 95th percentile latency stays `< 5000ms` (`http_req_duration: p(95)<5000`), and functional check pass rate stays `> 99%` (`checks: rate>0.99`).
