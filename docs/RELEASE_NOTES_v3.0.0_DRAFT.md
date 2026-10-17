# SplitStack v3.0.0 Release Notes

> **STATUS: DRAFT — NOT RELEASED**  
> **Release Target:** `v3.0.0`  
> **Branch:** `refurbish`  
> **Date:** October 17, 2026  
> **Note:** This document is a pre-release draft. Formal Git release tagging (`v3.0.0`) must occur only after remote CI execution and staging environment smoke tests pass with explicit user approval.

---

## 1. Executive Summary

SplitStack v3.0.0 marks the completion of the three-stage refurbishment roadmap, transitioning SplitStack from a legacy Python/Flask application into a modern, full-stack, enterprise-grade personal finance and collaborative group expense-sharing platform built with vanilla web technologies, Node.js (Express), and MongoDB.

Every financial computation across the entire stack is calculated strictly in **integer paise** (₹1.00 = 100 paise), completely eradicating floating-point arithmetic errors.

---

## 2. Major Features & Architecture by Review

### Review 1: Semantic HTML5, CSS Design System & Visual Polish (P1–P4)
- **10 Dedicated Viewport Interfaces**: Dashboard, Expenses, Income, Budgets, Recurring Payments, Groups, Group Detail, Settlements, Shopping Lists, and Receipt Scan/Confirm.
- **Glassmorphic Design System**: Modern HSL-based color tokens, dark mode with custom palette, smooth micro-interactions, responsive sidebars, and accessible form controls.
- **HTML5 Validation**: Zero syntax or semantic errors across all 25 client HTML pages (`html-validate`).

### Review 2: Vanilla JavaScript Financial Engine & Domain Algorithms (P5–P8)
- **Zero Framework Bloat**: Pure modular ES6+ JavaScript client without bundlers or heavy third-party dependencies.
- **Integer Paise Arithmetic**: Strict integer-based currency engine preserving precision across all transactions.
- **Greedy Debt Simplification**: Custom $O(N \log N)$ algorithm minimizing circular pairwise group debts into the minimum practical number of direct settlement transfers.
- **Spending Velocity Forecast**: Deterministic end-of-month spending projection and budget overspend risk assessment.
- **Heuristic Insights & Notifications**: Automatic generation of budget warnings, upcoming bill reminders, and pending settlement alerts.
- **Client Offline Storage**: Robust `localStorage` store with automatic migration, export, and schema versioning.

### Review 3: Node.js, Express & MongoDB REST API Backend (P9–P15)
- **P9 Express Server Foundation**: Modular Express app with JSON body parsing (100kb limit), health checks (`/api/health`), 404 handler, and centralized error handling.
- **P10 Mongoose Data Models**: 12 normalized, fully validated Mongoose schemas (User, Category, Expense, Income, Budget, Recurring, Group, SharedExpense, Settlement, ShoppingList, Receipt, Insight).
- **P11 Authentication & REST API**: Industry-standard bcrypt password hashing (12 rounds), cryptographically signed JWT tokens, HttpOnly secure cookies, sliding-window rate limiting, and complete REST resource endpoints.
- **P12 Receipt Upload & Server OCR**: Multer-based multipart parsing with 5 MB ceiling, binary magic byte content inspection (PNG, JPEG, WEBP anti-spoofing), persistent GridFS binary storage, and Tesseract.js OCR candidate extraction.
- **P13 Frontend API Integration**: Dual-mode client data adapter (`api` vs `local`), HttpOnly credentials transport, in-memory tab-scoped Bearer token management, zero silent error fallback, and user-initiated local data migration.
- **P14 Database Seeding & CI Infrastructure**: Deterministic database seeder (`seed.js`) with strict production safeguards; 12-flow real MongoDB integration test suite (`integration.test.js`); and GitHub Actions workflow (`ci.yml`) using a disposable MongoDB 7.0 container service.
- **P15 Deployment Readiness & Containerization**: Production Dockerfile (non-root execution), `docker-compose.yml`, comprehensive deployment guide, and release readiness audit.

---

## 3. Automated Test Coverage & Verification

| Test Suite | Command | Test Count | Passing | Failures | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Client Unit Tests** | `npm run test:client` | 201 | 201 | 0 | **PASS** |
| **Server Unit Tests** | `npm run test:server:unit` | 123 | 123 | 0 | **PASS** |
| **HTML Validation** | `npm run lint:html` | 25 files | 25 | 0 | **PASS** |
| **Legacy Python Tests** | `python -m pytest tests/...` | 31 | 31 | 0 | **PASS** |
| **Real MongoDB Integration** | `npm run test:integration` | 12 flows | 0 | 0 | **NOT VERIFIED** (Documented `# SKIP` on local host without mongod) |
| **Remote GitHub Actions CI** | CI Workflow on Push | 6 jobs | — | — | **NOT VERIFIED** (Pending remote push per safety rules) |

---

## 4. Coexistence of the Legacy Flask Application

In strict adherence to the project charter:
- The entire legacy Python/Flask application (`app.py`, `config.py`, `Procfile`, `requirements.txt`, `modules/`, `templates/`, `static/`, `database/`, `ml/`, and `tests/`) is **100% preserved** in this release.
- All 31 executable legacy security, authentication, and regression tests continue to pass.
- **Removal Decision**: An explicit architectural decision and formal approval must be recorded prior to archiving or deleting the legacy Flask application in a future post-v3.0 maintenance cycle.

---

## 5. Security & Production Guardrails Summary

1. **Production Database Protection**: The database seeder refuses to run if `NODE_ENV === 'production'` or if the database name contains `prod`, `production`, or `live`.
2. **Credential Sanitization**: MongoDB connection strings are masked in logs (`***:***@host`), and password hashes/salts are stripped from all API outputs and Mongoose `toJSON()` serializations.
3. **Anti-MIME-Spoofing**: Receipt image uploads are validated via binary magic bytes; spoofed extensions or fake MIME types are rejected.
4. **Zero-Orphan Storage**: Compensating cleanups remove binary GridFS chunks if metadata persistence fails.
5. **Non-Root Docker Execution**: The application container executes under the unprivileged `node` user (UID 1000).

---

## 6. Known Limitations & Deferred Work

1. **Clustered Rate Limiting**: The current rate limiter operates in-memory. Multi-instance container clusters require an external Redis cache for unified rate limiting across instances.
2. **Decoupled CORS Configuration**: When hosting the frontend on a separate domain (e.g. GitHub Pages), explicit CORS headers and credentials allowlisting must be enabled.
3. **Transactional Email**: User invitations and group notices currently resolve within the application; external SMTP/SendGrid delivery is deferred.
4. **Tesseract Worker in Container**: OCR execution in resource-constrained environments (e.g. 512 MB RAM containers) may require dedicated worker allocation or offloading.

---

## 7. Release Recommendation

**Verdict: CONDITIONAL RELEASE APPROVAL**  
The codebase is clean, well-tested, documented, and architecturally sound. However, before the formal Git tag `v3.0.0` is published:
1. Local commits on `refurbish` must be pushed to a staging branch on GitHub to trigger the automated GitHub Actions CI pipeline.
2. The MongoDB integration suite must run green in the CI container environment.
3. Staging smoke tests must verify end-to-end user flows.
