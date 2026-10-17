# SplitStack - Smart Financial & Group Expense Management

> **Refurbishment Complete (Web Technology Course).** SplitStack has been rebuilt across three major milestones:
> - **Review 1 (HTML + CSS)**: Complete responsive UI and glassmorphic design system in [`client/`](client/).
> - **Review 2 (JavaScript Client)**: Complete modular vanilla JS financial engine with integer-paise arithmetic and debt simplification.
> - **Review 3 (Node.js + MongoDB)**: Complete Express REST API, Mongoose models, JWT/cookie authentication, GridFS receipt storage, Tesseract OCR pipeline, deterministic database seeder, and GitHub Actions CI in [`server/`](server/).
>
> - **Live Site (Review 1 Static)**: https://mahaprabhuk.github.io/SplitStack/ (served from `gh-pages` branch)
> - **Run Client Localy**: `npm run client` (opens http://localhost:5500)
> - **Run Express API Server**: `npm run server` or `cd server && npm start` (opens http://localhost:3000)
> - **Run with Docker Compose**: `docker compose up --build` (starts app + MongoDB 7.0 container)
> - **Client Unit Tests**: `npm run test:client` (201 passing tests across 59 suites — in-memory mocks)
> - **Server Unit Tests**: `npm run test:server:unit` (123 passing tests across 43 suites — in-memory mocks)
> - **Real MongoDB Integration Tests**: `MONGODB_TEST_URI=mongodb://127.0.0.1:27017/splitstack-test npm run test:integration` (requires live test MongoDB)
> - **HTML5 Validation**: `npm run lint:html` (25 HTML pages clean)
> - **Legacy Python Tests**: `python -m pytest tests/test_security.py tests/test_auth_flow.py tests/test_regression.py tests/test_master.py` (31 passing tests)
> - **Safe Database Seeding**: `npm run seed` (dev database) / `npm run seed:test` (dedicated test database)
> - **Deployment Guide**: [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md)
> - **v3.0.0 Release Notes (Draft)**: [`docs/RELEASE_NOTES_v3.0.0_DRAFT.md`](docs/RELEASE_NOTES_v3.0.0_DRAFT.md)
> - **Release Readiness Audit**: [`docs/audit/P15_FINAL_RELEASE_READINESS.md`](docs/audit/P15_FINAL_RELEASE_READINESS.md)
> - **Prompt Log**: [`docs/SplitStack_Prompt_Log.pdf`](docs/SplitStack_Prompt_Log.pdf) / [`.docx`](docs/SplitStack_Prompt_Log.docx)
> - **Legacy Flask Preservation**: The original Python/Flask + SQLite application described below is fully preserved on this branch and the [`legacy`](../../tree/legacy) branch.

**SplitStack** is an intelligent personal finance and collaborative group expense-sharing web platform. It combines personal budgeting, multi-party shared expense splitting, greedy debt simplification algorithms, collaborative shopping management, financial analytics, receipt OCR processing, and spending velocity forecasting.

All financial calculations across both client and server are computed strictly in **integer paise** (₹1.00 = 100 paise), preventing floating-point precision errors.

---

## Key Features

### 1. Authentication & Security
- Secure registration, login, and session management.
- Cryptographic password hashing with salted PBKDF2 SHA-256 (no plain-text passwords).
- Route protection decorators (`@login_required`) and authorization checks preventing cross-user data leakage.
- Parameterized SQL queries preventing SQL injection across all database operations.

### 2. Personal Finance Management
- **Expenses**: Full CRUD with search, category filtering, date ranges, and payment method filters (UPI, Card, Cash, Net Banking).
- **Income**: Track salaries, freelance earnings, dividends, and other revenue streams.
- **Categories**: System default categories + user-customizable categories with custom icons and color tags. Safe deletion prevents orphan records.
- **Budgets**: Monthly and category-specific budget limits with real-time actual spending vs target gauges and warning alert thresholds (75%, 90%, 100%+).
- **Recurring Payments**: Track subscriptions, rent, and utility bills with automated next due date calculations and pause/activate toggles.

### 3. Group Finance & Shared Expenses
- Create collaborative expense-sharing groups for trips, roommates, friends, project teams, and households.
- Member invitation via registered email and role-based permissions (Admin / Member).
- **Shared Expenses**: Flexible splitting modes:
  - **Equal Split**: Even division across all selected members.
  - **Unequal / Custom Split**: Explicit amounts per participant with strict sum validation.
- **Debt Calculation**: Real-time net balance calculations: $\text{Paid} - \text{Share Owed} = \text{Net Balance}$.

### 4. Minimum Transaction Settlement Algorithm
- Custom greedy cash flow minimization algorithm (`modules/groups/settlement_service.py`).
- Transforms complex multi-party circular group debts into the minimum practical number of direct payments.
- Real-time optimization metrics displaying original pairwise debts, simplified transactions, and percentage saved.
- Settle-up workflow with immutable historical settlement records.

### 5. Shopping Management
- Shared and personal shopping lists with itemized checklist progress.
- Tracks unit quantities, estimated unit prices, actual purchase prices, and member assignments.
- Variance calculation showing whether purchases are over or under estimated budget.
- **Finance Integration**: Convert confirmed shopping items directly into a personal or shared group expense with a single click.

### 6. Financial Analytics Dashboard
- Interactive visualizations powered by Chart.js.
- 6-month monthly income vs expense trajectory trends.
- Category spending distribution doughnut charts.
- Top spending categories ranked with percentage share.
- Net savings rate metric.

### 7. Receipt OCR Scanner
- Upload receipt / invoice images (PNG, JPG, JPEG, WEBP).
- Automated OCR data extraction for Merchant name, Date, and Total Amount.
- **Safety First**: Extracted data is presented in an interactive confirmation form before any financial record is saved. Never creates unverified expenses.
- Supports `pytesseract` with clean heuristic regex fallback when external OCR binaries are not configured.

### 8. Smart Insights & Machine Learning Forecasts
- **Smart Insights**: Month-over-month trend changes, highest spending category highlights, upcoming bill notifications.
- **ML Spending Forecast**: Daily velocity projection model estimating total projected month-end expenditure and evaluating budget breach risk.

---

## Technology Stack

- **Backend**: Python 3.12+, Flask
- **Database**: SQLite through Python's built-in `sqlite3` module
- **Environment**: `python-dotenv`
- **Frontend**: HTML5, CSS3 (Modern Dark-Slate Glassmorphism Design System), Vanilla JavaScript, Chart.js, FontAwesome 6, Google Fonts (Outfit & Inter)
- **Version Control**: Git / GitHub

---

## Project Structure

```
SplitStack/
??? app.py                      # Flask Application Factory & Blueprints
??? config.py                   # Centralized Configuration & .env loader
??? requirements.txt            # Python Dependencies
??? .env.example                # Sample Environment Template
??? .env                        # Local Environment Configuration
?
??? database/
?   ??? db.py                   # SQLite Connection Manager & auto-init
?   ??? schema.sql              # Normalized SQLite Schema (15 Tables)
?
??? modules/
?   ??? auth/                   # Authentication Module (Login, Register, Profile)
?   ??? finance/                # Personal Finance (Expenses, Income, Budgets, Recurring, Categories)
?   ??? groups/                 # Group Sharing, Splitting, & Settlement Algorithm
?   ??? shopping/               # Shopping Lists, Checklist, Cost Estimator
?   ??? analytics/              # Financial Analytics & Insight Services
?   ??? ocr/                    # Receipt Image Upload & OCR Parsing
?
??? ml/
?   ??? spending_predictor.py   # Spending Velocity & Budget Risk Forecast Model
?
??? static/
?   ??? css/
?   ?   ??? style.css           # Modern Responsive Glassmorphic Design System
?   ??? js/
?   ?   ??? main.js             # Client UI Handlers, Password Toggles, Alerts
?   ??? uploads/
?       ??? receipts/           # Secure Receipt Image Storage
?
??? templates/
?   ??? base.html               # Base Layout & Responsive Navigation
?   ??? dashboard.html          # Main Financial Overview Dashboard
?   ??? auth/                   # Auth Templates (Login, Register, Profile)
?   ??? finance/                # Finance Templates (Expenses, Income, Budgets, Recurring, Categories, OCR)
?   ??? groups/                 # Group Templates (List, Create, Detail, Expenses, Settlements)
?   ??? shopping/               # Shopping Templates (Lists, Form, Checklist Detail)
?   ??? analytics/              # Analytics Dashboard
?   ??? errors/                 # Custom 404 & 500 Error Handlers
?
??? tests/
?   ??? test_master.py          # Master Automated Test Suite (Phases 1-8)
?
??? venv/                       # Python Virtual Environment
```

---

## Installation & Setup

### 1. Prerequisites
- Python 3.12 or newer
- No database server is required; SQLite stores data in `database/splitstack.db`.

### 2. Configure Environment (`.env`)
Create `.env` in the root directory (or copy from `.env.example`):
```env
FLASK_SECRET_KEY=splitstack-dev-secret-key-change-in-production-2026
FLASK_ENV=development
FLASK_DEBUG=True

# SQLite Database Configuration
DATABASE_PATH=database/splitstack.db
```

### 3. Initialize SQLite
The application automatically executes `schema.sql` on startup to create `database/splitstack.db`, its tables, indexes, and seed default categories.

### 4. Run SplitStack Application
```powershell
.env\Scripts\python.exe app.py
```
SplitStack will be live at `http://127.0.0.1:5000`.

---

## Running Automated Tests

To execute the master automated test suite covering all 8 phases:
```powershell
.env\Scripts\python.exe tests/test_master.py
```

---

## Minimum Transaction Debt Simplification Algorithm

When multiple members in a group share expenses, a complex network of pairwise debts is created. SplitStack solves this using a greedy cash-flow minimization algorithm (`modules/groups/settlement_service.py`):
1. Calculates each member's net balance: $\text{Balance} = \text{Paid} - \text{Share Owed}$.
2. Separates members into **Creditors** (positive net balance) and **Debtors** (negative net balance). Zero balance members are ignored.
3. Sorts creditors in descending order of credit and debtors in descending order of debt.
4. Greedily matches the largest debtor with the largest creditor, transferring $\min(\text{Credit}, |\text{Debt}|)$ and updating net balances.
5. Repeats until all debts reach zero, reducing an $O(N^2)$ debt network to at most $N - 1$ simple transactions.

---

## Known Limitations & OCR Engine Setup

- **Tesseract OCR Binary**: SplitStack includes built-in heuristic pattern extraction for receipt invoices. For full optical character recognition on handwritten or noisy receipts, install the Tesseract OCR engine binary on Windows and add it to system `PATH` (`tesseract-ocr`), or install via `pip install pytesseract pillow`.
- **Email Dispatch**: User invitations are matched instantly against registered user accounts. External email notifications are not currently configured.
