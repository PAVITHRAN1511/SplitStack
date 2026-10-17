# SplitStack Backend Server

Node.js, Express, and MongoDB backend for SplitStack (**Review 3, Steps P9, P10, P11, and P12**).

## Overview

The server provides the complete REST API, authentication layer, file storage, and data persistence foundation for SplitStack:
- **ES Module Architecture**: Native ES modules throughout (`"type": "module"`).
- **Express Server**: Configured with JSON body parsing (100kb limit), cookie parsing, static client hosting, health checks, 404 handler, and centralized error handling.
- **Authentication & Security (Step P11)**:
  - **Password Hashing**: Industry-standard `bcryptjs` with configurable cost factor (default 12 salt rounds). Plaintext passwords are never stored, logged, or returned.
  - **Session & Token Management**: Cryptographically signed JSON Web Tokens (JWT) supporting both `Authorization: Bearer <token>` headers and `HttpOnly` cookies (`SameSite: Lax`, `Secure` in production).
  - **Account Enumeration Defense**: Generic login error messages prevent attackers from discovering whether an email exists.
  - **Rate Limiting**: Sliding-window in-memory rate limiter protecting sensitive authentication endpoints against brute-force attempts.
  - **User Isolation & Ownership**: Authorization middleware (`requireAuth`) derives authenticated identity strictly from verified token claims and strictly isolates data across users and groups.
- **Secure Receipt Upload & Binary Validation (Step P12)**:
  - **Multipart Parsing**: Multer middleware with memory buffering and a conservative 5 MB file size limit (`MAX_RECEIPT_SIZE_BYTES`).
  - **Deep Content Inspection**: Binary magic byte verification (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WEBP `RIFF`+`WEBP`). Client-supplied MIME types and extensions are treated as untrusted hints; spoofed files are rejected with 400 Bad Request.
  - **Server-Controlled Unique Identifiers**: Storage keys are generated as `receipt_${timestamp}_${randomUUID}.${verifiedExt}`, completely neutralizing path traversal and file overwrite attacks.
  - **GridFS Binary Storage**: Durable image storage backed by MongoDB GridFS (`receipts` bucket) with streaming retrieval and in-memory fallback for automated testing.
  - **Compensating Cleanup**: Automatic deletion of stored image binaries if database metadata persistence or OCR processing fails, preventing orphaned storage leaks.
- **Server-Side OCR Pipeline (Step P12)**:
  - **Tesseract.js Engine**: Optical character recognition performed server-side on validated image buffers with configurable language (`OCR_LANGUAGE`, default `eng`).
  - **Domain Candidate Parsing**: Best-effort extraction of merchant name, transaction date, total amount in integer paise, and confidence score.
  - **Untrusted Suggestion Model**: OCR outputs are strictly treated as draft candidates. No expense is created until the user explicitly reviews and confirms via `POST /api/receipts/:id/confirm`.
  - **Duplicate Protection**: Receipts are marked `status: 'confirmed'`, rejecting duplicate expense conversion with 409 Conflict.
- **MongoDB Connection Management**: Dedicated connection module (`server/src/db.js`) reading `MONGODB_URI` with credential sanitization, connection event logging, and graceful shutdown.
- **Mongoose Data Models**: 12 fully typed, normalized schemas matching the SplitStack domain with integer-paise monetary arithmetic, embedding optimizations, and strict validation.
- **Shared Domain Algorithms**: Direct server reuse of authoritative client algorithms for equal splitting, custom shares validation, net balance calculation, and greedy debt simplification.
- **Automated Tests**: Comprehensive test suites (123 tests across 43 suites) covering health check, 404/error handling, Mongoose models, authentication, security rate limiting, parameter validation, REST API ownership isolation, receipt uploads, magic byte validation, storage lifecycle, and OCR processing.

## Directory Structure

```
server/
├── .env.example            # Example environment configuration template
├── package.json            # Server package manifest (dependencies: express, mongoose, bcryptjs, jsonwebtoken, cookie-parser, multer, tesseract.js, dotenv)
├── package-lock.json       # Dependency lockfile
├── README.md               # Server documentation
├── src/
│   ├── app.js              # Express application factory, middleware, routes mounting, and error handling
│   ├── config.js           # Centralized environment configuration
│   ├── db.js               # MongoDB connection lifecycle & URI sanitization
│   ├── index.js            # HTTP server entry point & graceful shutdown handler
│   ├── middleware/
│   │   ├── auth.js         # JWT verification, cookie extraction, requireAuth / optionalAuth
│   │   ├── rateLimit.js    # In-memory sliding-window rate limiter
│   │   ├── upload.js       # Multer multipart parsing & magic byte content inspection (P12)
│   │   └── validate.js     # ObjectId validation and positive/non-negative paise checks
│   ├── models/             # Mongoose domain models
│   │   ├── index.js        # Model re-exports
│   │   ├── validators.js   # Shared validators (integer paise, RFC email)
│   │   ├── User.js         # User credentials, profile, preferences
│   │   ├── Category.js     # Expense/income categories (personal & system)
│   │   ├── Expense.js      # Personal expense records (with optional receipt link)
│   │   ├── Income.js       # Personal income records
│   │   ├── Budget.js       # Overall and category monthly budget limits
│   │   ├── Recurring.js    # Subscriptions and recurring payments
│   │   ├── Group.js        # Sharing groups with embedded member rosters
│   │   ├── SharedExpense.js# Group expenses with embedded member shares
│   │   ├── Settlement.js   # Direct debt settlement transactions
│   │   ├── ShoppingList.js # Lists with embedded checklist items
│   │   ├── Receipt.js      # Receipt uploads & OCR extraction metadata (P10/P12)
│   │   └── Insight.js      # Spending alerts & deterministic insights
│   ├── routes/             # REST API resource routes
│   │   ├── index.js        # Aggregator mounting sub-routers onto /api
│   │   ├── auth.js         # /api/auth (register, login, logout, me, profile, change-password)
│   │   ├── expenses.js     # /api/expenses (CRUD, filters, pagination)
│   │   ├── income.js       # /api/income (CRUD, filters, pagination)
│   │   ├── categories.js   # /api/categories (CRUD, system protection)
│   │   ├── budgets.js      # /api/budgets (CRUD, spending progress rollup)
│   │   ├── recurring.js    # /api/recurring (CRUD, toggle status)
│   │   ├── groups.js       # /api/groups (CRUD, members, shared expenses, settlements, balances)
│   │   ├── shopping.js     # /api/shopping (CRUD, checklist items, convert to expense)
│   │   ├── analytics.js    # /api/analytics (monthly, categories, forecast, insights)
│   │   ├── notifications.js# /api/notifications (list, mark-read, mark-all-read)
│   │   ├── search.js       # /api/search (cross-collection keyword search)
│   │   └── receipts.js     # /api/receipts (upload, OCR, stream image, confirm, delete)
│   ├── services/
│   │   ├── authService.js  # Password hashing, token creation, registration, login
│   │   ├── storageService.js # GridFS & in-memory image storage lifecycle (P12)
│   │   └── ocrService.js   # Tesseract.js OCR execution and candidate extraction (P12)
│   └── utils/
│       ├── domain.js       # Re-exports shared client domain algorithms
│       └── errors.js       # Standard HTTP error classes
└── tests/
    ├── server.test.js      # Express server foundation & error tests
    ├── models.test.js      # Mongoose schema validation & connection tests
    ├── auth.test.js        # Authentication, JWT, bcrypt, and rate limiting tests
    ├── api.test.js         # REST API authorization, ownership, and validation tests
    └── receipts.test.js    # Receipt upload, magic bytes, storage, and OCR tests (P12)
```

## Prerequisites

- **Node.js**: v20.0.0 or higher (v24 LTS recommended).
- **npm**: v10.0.0 or higher.
- **MongoDB** (for running live database operations in future phases):
  - Local: MongoDB Community Server 7.0+ on `mongodb://127.0.0.1:27017/splitstack-dev`
  - Cloud: MongoDB Atlas cluster with connection string in `MONGODB_URI`.
  - *Note: Unit, schema, and API tests run completely offline and do not require a live database.*

## Installation

Install server dependencies from within the `server/` directory:

```bash
cd server
npm install
```

## Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure environment variables:

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | `string` | `development` | Runtime mode: `development`, `production`, or `test` |
| `PORT` | `number` | `3000` | Port for the HTTP server |
| `HOST` | `string` | `localhost` | Bind host for the HTTP server |
| `MONGODB_URI` | `string` | `mongodb://127.0.0.1:27017/splitstack-dev` | MongoDB connection string |
| `JWT_SECRET` | `string` | _(dev default)_ | Cryptographic secret for signing JWT tokens (min 32 chars in production) |
| `JWT_EXPIRES_IN` | `string` | `7d` | Token lifetime (e.g. `24h`, `7d`) |
| `COOKIE_SECRET` | `string` | _(dev default)_ | Secret for cookie parsing and tamper protection |
| `MAX_RECEIPT_SIZE_BYTES` | `number` | `5242880` (5 MB) | Maximum accepted receipt image size in bytes |
| `OCR_ENABLED` | `boolean` | `true` | Enable/disable server-side Tesseract.js OCR processing |
| `OCR_LANGUAGE` | `string` | `eng` | Tesseract.js language code (e.g. `eng`) |
| `UPLOAD_TEMP_DIR` | `string` | `uploads/temp` | Temporary staging directory for file operations |

> **Security Note:** Never commit `.env` or real database credentials to version control. The file is listed in `.gitignore`. The connection manager strictly masks credentials when logging.

## REST API Endpoints Inventory

All protected endpoints require either an `Authorization: Bearer <token>` header or an authenticated `splitstack_token` cookie.

| Resource | Method | Path | Description | Auth Required |
|---|---|---|---|---|
| **Health** | `GET` | `/api/health` | Server uptime, status, database connectivity | Public |
| **Auth** | `POST` | `/api/auth/register` | Register new user with bcrypt password hashing | Public (Rate Limited) |
| **Auth** | `POST` | `/api/auth/login` | Authenticate user; generic failure messages | Public (Rate Limited) |
| **Auth** | `POST` | `/api/auth/logout` | Terminate session, clears auth cookie | Public |
| **Auth** | `GET` | `/api/auth/me` | Retrieve authenticated user profile | Required |
| **Auth** | `PATCH` | `/api/auth/profile` | Update profile and preferences | Required |
| **Auth** | `POST` | `/api/auth/change-password` | Verify current password and update hash | Required |
| **Expenses** | `GET` | `/api/expenses` | List personal expenses with filter, search, pagination | Required |
| **Expenses** | `POST` | `/api/expenses` | Create personal expense (integer paise) | Required |
| **Expenses** | `GET` | `/api/expenses/:id` | Get expense details (ownership enforced) | Required |
| **Expenses** | `PATCH` | `/api/expenses/:id` | Update expense (ownership enforced) | Required |
| **Expenses** | `DELETE` | `/api/expenses/:id` | Delete expense (ownership enforced) | Required |
| **Income** | `GET` | `/api/income` | List personal income streams | Required |
| **Income** | `POST` | `/api/income` | Record income stream (integer paise) | Required |
| **Income** | `GET` | `/api/income/:id` | Get income record (ownership enforced) | Required |
| **Income** | `PATCH` | `/api/income/:id` | Update income record (ownership enforced) | Required |
| **Income** | `DELETE` | `/api/income/:id` | Delete income record (ownership enforced) | Required |
| **Categories** | `GET` | `/api/categories` | List system categories + user custom categories | Required |
| **Categories** | `POST` | `/api/categories` | Create user custom category | Required |
| **Categories** | `GET` | `/api/categories/:id` | Get category details | Required |
| **Categories** | `PATCH` | `/api/categories/:id` | Update category (system categories protected) | Required |
| **Categories** | `DELETE` | `/api/categories/:id` | Delete category (system categories protected) | Required |
| **Budgets** | `GET` | `/api/budgets` | List budgets with live spent rollup and alert state | Required |
| **Budgets** | `POST` | `/api/budgets` | Set or update monthly budget limit (upsert) | Required |
| **Budgets** | `PATCH` | `/api/budgets/:id` | Update budget limit | Required |
| **Budgets** | `DELETE` | `/api/budgets/:id` | Delete budget limit | Required |
| **Recurring** | `GET` | `/api/recurring` | List recurring payment schedules | Required |
| **Recurring** | `POST` | `/api/recurring` | Create recurring payment schedule | Required |
| **Recurring** | `PATCH` | `/api/recurring/:id/toggle` | Toggle active state of recurring schedule | Required |
| **Recurring** | `DELETE` | `/api/recurring/:id` | Delete recurring payment schedule | Required |
| **Groups** | `GET` | `/api/groups` | List groups where user is a member | Required |
| **Groups** | `POST` | `/api/groups` | Create group with creator as admin | Required |
| **Groups** | `GET` | `/api/groups/:id` | Get group details (membership check) | Required |
| **Groups** | `POST` | `/api/groups/:id/members` | Add member to group by email | Required |
| **Groups** | `DELETE` | `/api/groups/:id/members/:userId` | Remove member from group (Admin only) | Required |
| **Groups** | `POST` | `/api/groups/:id/leave` | Leave group (enforces zero net balance) | Required |
| **Groups** | `GET` | `/api/groups/:id/balances` | Calculate net member balances in integer paise | Required |
| **Groups** | `GET` | `/api/groups/:id/member-stats` | Detailed member statistics (paid, share, net) | Required |
| **Groups** | `GET` | `/api/groups/:id/suggested-settlements` | Greedy minimum-cash-flow settlement plan | Required |
| **Groups** | `GET` | `/api/groups/:id/settlements` | List recorded settlements for group | Required |
| **Groups** | `POST` | `/api/groups/:id/settlements` | Record debt settlement with debt limit check | Required |
| **Groups** | `DELETE` | `/api/groups/:id/settlements/:settlementId` | Remove recorded settlement | Required |
| **Groups** | `GET` | `/api/groups/:id/expenses` | List shared group expenses | Required |
| **Groups** | `POST` | `/api/groups/:id/expenses` | Create shared expense (equal or custom split) | Required |
| **Groups** | `DELETE` | `/api/groups/:id/expenses/:expenseId` | Delete shared group expense | Required |
| **Shopping** | `GET` | `/api/shopping` | List personal and group shopping lists | Required |
| **Shopping** | `POST` | `/api/shopping` | Create new shopping list | Required |
| **Shopping** | `GET` | `/api/shopping/:id` | Get shopping list with checklist items | Required |
| **Shopping** | `PATCH` | `/api/shopping/:id` | Update shopping list metadata | Required |
| **Shopping** | `DELETE` | `/api/shopping/:id` | Delete shopping list (Owner only) | Required |
| **Shopping** | `POST` | `/api/shopping/:id/items` | Add checklist item | Required |
| **Shopping** | `PATCH` | `/api/shopping/:id/items/:itemId/toggle` | Toggle item purchased state | Required |
| **Shopping** | `PATCH` | `/api/shopping/:id/items/:itemId` | Update item details | Required |
| **Shopping** | `DELETE` | `/api/shopping/:id/items/:itemId` | Remove item from list | Required |
| **Shopping** | `POST` | `/api/shopping/:id/convert-expense` | Convert list to expense (duplicate protected) | Required |
| **Analytics** | `GET` | `/api/analytics/monthly` | 6-month income/expense/savings trend | Required |
| **Analytics** | `GET` | `/api/analytics/categories` | Monthly category spending breakdown | Required |
| **Analytics** | `GET` | `/api/analytics/forecast` | Spending forecast velocity projection model | Required |
| **Analytics** | `GET` | `/api/analytics/insights` | Deterministic financial alerts and notifications | Required |
| **Notifications** | `GET` | `/api/notifications` | In-app notification drawer list and unread count | Required |
| **Notifications** | `PATCH` | `/api/notifications/:id/read` | Mark individual notification as read | Required |
| **Notifications** | `POST` | `/api/notifications/mark-all-read` | Mark all notifications as read | Required |
| **Search** | `GET` | `/api/search` | Multi-collection search across expenses, income, groups, lists | Required |
| **Receipts** | `POST` | `/api/receipts/upload` | Multipart receipt upload & server-side OCR candidate extraction | Required |
| **Receipts** | `POST` | `/api/receipts` | Alias for receipt upload endpoint | Required |
| **Receipts** | `GET` | `/api/receipts` | List receipts uploaded by authenticated user | Required |
| **Receipts** | `GET` | `/api/receipts/:id` | Get receipt metadata (ownership enforced) | Required |
| **Receipts** | `GET` | `/api/receipts/:id/image` | Stream authorized receipt binary (ownership enforced) | Required |
| **Receipts** | `POST` | `/api/receipts/:id/confirm` | Confirm draft receipt into an expense (duplicate protected, 409) | Required |
| **Receipts** | `DELETE` | `/api/receipts/:id` | Delete receipt metadata and remove binary from GridFS | Required |

## Database Seeding (Phase P14)

SplitStack provides a deterministic, repeatable development and test database seeding script (`server/scripts/seed.js`).

### Safety Guards & Safeguards:
- **Explicit Target Required**: Requires `--dev`, `--test`, or `--uri <connection-string>`. Never runs without an explicit target.
- **Production Blacklist**: Strictly refuses to run when `NODE_ENV === 'production'` or against database names containing `prod`, `production`, or `live`.
- **System Database Guard**: Refuses internal system databases (`admin`, `config`, `local`).
- **Test Mode Enforcement**: In `--test` mode, the database name must contain `test` (e.g. `splitstack-test`).
- **Never Auto-Seeds**: The server never automatically seeds on startup.
- **Bcrypt Passwords**: Passwords for synthetic users (`Priya Raman`, `Rohan Das`, `Kavya Nair`, `Arjun Mehta`) are hashed with bcrypt (12 rounds) — plaintext passwords are never stored.
- **Integer Paise Representation**: All monetary values use positive integer paise.
- **Idempotence**: Clears targeted non-production collections cleanly before deterministic re-population.

### Seeding Commands:
```bash
# Seed development database (mongodb://127.0.0.1:27017/splitstack-dev)
npm run seed

# Seed dedicated test database (mongodb://127.0.0.1:27017/splitstack-test)
npm run seed:test

# Dry-run inspection without writing to database
node server/scripts/seed.js --dev --dry-run
```

## Running Tests

### Unit Tests
Run the server unit test suite (fast, offline-capable, uses schema validation and memory fallbacks):

```bash
# From repository root:
npm run test:server:unit

# Or from server directory:
npm run test:unit
```
Current unit test coverage: **123 passing tests across 43 suites** (0 failures).

### Real MongoDB Integration Tests (Phase P14)
Runs end-to-end integration flows against a dedicated, live test MongoDB database and GridFS bucket:

```bash
# Require explicit MONGODB_TEST_URI opt-in:
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/splitstack-test npm run test:integration
```
If `MONGODB_TEST_URI` is not provided, the test suite reports a deliberate, documented skip:
```
﹣ SplitStack Real MongoDB Integration Suite (Dedicated Database) # SKIP
```

The integration suite covers 12 comprehensive end-to-end flows:
1. MongoDB connection and Mongoose model persistence.
2. User registration, login, profile retrieval (`GET /api/auth/me`), and logout.
3. Password hash and salt non-exposure across all endpoints and JSON transforms.
4. Personal expense and income CRUD with integer-paise monetary checks.
5. Cross-user isolation (User B cannot read, modify, or delete User A records).
6. Multi-member group creation, shared expense splitting, balance calculation, and debt settlement.
7. Group membership and authorization restrictions.
8. Shopping list persistence and duplicate-protected expense conversion.
9. Budget and analytics calculations on persisted database records.
10. Synthetic receipt image upload, GridFS persistence, authorized binary streaming, and cleanup.
11. Duplicate receipt confirmation rejection (409 Conflict).
12. Database error resilience and zero-orphan compensating cleanup.

## Roadmap Status

- **P9 (Complete):** Express server foundation, health check, 404/error handling, and test suite.
- **P10 (Complete):** MongoDB connection lifecycle & 12 Mongoose data models with integer-paise validation.
- **P11 (Complete):** Authentication routes (`/api/auth`), JWT & cookie session management, bcrypt hashing, rate limiting, and REST resource controllers for all core SplitStack entities.
- **P12 (Complete):** Receipt upload and server-side OCR processing pipeline with persistent GridFS storage, magic byte verification, and candidate confirmation.
- **P13 (Complete):** Client data layer migration from `localStorage` to `/api` `fetch()`.
- **P14 (Complete):** Safe database seeding (`seed.js`), real MongoDB integration tests (`integration.test.js`), API contract checks, and GitHub Actions CI workflow (`.github/workflows/ci.yml`).
- **P15 (Complete):** Production deployment manifests (`Dockerfile`, `docker-compose.yml`), comprehensive deployment guide ([`docs/DEPLOYMENT_GUIDE.md`](../docs/DEPLOYMENT_GUIDE.md)), release notes draft ([`docs/RELEASE_NOTES_v3.0.0_DRAFT.md`](../docs/RELEASE_NOTES_v3.0.0_DRAFT.md)), and final release readiness audit ([`docs/audit/P15_FINAL_RELEASE_READINESS.md`](../docs/audit/P15_FINAL_RELEASE_READINESS.md)).
