# PRD 00 — AutomationExercise API System Overview

## 1. Purpose
This Product Requirements Document (PRD) establishes the system-level architecture, transport conventions, and module boundaries for the AutomationExercise REST API (`https://automationexercise.com/api/*`), based on live inspection of `https://automationexercise.com/api_list`.

## 2. System Architecture & Transport Conventions
- **Base URL:** `https://automationexercise.com`
- **API Prefix:** `/api`
- **Request Content-Type:**
  - `GET` endpoints accept query parameters (e.g., `/api/getUserDetailByEmail?email=<email>`).
  - `POST`, `PUT`, and `DELETE` endpoints accept `application/x-www-form-urlencoded` form bodies.
- **Response Content-Type & Status Pattern:**
  - Responses return JSON payloads (often with `text/html; charset=utf-8` or `application/json` headers).
  - **Critical Platform Behavior:** Transport-level HTTP status is typically `200 OK` even when the business outcome is `201` (Created), `400` (Bad Request), `404` (Not Found), or `405` (Method Not Allowed). The authoritative logical status code is always returned in the top-level JSON field `responseCode` (integer), accompanied by either a domain payload (`products`, `brands`, `user`) or a `message` string.

## 3. Complete Endpoint Inventory (APIs 1–14)

| API # | Endpoint | Method | Parameters | Expected `responseCode` | Module |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **API 1** | `/api/productsList` | `GET` | None | `200` | Catalog & Search (`CAT`) |
| **API 2** | `/api/productsList` | `POST` | None | `405` | Catalog & Search (`CAT`) |
| **API 3** | `/api/brandsList` | `GET` | None | `200` | Catalog & Search (`CAT`) |
| **API 4** | `/api/brandsList` | `PUT` | None | `405` | Catalog & Search (`CAT`) |
| **API 5** | `/api/searchProduct` | `POST` | `search_product` (form) | `200` | Catalog & Search (`CAT`) |
| **API 6** | `/api/searchProduct` | `POST` | None (missing `search_product`) | `400` | Catalog & Search (`CAT`) |
| **API 7** | `/api/verifyLogin` | `POST` | `email`, `password` (valid) | `200` | Account & Auth (`ACC`) |
| **API 8** | `/api/verifyLogin` | `POST` | `password` only (missing `email`) | `400` | Account & Auth (`ACC`) |
| **API 9** | `/api/verifyLogin` | `DELETE` | None | `405` | Account & Auth (`ACC`) |
| **API 10** | `/api/verifyLogin` | `POST` | `email`, `password` (invalid) | `404` | Account & Auth (`ACC`) |
| **API 11** | `/api/createAccount` | `POST` | 17 user registration fields (form) | `201` | Account & Auth (`ACC`) |
| **API 12** | `/api/deleteAccount` | `DELETE` | `email`, `password` (form) | `200` | Account & Auth (`ACC`) |
| **API 13** | `/api/updateAccount` | `PUT` | 17 user profile fields (form) | `200` | Account & Auth (`ACC`) |
| **API 14** | `/api/getUserDetailByEmail` | `GET` | `email` (query) | `200` | Account & Auth (`ACC`) |

## 4. Module PRD Index
- [Catalog & Search API PRD](./catalog-search-api.md) — `API-REQ-CAT-01` through `API-REQ-CAT-07`
- [Account & Authentication API PRD](./account-auth-api.md) — `API-REQ-ACC-01` through `API-REQ-ACC-09`
