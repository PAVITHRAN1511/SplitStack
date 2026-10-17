# SplitStack Backend Server

Node.js, Express, and MongoDB backend for SplitStack (**Review 3, Steps P9 & P10**).

## Overview

The server provides the REST API and data persistence foundation for SplitStack:
- **ES Module Architecture**: Native ES modules throughout (`"type": "module"`).
- **Express Server**: Configured with JSON body parsing (100kb limit), static client hosting, health checks, 404 handler, and centralized error handling.
- **MongoDB Connection Management**: Dedicated connection module (`server/src/db.js`) reading `MONGODB_URI` with credential sanitization, connection event logging, and graceful shutdown.
- **Mongoose Data Models**: 12 fully typed, normalized schemas matching the SplitStack domain with integer-paise monetary arithmetic, embedding optimizations, and strict validation.
- **Automated Tests**: Unit and integration test suites runnable via Node's native test runner (`node --test`), testing endpoints, errors, schema constraints, and monetary integrity without requiring an external database.

## Directory Structure

```
server/
├── .env.example            # Example environment configuration template
├── package.json            # Server package manifest (dependencies: express, mongoose, dotenv)
├── package-lock.json       # Dependency lockfile
├── README.md               # Server documentation
├── src/
│   ├── app.js              # Express application factory & middleware setup
│   ├── config.js           # Centralized environment configuration
│   ├── db.js               # MongoDB connection lifecycle & URI sanitization
│   ├── index.js            # HTTP server entry point & shutdown handler
│   └── models/             # Mongoose domain models
│       ├── index.js        # Model re-exports
│       ├── validators.js   # Shared validators (integer paise, RFC email)
│       ├── User.js         # User credentials, profile, preferences
│       ├── Category.js     # Expense/income categories (personal & system)
│       ├── Expense.js      # Personal expense records
│       ├── Income.js       # Personal income records
│       ├── Budget.js       # Overall and category monthly budget limits
│       ├── Recurring.js    # Subscriptions and recurring payments
│       ├── Group.js        # Sharing groups with embedded member rosters
│       ├── SharedExpense.js# Group expenses with embedded member shares
│       ├── Settlement.js   # Direct debt settlement transactions
│       ├── ShoppingList.js # Lists with embedded checklist items
│       ├── Receipt.js      # Receipt uploads & OCR extraction metadata
│       └── Insight.js      # Spending alerts & deterministic insights
└── tests/
    ├── server.test.js      # Express server & endpoint tests
    └── models.test.js      # Mongoose schema validation & connection tests
```

## Prerequisites

- **Node.js**: v20.0.0 or higher (v24 LTS recommended).
- **npm**: v10.0.0 or higher.
- **MongoDB** (for running live database operations in future phases):
  - Local: MongoDB Community Server 7.0+ on `mongodb://127.0.0.1:27017/splitstack-dev`
  - Cloud: MongoDB Atlas cluster with connection string in `MONGODB_URI`.
  - *Note: Unit and model validation tests run completely offline and do not require a live database.*

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
| `SESSION_SECRET`| `string` | _(empty)_ | Secret for session cookies, min 32 chars (Phase P11) |

> **Security Note:** Never commit `.env` to version control. The file is listed in `.gitignore`. The connection manager strictly masks credentials when logging.

## Database Connection Lifecycle (`server/src/db.js`)

- **Explicit Lifecycle**: `connectDb(uri, options)` and `disconnectDb()` provide full programmatic control over database connectivity.
- **Decoupled Architecture**: Importing `createApp` or `app` does *not* automatically open a database connection, allowing isolated endpoint and schema testing without database overhead.
- **Startup Guard**: On server startup (`server/src/index.js`), the server connects to MongoDB before listening for incoming HTTP requests. If the database is unreachable, a sanitized error is logged and the process exits with a nonzero code.
- **Credential Masking**: All connection URLs logged to stdout/stderr are scrubbed through `sanitizeMongoUri()`, replacing credentials with `***:***`.
- **Graceful Shutdown**: On `SIGINT` or `SIGTERM`, the HTTP server stops accepting new connections and active MongoDB connections are closed cleanly.

## Mongoose Data Models Summary

All financial amounts are strictly stored as **integer paise** ($1\text{ INR} = 100\text{ paise}$):

| Model | Collection | Primary Schema Attributes | Key Constraints & Decisions |
|---|---|---|---|
| **User** | `users` | `name`, `email`, `passwordHash`, `salt`, `avatarColor`, `initials`, `preferences` | Unique lowercase email; `toJSON` automatically strips `passwordHash` and `salt`. |
| **Category** | `categories` | `user`, `name`, `type`, `icon`, `color` | `user: null` denotes system default; unique compound index on `(user, name, type)`. |
| **Expense** | `expenses` | `user`, `category`, `amount`, `date`, `description`, `paymentMethod`, `notes`, `receipt`, `tags` | Positive integer paise; compound indexes on `(user, date)` and `(user, category)`. |
| **Income** | `incomes` | `user`, `category`, `amount`, `date`, `source`, `paymentMethod`, `notes` | Positive integer paise; indexed by `(user, date)`. |
| **Budget** | `budgets` | `user`, `category`, `month`, `year`, `limit` | `category: null` denotes overall monthly limit; unique on `(user, category, month, year)`. |
| **Recurring** | `recurrings` | `user`, `category`, `name`, `amount`, `frequency`, `startDate`, `nextDueDate`, `active` | Frequency enum (`daily`, `weekly`, `monthly`, `yearly`); indexed next due date. |
| **Group** | `groups` | `name`, `description`, `createdBy`, `members: [{ user, role, joinedAt }]` | **Embedded subdocuments** for members: eliminates join overhead; indexed on `members.user`. |
| **SharedExpense** | `sharedexpenses`| `group`, `title`, `amount`, `paidBy`, `category`, `date`, `splitType`, `shares: [{ user, amount }]` | **Embedded shares**; custom validator verifies $\sum \text{shares} \equiv \text{amount}$. |
| **Settlement** | `settlements` | `group`, `payer`, `payee`, `amount`, `status`, `completedAt` | Validation prevents self-settlement (`payer !== payee`); positive integer paise. |
| **ShoppingList** | `shoppinglists` | `owner`, `group`, `name`, `budget`, `convertedExpense`, `items: [{ name, quantity, estimatedPrice, actualPrice, purchased, assignedTo }]` | **Embedded items** for checklist rows; atomic item additions, removals, and status toggles. |
| **Receipt** | `receipts` | `user`, `merchant`, `date`, `amount`, `rawText`, `confidence`, `status`, `imageUrl`, `fileReference` | Confidence clamped to $[0, 1]$; status enum (`pending`, `confirmed`, `discarded`). |
| **Insight** | `insights` | `user`, `kind`, `message`, `read`, `details` | Deterministic insight tones (`warning`, `info`, `primary`, `success`, `danger`). |

## Running the Server

### Development Mode (with file watcher)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

## Health Check Endpoint

- **Endpoint:** `GET /api/health`
- **Response Format:** `application/json`
- **Status:** `200 OK`

```json
{
  "status": "ok",
  "uptime": 12.345,
  "timestamp": "2026-10-17T11:45:00.000Z",
  "environment": "development",
  "service": "SplitStack API",
  "version": "3.0.0",
  "database": "connected"
}
```

## Running Tests

Run the full server test suite (HTTP endpoints, 404/errors, and Mongoose schema validation):

```bash
npm test
```

Or from the repository root:

```bash
npm run test:server
```

## Roadmap & Next Phases

- **P9 (Complete):** Express server foundation, health check, 404/error handling, and test suite.
- **P10 (Complete):** MongoDB connection lifecycle & 12 Mongoose data models with integer-paise validation.
- **P11 (Next):** Authentication routes (`/api/auth`), session management, and REST resource controllers.
- **P12:** Receipt upload and OCR processing pipeline.
- **P13:** Client data layer migration from `localStorage` to `/api` `fetch()`.
- **P14:** End-to-end integration tests & CI automation.
- **P15:** Final documentation, deployment manifests & cleanup.
