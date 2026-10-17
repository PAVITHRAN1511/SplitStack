# SplitStack — Phase P11 Technical Audit Report
**Review 3: Authentication and REST API Endpoints**
**Date:** 2026-10-17  
**Branch:** `refurbish`  
**Starting Commit:** `313f69f Review 3: MongoDB connection and Mongoose models`  

---

## 1. Executive Summary & Objective

Phase **P11** implements the complete authentication layer and REST API resource routing for SplitStack under the Review 3 Node.js and Express architecture. Building directly on the foundation established in Step P9 and the Mongoose data models established in Step P10, this phase delivers secure, production-grade authentication and per-resource REST endpoints while strictly enforcing per-user data isolation, group role authorization, and monetary validation in integer paise.

### Scope Boundaries Preserved:
- **Legacy Preservation:** All legacy Flask application files (`app.py`, `config.py`, `modules/`, `database/`, `templates/`, `static/`, `tests/`) and existing audit evidence in `docs/audit/` remain completely intact.
- **P12 Deferral:** Binary multipart file upload and Tesseract server-side OCR processing pipeline remain deferred to Step P12.
- **P13 Deferral:** Client frontend data layer migration from `localStorage` to `/api` `fetch()` remains deferred to Step P13.
- **Database Honesty:** Unit, schema, and API route tests run in an isolated test environment without claiming live database connectivity against an unverified external MongoDB daemon.

---

## 2. Authentication & Security Architecture

### 2.1 Password Hashing with Bcrypt
- **Library:** `bcryptjs` (^3.0.3), a pure JavaScript implementation ensuring deterministic, zero-native-compilation compatibility across platforms and CI environments.
- **Cost Factor:** Configured for 12 salt rounds (`config.bcryptRounds = 12`).
- **Plaintext Security:** Plaintext passwords are never persisted to MongoDB, never held in long-lived state, never included in logs or error messages, and never returned in API payloads.
- **JSON Serialization Guard:** Mongoose's `User.schema.options.toJSON.transform` strips `passwordHash`, `salt`, and `__v` automatically from all document serializations.

### 2.2 Token & Session Management
- **Token Mechanism:** Cryptographically signed JSON Web Tokens (`jsonwebtoken` ^9.0.3) containing `{ userId, email }`.
- **Secret Management:** Secrets are read from `process.env.JWT_SECRET` with production assertions (throws error if unconfigured in production) and a safe dummy fallback in development.
- **Dual Transport:**
  1. `Authorization: Bearer <token>` header (preferred for programmatic and fetch clients).
  2. `HttpOnly` cookie (`splitstack_token`) configured with `sameSite: 'lax'`, `path: '/'`, and `secure: isProduction`.
- **Session Invalidation:** Logout endpoint (`POST /api/auth/logout`) clears the cookie and terminates client sessions.

### 2.3 Account Enumeration & Brute-Force Defense
- **Generic Login Failure:** When authentication fails (whether the email does not exist or the password does not match), the server returns an identical HTTP 401 Unauthorized response: `"Invalid email or password."`.
- **In-Memory Rate Limiting:** An in-memory sliding-window rate limiter (`server/src/middleware/rateLimit.js`) tracks IP request frequencies, blocking more than 15 authentication attempts within a 15-minute window with HTTP 429 Too Many Requests and a standard `Retry-After` header.

### 2.4 Authorization Middleware (`requireAuth`)
- Derives user identity strictly from verified token claims (`decoded.userId`), never trusting client-supplied user IDs in request bodies or query parameters.
- Rejects unauthenticated or tampered requests with HTTP 401 Unauthorized.

---

## 3. REST API Endpoint Mapping & Controllers

All REST resource controllers are organized modularly under `server/src/routes/` and mounted onto `/api` via `server/src/routes/index.js`:

| Route Prefix | Source File | Endpoints Implemented | Key Safeguards & Authorization Rules |
|---|---|---|---|
| `/api/auth` | `server/src/routes/auth.js` | `POST /register`, `POST /login`, `POST /logout`, `GET /me`, `PATCH /profile`, `POST /change-password` | Bcrypt hashing, email normalization, rate limiting, generic 401, cookie clearing. |
| `/api/expenses` | `server/src/routes/expenses.js` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` | Scoped strictly to `user: req.userId`; positive integer paise validation; pagination & sorting. |
| `/api/income` | `server/src/routes/income.js` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` | Scoped strictly to `user: req.userId`; positive integer paise validation; pagination & sorting. |
| `/api/categories` | `server/src/routes/categories.js` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` | Built-in system categories (`user: null`) protected from edit/delete with HTTP 403 Forbidden. |
| `/api/budgets` | `server/src/routes/budgets.js` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` | Monthly spending rollups calculated live from `Expense`; month-over-month alerts (`ok`, `caution`, `warning`, `danger`); upsert logic on `POST`. |
| `/api/recurring` | `server/src/routes/recurring.js` | `GET /`, `POST /`, `PATCH /:id/toggle`, `DELETE /:id` | User ownership check; frequency enums; active state toggling. |
| `/api/groups` | `server/src/routes/groups.js` | `GET /`, `POST /`, `GET /:id`, `POST /:id/members`, `DELETE /:id/members/:userId`, `POST /:id/leave`, `GET /:id/balances`, `GET /:id/member-stats`, `GET /:id/suggested-settlements`, `GET /:id/settlements`, `POST /:id/settlements`, `DELETE /:id/settlements/:settlementId`, `GET /:id/expenses`, `POST /:id/expenses`, `DELETE /:id/expenses/:expenseId` | Membership verification on every access; admin-only member removal; zero-balance check on leave; anti-self-settlement guard; debt limit check; greedy simplification. |
| `/api/shopping` | `server/src/routes/shopping.js` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/items`, `PATCH /:id/items/:itemId/toggle`, `PATCH /:id/items/:itemId`, `DELETE /:id/items/:itemId`, `POST /:id/convert-expense` | Accessible to personal owner or group members; checklist item purchasing; duplicate conversion protection (`409 Conflict`). |
| `/api/analytics` | `server/src/routes/analytics.js` | `GET /monthly`, `GET /categories`, `GET /forecast`, `GET /insights` | 6-month historical trends; category spending breakdown; velocity spending projection; financial alerts. |
| `/api/notifications` | `server/src/routes/notifications.js`| `GET /`, `PATCH /:id/read`, `POST /mark-all-read` | Unread badge counts; persistent read notification arrays in user preferences. |
| `/api/search` | `server/src/routes/search.js` | `GET /` | Multi-collection keyword search across expenses, income, groups, and shopping lists. |
| `/api/receipts` | `server/src/routes/receipts.js` | `GET /`, `GET /:id` | User metadata listing and retrieval (OCR upload deferred to P12). |

---

## 4. Domain Parity & Shared Algorithms

The server directly imports and utilizes the existing, audited domain algorithms from the client codebase via `server/src/utils/domain.js`:
- `calculateEqualSplit({ amount, participants, payerId })` from `client/js/domain/splits.js`
- `validateCustomShares({ amount, shares, allowedMemberIds })` from `client/js/domain/splits.js`
- `calculateNetBalances({ members, expenses, settlements })` from `client/js/domain/settle.js`
- `simplifyDebts(members, balances)` from `client/js/domain/settle.js`
- `calculateForecast(...)` from `client/js/domain/forecast.js`
- `generateInsights(...)` from `client/js/domain/insights.js`

This guarantees complete computational parity between client and server without code duplication.

---

## 5. Verification & Test Execution Results

All server and client test suites were executed and verified locally:

### 5.1 Server Test Suite (`npm run test:server`)
```bash
node --test "server/tests/**/*.test.js"
```
**Results:**
- **Test Suites:** 33 passed, 33 total
- **Tests:** 88 passed, 88 total (0 failures, 0 cancelled, 0 skipped)
  - `server/tests/server.test.js`: 7 tests (health check, 404 handler, JSON parsing, error handling, static serving)
  - `server/tests/models.test.js`: 31 tests (12 Mongoose models, integer paise validation, URI sanitization)
  - `server/tests/auth.test.js`: 17 tests (bcrypt hashing, JWT signatures, registration validation, generic 401, cookie auth, rate limiting)
  - `server/tests/api.test.js`: 33 tests (unauthenticated 401 guards across 19 routes, malformed ObjectId handling, paise constraints, system category protection, domain algorithm execution)

### 5.2 Client Test Suite (`npm run test:client`)
```bash
node --test "tests/client/**/*.test.mjs"
```
**Results:**
- **Test Suites:** 52 passed, 52 total
- **Tests:** 176 passed, 176 total (0 failures)

### 5.3 HTML Markup & Linting (`npm run lint:html`)
```bash
html-validate "client/**/*.html"
```
**Results:**
- 25 of 25 HTML files checked; 0 errors or warnings.

---

## 6. Live Database Disclosure

- **Live MongoDB Connection:** **Not tested against a live database instance in this review step.**
- **Rationale:** Standard practice for isolated unit and endpoint testing is to run independently of persistent external daemons. The Express app and Mongoose schemas are verified to load, validate, route, and protect without requiring a live connection. Live MongoDB Atlas connection testing is scheduled for subsequent end-to-end integration phases.

---

## 7. Audit Checklist & Verification Status

| Requirement | Implementation Evidence | Status |
|---|---|---|
| Bcrypt password hashing | `server/src/services/authService.js` uses `bcryptjs` with cost factor 12 | **VERIFIED** |
| Password hash protection | `User.js` `toJSON` strips `passwordHash` and `salt`; never returned in responses | **VERIFIED** |
| Generic login error | `authService.js` returns `"Invalid email or password."` for non-existent users and bad passwords | **VERIFIED** |
| Token / cookie session | JWT signed with `JWT_SECRET`; HttpOnly cookie with Lax/Secure configured | **VERIFIED** |
| Rate limiting | In-memory sliding window on `/api/auth/register` and `/api/auth/login` | **VERIFIED** |
| Per-user data isolation | Every personal resource query strictly scoped to `{ user: req.userId }` | **VERIFIED** |
| Group role authorization | Group access checks `members.user`; member removal requires admin role | **VERIFIED** |
| Monetary validation | All amount inputs verified as positive integer paise | **VERIFIED** |
| Malformed ID handling | `validateObjectId` catches bad ObjectIds and returns 400 Bad Request | **VERIFIED** |
| Legacy preservation | Flask application and all audit files preserved untouched | **VERIFIED** |

**Conclusion:** Phase **P11 is COMPLETE**. The codebase is verified, secure, and ready for Review 3 Step P12.
