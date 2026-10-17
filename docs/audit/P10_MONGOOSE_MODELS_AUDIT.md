# SplitStack — P10: MongoDB Connection & Mongoose Data Models Audit Report

---

## 1. Document & Audit Metadata

- **Project Name:** SplitStack (Smart Personal & Group Expense Management, Debt Simplification, & Financial Insights)
- **Document Title:** Review 3 Milestone — MongoDB Connection & Mongoose Data Models (Phase P10) Audit
- **Target Repository:** `C:\Users\Pavithran\SplitStack`
- **Working Branch:** `refurbish`
- **Starting Commit:** `30a4d60 Review 3: Express server foundation`
- **Audit Date:** October 17, 2026
- **Auditor:** Antigravity AI Senior QA & Full-Stack Systems Auditor
- **Phase Covered:** Phase P10 (Review 3: MongoDB Connection and Mongoose Data Models)
- **Deliverable Path:** `docs/audit/P10_MONGOOSE_MODELS_AUDIT.md`

---

## 2. Executive Summary

Phase **P10** advances **Review 3** (Node.js + MongoDB backend) by implementing the persistent data layer: a dedicated database connection lifecycle manager (`server/src/db.js`) and 12 fully typed, validated Mongoose schemas and models (`server/src/models/`).

All data schemas directly map the existing SplitStack domain established in earlier reviews without data loss or schema incompatibilities. All currency fields enforce strict **integer paise** ($1\text{ INR} = 100\text{ paise}$) arithmetic, preserving the numerical integrity of the client data layer. Sensitive authentication fields (`passwordHash`, `salt`) are excluded from JSON serialization.

All 38 server tests passed across 19 test suites, covering health checks, error formatting, connection sanitization, and Mongoose schema constraints without requiring an external database. All 176 client tests and 25 HTML validation checks passed with zero regressions. All legacy Flask assets and preexisting audit documentation remain completely preserved.

---

## 3. Database Architecture & Connection Lifecycle

The database connection layer is isolated within `server/src/db.js`:

1. **Explicit Lifecycle Management:**
   - `connectDb(uri, options)`: Programmatically connects via Mongoose. Validates that `MONGODB_URI` is non-empty and well-formed.
   - `disconnectDb()`: Closes active MongoDB connections cleanly.
   - `getConnectionState()`: Reports human-readable readyState (`disconnected`, `connected`, `connecting`, `disconnecting`).
   - `isDbConnected()`: Returns boolean connectivity flag incorporated into the `/api/health` endpoint response.

2. **Decoupled Architecture:**
   - Importing `createApp` or `app` from `server/src/app.js` does *not* automatically trigger a database connection. This enables fast, isolated unit and integration tests.

3. **Startup & Shutdown Safety:**
   - `server/src/index.js` connects to MongoDB before listening for incoming HTTP requests. If the database is unreachable, a sanitized error is logged and the process exits with status code 1.
   - On `SIGINT` or `SIGTERM`, active connections are closed cleanly before process termination.

4. **Credential Protection & URI Sanitization:**
   - `sanitizeMongoUri(uri)` masks usernames and passwords (e.g. `mongodb+srv://***:***@cluster.mongodb.net/...`), ensuring no credentials leak into application logs, error traces, or test outputs.
   - `server/.env.example` provides a fake local development URI (`mongodb://127.0.0.1:27017/splitstack-dev`) and placeholder templates without real credentials.

---

## 4. Mongoose Data Models & Key Schema Decisions

Twelve Mongoose models were implemented in `server/src/models/`:

| Entity | Model | Schema File | Key Attributes | Schema & Design Decisions |
|---|---|---|---|---|
| **User** | `User` | `User.js` | `name`, `email`, `passwordHash`, `salt`, `avatarColor`, `initials`, `preferences` | Unique lowercase trimmed email with RFC 5322 validation. `toJSON` deletes `passwordHash` and `salt`. Auto-populates initials from name. |
| **Category** | `Category` | `Category.js` | `user`, `name`, `type`, `icon`, `color` | `user: null` denotes system-wide default categories. Unique compound index on `(user, name, type)`. |
| **Expense** | `Expense` | `Expense.js` | `user`, `category`, `amount`, `date`, `description`, `paymentMethod`, `notes`, `receipt`, `tags` | Amount validated as positive integer paise (`Number.isInteger(v) && v > 0`). Compound indexes for user query and date range filtering. |
| **Income** | `Income` | `Income.js` | `user`, `category`, `amount`, `date`, `source`, `paymentMethod`, `notes` | Positive integer paise amount. Indexed by user and chronological date descending. |
| **Budget** | `Budget` | `Budget.js` | `user`, `category`, `month`, `year`, `limit` | `category: null` represents overall monthly budget. Month restricted to 1–12. Unique compound index on `(user, category, month, year)`. |
| **Recurring** | `Recurring` | `Recurring.js` | `user`, `category`, `name`, `amount`, `frequency`, `startDate`, `nextDueDate`, `active` | Frequency restricted to `daily`, `weekly`, `monthly`, `yearly`. Indexed next due date for scheduled payment lookups. |
| **Group** | `Group` | `Group.js` | `name`, `description`, `createdBy`, `members: [{ user, role, joinedAt }]` | **Embedded member documents**: Members and their roles are scoped directly to group lifecycles, avoiding relational join tables. Indexed on `members.user`. |
| **SharedExpense** | `SharedExpense` | `SharedExpense.js` | `group`, `title`, `amount`, `paidBy`, `category`, `date`, `splitType`, `shares: [{ user, amount }]` | **Embedded shares**: Custom schema validator ensures $\sum \text{shares.amount} \equiv \text{amount}$, guaranteeing zero lost paise in group calculations. |
| **Settlement** | `Settlement` | `Settlement.js` | `group`, `payer`, `payee`, `amount`, `status`, `completedAt` | Validation strictly prevents self-settlement (`payer !== payee`). Amount validated as positive integer paise. |
| **ShoppingList** | `ShoppingList` | `ShoppingList.js` | `owner`, `group`, `name`, `budget`, `convertedExpense`, `items: [{ name, quantity, estimatedPrice, actualPrice, purchased, assignedTo }]` | **Embedded item checklist**: Checklist items are embedded directly in the list document, enabling atomic item updates and progress calculations. |
| **Receipt** | `Receipt` | `Receipt.js` | `user`, `merchant`, `date`, `amount`, `rawText`, `confidence`, `status`, `imageUrl`, `fileReference` | Confidence clamped to $[0, 1]$. Status restricted to `pending`, `confirmed`, `discarded`. Non-negative integer paise. |
| **Insight** | `Insight` | `Insight.js` | `user`, `kind`, `message`, `read`, `details` | Tone kind restricted to `warning`, `info`, `primary`, `success`, `danger`. Indexed read status per user. |

---

## 5. Verification & Test Execution Results

All verification suites were run using the project's native tools:

| Suite / Check | Command | Result | Details |
|---|---|---|---|
| **Server Tests** | `npm run test:server` | **PASS** | 38 tests passing across 19 suites (1080ms) |
| **Server Tests (Local)** | `npm test` (in `server/`) | **PASS** | 38 tests passing across 19 suites (1086ms) |
| **Client Test Suite** | `npm run test:client` | **PASS** | 176 tests passing across 52 suites (453ms) |
| **HTML Linter** | `npm run lint:html` | **PASS** | 25 of 25 HTML files valid with 0 errors |

### Honest Disclosure on Database Connectivity
- **Mongoose Model Validation:** Verified 100% via isolated Mongoose document validation (`doc.validate()`) without requiring a live external MongoDB process.
- **Connection Module Tests:** Connection string sanitization, missing URI error handling, and readyState transitions were verified in unit tests.
- **Live External Database Connection:** A live MongoDB cluster was not connected or tested during this phase, as an external connection requires live network credentials which are deferred to local/production deployment.

---

## 6. Security, Integrity & Safety Confirmations

- [x] **Zero Hardcoded Secrets:** No database credentials or connection strings committed.
- [x] **Masked Logging:** `sanitizeMongoUri` ensures passwords never appear in console outputs or logs.
- [x] **Integer-Paise Monetary Arithmetic:** All prices, budgets, shares, and settlements enforce integer paise validation.
- [x] **Clean JSON Serialization:** `User` schema `toJSON` transform automatically deletes `passwordHash` and `salt`.
- [x] **Mathematical Split Sum Invariant:** `SharedExpense` validator enforces that shares sum to total expense amount.
- [x] **Anti-Self-Settlement Guard:** `Settlement` validator prevents transactions where payer and payee are the same user.
- [x] **Preservation of Legacy Flask Files:** `app.py`, `config.py`, `Procfile`, `requirements.txt`, `modules/`, `templates/`, `static/`, `database/`, `ml/`, and legacy tests remain untouched.
- [x] **Preservation of Audit Files:** All preexisting audit documents in `docs/audit/` remain intact.

---

## 7. Phase Completion & Next Steps

**Phase P10 is COMPLETE.** The Mongoose schemas, data models, connection manager, and test suites are fully verified. The repository is ready for Phase P11 ("Authentication routes, session management, and REST resource controllers").
