# SplitStack Backend Server

Node.js, Express, and MongoDB backend for SplitStack (**Review 3, Steps P9, P10, and P11**).

## Overview

The server provides the complete REST API, authentication layer, and data persistence foundation for SplitStack:
- **ES Module Architecture**: Native ES modules throughout (`"type": "module"`).
- **Express Server**: Configured with JSON body parsing (100kb limit), cookie parsing, static client hosting, health checks, 404 handler, and centralized error handling.
- **Authentication & Security (Step P11)**:
  - **Password Hashing**: Industry-standard `bcryptjs` with configurable cost factor (default 12 salt rounds). Plaintext passwords are never stored, logged, or returned.
  - **Session & Token Management**: Cryptographically signed JSON Web Tokens (JWT) supporting both `Authorization: Bearer <token>` headers and `HttpOnly` cookies (`SameSite: Lax`, `Secure` in production).
  - **Account Enumeration Defense**: Generic login error messages prevent attackers from discovering whether an email exists.
  - **Rate Limiting**: Sliding-window in-memory rate limiter protecting sensitive authentication endpoints against brute-force attempts.
  - **User Isolation & Ownership**: Authorization middleware (`requireAuth`) derives authenticated identity strictly from verified token claims and strictly isolates data across users and groups.
- **MongoDB Connection Management**: Dedicated connection module (`server/src/db.js`) reading `MONGODB_URI` with credential sanitization, connection event logging, and graceful shutdown.
- **Mongoose Data Models**: 12 fully typed, normalized schemas matching the SplitStack domain with integer-paise monetary arithmetic, embedding optimizations, and strict validation.
- **Shared Domain Algorithms**: Direct server reuse of authoritative client algorithms for equal splitting, custom shares validation, net balance calculation, and greedy debt simplification.
- **Automated Tests**: Comprehensive test suites (88 tests across 33 suites) covering health check, 404/error handling, Mongoose models, authentication, security rate limiting, parameter validation, and REST API ownership isolation.

## Directory Structure

```
server/
├── .env.example            # Example environment configuration template
├── package.json            # Server package manifest (dependencies: express, mongoose, bcryptjs, jsonwebtoken, cookie-parser, dotenv)
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
│   │   └── validate.js     # ObjectId validation and positive/non-negative paise checks
│   ├── models/             # Mongoose domain models
│   │   ├── index.js        # Model re-exports
│   │   ├── validators.js   # Shared validators (integer paise, RFC email)
│   │   ├── User.js         # User credentials, profile, preferences
│   │   ├── Category.js     # Expense/income categories (personal & system)
│   │   ├── Expense.js      # Personal expense records
│   │   ├── Income.js       # Personal income records
│   │   ├── Budget.js       # Overall and category monthly budget limits
│   │   ├── Recurring.js    # Subscriptions and recurring payments
│   │   ├── Group.js        # Sharing groups with embedded member rosters
│   │   ├── SharedExpense.js# Group expenses with embedded member shares
│   │   ├── Settlement.js   # Direct debt settlement transactions
│   │   ├── ShoppingList.js # Lists with embedded checklist items
│   │   ├── Receipt.js      # Receipt uploads & OCR extraction metadata
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
│   │   └── receipts.js     # /api/receipts (metadata listing and retrieval)
│   ├── services/
│   │   └── authService.js  # Password hashing, token creation, registration, login
│   └── utils/
│       ├── domain.js       # Re-exports shared client domain algorithms
│       └── errors.js       # Standard HTTP error classes
└── tests/
    ├── server.test.js      # Express server foundation & error tests
    ├── models.test.js      # Mongoose schema validation & connection tests
    ├── auth.test.js        # Authentication, JWT, bcrypt, and rate limiting tests
    └── api.test.js         # REST API authorization, ownership, and validation tests
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
| **Receipts** | `GET` | `/api/receipts` | List user receipts metadata | Required |
| **Receipts** | `GET` | `/api/receipts/:id` | Get receipt metadata (ownership enforced) | Required |

## Running Tests

Run the full server test suite using Node's native test runner:

```bash
npm test
```

Or from the repository root:

```bash
npm run test:server
```

Current test coverage: **88 passing tests across 33 suites** (0 failures).

## Roadmap Status

- **P9 (Complete):** Express server foundation, health check, 404/error handling, and test suite.
- **P10 (Complete):** MongoDB connection lifecycle & 12 Mongoose data models with integer-paise validation.
- **P11 (Complete):** Authentication routes (`/api/auth`), JWT & cookie session management, bcrypt hashing, rate limiting, and REST resource controllers for all core SplitStack entities.
- **P12 (Next):** Receipt upload and server-side OCR processing pipeline with persistent storage.
- **P13:** Client data layer migration from `localStorage` to `/api` `fetch()`.
- **P14:** End-to-end integration tests & CI automation.
- **P15:** Final documentation, deployment manifests & cleanup.
