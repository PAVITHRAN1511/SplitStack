# SplitStack client

Static front end of SplitStack. **Review 1 (HTML + CSS)**: every screen is a plain HTML page with sample data,
styled by a layered CSS design system. No JavaScript is used yet.

## View it

```bash
npm run client
```

Then open http://localhost:5500. Opening `index.html` directly from disk also works.

## Structure

```
index.html            landing page
pages/                24 app pages (dashboard, expenses, groups, settlements, shopping, OCR, ...)
css/main.css          entry point: imports the layers below in order
css/tokens.css        colours, type, spacing; dark default + light theme
css/base.css          reset, typography, focus ring, skip link
css/layout.css        app shell, sidebar, topbar, grids, responsive breakpoints
css/components.css    cards, buttons, forms, tables, meters, charts, ...
css/pages.css         page-specific pieces (hero, dashboard, receipt view)
css/utilities.css     small helpers
js/app.js             application entry point & dynamic page-module loader
js/core/              dom.js, format.js, render.js
js/ui/                theme.js, nav.js, confirm.js, toast.js, user.js
js/data/              store.js, seed.js, api.js
js/pages/             dynamic page modules (dashboard.js, expenses.js, ...)
assets/               favicon and the sample receipt image
```

## CSS techniques worth pointing out

| Technique | Where |
|---|---|
| Cascade layers (`@layer`) to control override order | `main.css` |
| Custom properties as design tokens; light theme via `prefers-color-scheme` and `[data-theme]` | `tokens.css` |
| Mobile drawer with no JS: hidden checkbox + `:has()` | `layout.css` |
| Equal/custom split toggle with no JS: `form:has(#split-custom:checked)` | `pages.css` |
| Purchased shopping items struck through: `.check-item:has(input:checked)` | `components.css` |
| Doughnut chart from `conic-gradient`, bar chart from flexbox + `--h` | `components.css` |
| Tables become labelled cards on phones via `td::before { content: attr(data-label) }` | `components.css` |
| Validation feedback only after interaction: `:user-invalid` | `components.css` |
| `color-mix()` for tinted category tags from one `--cat` colour | `components.css` |
| Fluid type with `clamp()`, `prefers-reduced-motion` support | `tokens.css` |

## Checks

```bash
npm run lint:html
npm run test:client
```

All 25 pages validate with zero errors (config in `.htmlvalidate.json`). Text colours meet WCAG AA contrast (minimum 4.5:1). All 176 client unit and integration tests pass across 52 suites.

## Data layer (Review 2, Step P2)

SplitStack's front end uses a modular client data layer in `client/js/data/`:
- `store.js`: Manages collections in `localStorage` under the versioned key `splitstack:v1`. Resilient to private browsing modes (in-memory fallback), quota limits, and corrupted storage (automatic reseed).
- `seed.js`: Realistic sample data matching Review 1 screens (Priya Raman, October 2026, 6 months historical analytics, groups, shared expenses, settlements, and shopping lists). All currency values are strictly stored as **integer paise** (₹1 = 100 paise).
- `api.js`: Asynchronous API module exposing Promises and structured `ApiError { field, message, status }` objects. This forms the exact contract that the Review 3 Node.js + Express REST API will implement. Password hashing in this client-only mode uses Web Crypto SHA-256 + salt strictly for demo authentication; the Review 3 Express backend will replace this with server-side bcrypt (cost factor 12) over HTTPS.

### `api.js` API Contract Functions

| Module | Functions |
|---|---|
| **Auth & Profile** | `register({ name, email, password })`, `login({ email, password })`, `logout()`, `currentUser()`, `updateProfile({ name, email, preferences })`, `changePassword({ currentPassword, newPassword })` |
| **Expenses** | `listExpenses(filters)` *(search, category, paymentMethod, startDate, endDate, sort, page, limit)*, `getExpense(id)`, `createExpense(data)`, `updateExpense(id, data)`, `removeExpense(id)` |
| **Income** | `listIncome(filters)`, `getIncome(id)`, `createIncome(data)`, `updateIncome(id, data)`, `removeIncome(id)` |
| **Categories** | `listCategories(type)`, `getCategory(id)`, `createCategory(data)`, `updateCategory(id, data)`, `removeCategory(id)` |
| **Budgets** | `listBudgets({ month, year })`, `createBudget(data)`, `updateBudget(id, data)`, `removeBudget(id)` |
| **Recurring** | `listRecurring()`, `createRecurring(data)`, `toggleRecurring(id)`, `removeRecurring(id)` |
| **Groups & Splitting** | `listGroups()`, `getGroup(id)`, `createGroup(data)`, `addMember(groupId, member)`, `removeMember(groupId, userId)`, `leaveGroup(groupId)`, `listSharedExpenses(groupId)`, `createSharedExpense(groupId, data)`, `getGroupBalances(groupId)`, `getSettlements(groupId)`, `recordSettlement(groupId, data)` |
| **Shopping Lists** | `listShoppingLists(groupId)`, `getShoppingList(id)`, `createShoppingList(data)`, `updateShoppingList(id, data)`, `removeShoppingList(id)`, `addShoppingItem(listId, item)`, `updateShoppingItem(listId, itemId, data)`, `toggleShoppingItem(listId, itemId)`, `removeShoppingItem(listId, itemId)`, `convertShoppingListToExpense(listId, categoryId)` |
| **Receipts** | `listReceipts()`, `getReceipt(id)`, `createReceipt(data)` |
| **Analytics & Insights** | `monthlySummary(monthsBack)`, `byCategory(month, year)`, `forecast()`, `insights()` |
| **Search & System** | `search(query)`, `resetDemoData()` |

## Page Rendering & UI Modules (Review 2, Step P3)

In Step P3, the static HTML pages are connected to `api.js` via modular page scripts located in `client/js/pages/`.
Each page module exports an `init()` function loaded dynamically by `app.js` using the body's `data-page` attribute.

### Key Architectural Rules
1. **API Abstraction**: Page modules import data operations **exclusively from `api.js`**. Direct imports from `store.js` or `seed.js` are strictly forbidden.
2. **Strict XSS Safety**: No dynamic user content is ever inserted using `innerHTML`. Content is rendered using `createEl()` and `textContent`.
3. **No-JS Fallback**: Hard-coded sample rows remain in HTML as a fallback for users without JavaScript. Dynamic JavaScript clears and re-renders containers only after data successfully returns.
4. **Accessible Loading & Empty States**: Containers set `aria-busy="true"` during asynchronous operations. Standardized accessible empty states (`renderEmptyState`) and error states (`renderErrorState`) are rendered when collections are empty or requests fail.

### Page Modules Connected in P3

| Page Module | HTML Page | Key Features Connected to `api.js` |
|---|---|---|
| `dashboard.js` | `dashboard.html` | Welcome summary, monthly KPI cards, recent transactions table, budgets status meters, your groups summary with net balance, smart insights, month-end forecast. |
| `expenses.js` | `expenses.html` | Debounced live search (250ms), category/method/date filters, URL query sync, 10-per-page pagination, empty state with "Clear filters" action. |
| `income.js` | `income.html` | Summary cards (this month, 3 months, side income share), chronological income table, empty state. |
| `budgets.js` | `budgets.html` | Overall monthly limit card with progress meter, category budget cards grid with progress meters and status badges (`ok`, `caution`, `warning`, `danger`). |
| `recurring.js` | `recurring.html` | Payment schedules table, active/paused count, next due date calculation, interactive toggle switches connected to `toggleRecurring()`. |
| `categories.js` | `categories.html` | Custom user categories list with delete actions, default system categories grid. |
| `groups.js` | `groups.html` | Group cards grid with member avatars, total spent, user net balance, status badge (`Open debts` / `All settled`), and settle-up links. |
| `group-detail.js` | `group-detail.html?id=...` | Reads group ID from query string, renders group header, shared expenses table, individual member net balances card (`Paid X · share Y`). |
| `settlements.js` | `settlements.html?groupId=...` | Reads group ID from query string, renders debt optimization statistics (pairwise debts, optimized payments, payments saved %), greedy transfer payment plan, member net balances, and settlement history. |
| `shopping.js` | `shopping.html` | Shopping list cards grid with progress meters (`X of Y bought`, estimated totals). |
| `shopping-detail.js` | `shopping-detail.html?id=...` | Reads list ID from query string, renders items checklist, interactive checkbox toggles, and live recomputed estimated vs actual variance totals. |
| `profile.js` | `profile.html` | User profile details, account statistics, "Reset demo data" action connected to `resetDemoData()`, and session logout. |
| `analytics.js` | `analytics.html` | 6-month summary stat cards, monthly trend table, category spending rankings with share progress meters. |
| `expense-edit.js` | `expense-edit.html?id=...` | Reads expense ID from query string, pre-fills form fields from `getExpense(id)` or displays graceful not-found alert. |

## Group Splitting and Debt Simplification (Review 2, Step P5)

Step P5 introduces the authoritative group accounting and debt simplification engine in `client/js/domain/`:
- `splits.js`: Domain functions for equal splits and custom split validation.
- `settle.js`: Domain functions for net balance aggregation and greedy minimum-cash-flow debt simplification.

### 1. Balance Sign Convention
- **Positive balance (`> 0`)**: The member is a **creditor**. They have paid more than their allocated share and the group owes them money.
- **Negative balance (`< 0`)**: The member is a **debtor**. They have paid less than their allocated share and owe money to the group.
- **Zero balance (`= 0`)**: The member is **settled**. They neither owe nor are owed money.

#### Mathematical Conservation Invariant
In every valid closed group, the sum of all members' net balances is identically zero:
$$\sum_{m \in \text{members}} \text{netBalance}(m) = 0$$
This is strictly verified in `calculateNetBalances()` and guaranteed in integer paise arithmetic.

### 2. Equal Split Remainder Policy
When dividing an expense amount in integer paise among $N$ participants where $A \pmod N \neq 0$:
- Each participant receives a base share of $\lfloor A / N \rfloor$ paise.
- The leftover remainder paise $R = A \pmod N$ is deterministically allocated to the **paying member** (if the payer is among participants), or to the **first participant** in the list.
- This policy guarantees that every member share is an exact integer number of paise, and $\sum \text{shares} \equiv \text{total expense amount}$ without rounding drift or lost paise.

### 3. Greedy Minimum-Cash-Flow Simplification Algorithm
The simplification algorithm (`simplifyDebts`) converts net balances into an optimized payment plan:
1. Partitions members into debtors ($B < 0$) and creditors ($B > 0$).
2. Sorts debtors descending by absolute debt, and creditors descending by credit (with stable tie-breaking by member ID).
3. Repeatedly matches the largest debtor with the largest creditor, transfers $\min(\text{debt}, \text{credit})$, and updates both balances until all debts reach zero.
4. Produces at most $N - 1$ transfers for $N$ members.

#### Algorithmic Note on Optimality & Limitations
The greedy approach provides an efficient $O(N \log N)$ algorithm that drastically minimizes transactions (e.g., reducing 6 pairwise debts to 3 payments in a 4-person group). However, finding the globally absolute minimum number of transactions across arbitrary subsets is an **NP-hard problem** (reducible to the subset-sum partition problem). The greedy simplification approach is the established industry standard (used by Splitwise and similar applications) for predictable, deterministic settlements.

### 4. Settlement Rules & Validation
Settlements are recorded via `api.recordSettlement(groupId, { payerId, payeeId, amount })`:
- **Group membership**: Both payer and payee must be valid, distinct members of the group (`payerId !== payeeId`).
- **Directional validity**: The payer must currently be a debtor (`net < 0`) and the payee must currently be a creditor (`net > 0`).
- **Debt limit**: The payment amount cannot exceed the minimum of the payer's outstanding debt and the payee's outstanding credit ($\le \min(-\text{payerNet}, \text{payeeNet})$).
- **Paise integrity**: All settlements are positive integer paise ($> 0$).
- **Duplicate debounce**: Rapid identical submissions ($< 2000\text{ms}$) are rejected to prevent accidental double-clicks.
- **Balance recalculation**: Recording or removing (`api.removeSettlement`) a settlement updates group balances immediately while leaving original shared expense records intact.

## Analytics, Forecasts, Insights, Search & Notifications (Review 2, Step P6)

Step P6 introduces comprehensive financial analytics, linear velocity forecasting, explainable insights, global cross-collection search, and in-app notifications:

### 1. Analytics & Visualizations (`client/js/ui/charts.js`)
- **Chart.js 4 Integration**: Dynamically loads pinned Chart.js 4 (`https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js`) with complete offline and failure fallback to pure CSS charts (`.bar-chart` and `.donut`).
- **Dynamic Theme Palette**: Extracts active design tokens (`--primary`, `--success`, `--danger`, `--warning`, `--text`, `--border`, `--cat-*`) via `window.getComputedStyle(document.documentElement)`.
- **Automatic Theme Synchronization**: Watches `<html data-theme>` changes via `MutationObserver` and updates rendered chart palettes automatically.
- **Accessibility**: Each canvas is configured with `role="img"`, a detailed programmatic `aria-label`, and is paired with a visually hidden or expandable data table.
- **Lifecycle Management**: Tracks active chart instances and executes `chart.destroy()` before re-rendering or upon filter changes to prevent duplicate instances and memory leaks.

### 2. Spending Velocity Forecasting (`client/js/domain/forecast.js`)
- **Velocity Model**: Calculates current daily velocity ($\text{dailyAverage} = \lfloor \text{currentSpent} / \text{daysPassed} \rfloor$) and projects month-end totals ($\text{projectedTotal} = \text{dailyAverage} \times \text{totalDaysInMonth}$).
- **Data Sufficiency Rule**: Requires at least 3 transactions in the current month (`hasSufficientData: true`) before making linear predictions. Sparse or empty datasets cleanly report insufficient data rather than generating spurious predictions.
- **Calendar Boundary Accuracy**: Uses local calendar dates to prevent UTC timezone shifts from misclassifying month boundaries. Handles leap years and month ends cleanly.
- **Strict Integer-Paise Arithmetic**: All financial values, daily rates, and projected totals are calculated and stored as integer paise.
- **Budget Risk Classification**:
  - `danger`: Projected spend $> 100\%$ of budget.
  - `warning`: Projected spend between $90\%$ and $100\%$ of budget.
  - `caution`: Projected spend between $75\%$ and $89\%$ of budget.
  - `ok`: Projected spend $< 75\%$ of budget.

### 3. Smart Spending Insights (`client/js/domain/insights.js`)
- **Deterministic & Explainable**: Every insight is derived strictly from real user records and transparent arithmetic without external AI services or data transmission.
- **Budget Alerts**: Highlights categories approaching or exceeding limits with exact over/under paise figures.
- **Month-over-Month Category Trends**: Detects spending changes $\ge 20\%$ compared with the previous calendar month. Safely handles zero-spending baseline periods without division-by-zero errors.
- **Upcoming Recurring Payments**: Flags active recurring bills due within the next 7 days, computing relative days remaining and formatted due dates.
- **Group Balance Summaries**: Alerts users when they have net outstanding debts or credits across shared groups.
- **Deduplication & Isolation**: Insights have deterministic IDs and are strictly isolated to the authenticated user.

### 4. Global Search & Autocomplete (`client/js/ui/search.js`)
- **Debounced Combobox**: 200ms input debounce calling `api.search(query)`.
- **Full WAI-ARIA Combobox Pattern**: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls="global-search-listbox"`, and `aria-activedescendant`.
- **Keyboard Navigation**: ArrowDown / ArrowUp moves selection, Enter navigates directly to the selected resource, and Escape closes the dropdown.
- **Multi-Domain Results**: Searches case-insensitively across expenses, income, groups, and shopping lists, matching descriptions, notes, and category names.

### 5. In-App Notifications (`client/js/ui/notifications.js`)
- **Topbar Bell Indicator**: Connects the bell icon to live notifications derived from active insights. Dynamically toggles unread dot indicator and updates `aria-label`.
- **Accessible Panel**: Toggles an accessible notification list panel with item tones (`danger`, `warning`, `info`, `success`) and timestamps.
- **Persistence**: Persists individual read states and "Mark all as read" in `user.preferences.readNotifications` through `api.js`.

## Shopping Checklist & Receipt Scanning Preview (Review 2, Step P7)

Step P7 completes the shopping checklist workflow and implements a client-side receipt scanning and review preview:

### 1. Interactive Shopping Checklist (`client/js/pages/shopping-detail.js` & `shopping-form.js`)
- **Full List Lifecycle**: Create new lists, view checklist items with live progress, edit list metadata (name, budget, group association) via `shopping-form.html?id=...`, and delete lists with `confirmDialog`.
- **Inline Item Editing**: Directly edit item name, quantity, estimated unit price, and actual price inline within the row without page reloads.
- **Optimistic State Toggling**: Live status changes update checklist checkboxes and recalculate totals instantly with automatic rollback if the API operation fails.
- **Destructive Action Guards**: Removing items or deleting lists is guarded by accessible confirmation dialogs (`confirmDialog`).
- **Duplicate Conversion Prevention**: Lists can only be converted to expenses once. When converted, the list records `convertedExpenseId`, and the convert button is disabled to prevent duplicate expense creation.

### 2. Receipt Scanning Preview & Validation (`client/js/domain/receipt.js`, `receipt-scan.js`, `receipt-confirm.js`)
- **Client-Side File Validation**: Enforces MIME types (`image/png`, `image/jpeg`, `image/webp`), valid image extensions, and a 5 MB maximum size limit. Malicious filenames are sanitized against path traversal and XSS.
- **Temporary In-Memory Preview**: Generates object URLs with memory cleanup (`URL.revokeObjectURL`) and supports drag-and-drop file selection with `.is-dragover` styling.
- **Cancel / Reset Controls**: Allows users to clear the selected receipt image and reset the dropzone anytime.
- **Honest Client-Side OCR Boundary**: No external OCR calls or fabricated extractions. The UI honestly labels the client preview state, displaying manual review candidate fields and reserving automated Tesseract/server-side OCR for Review 3.
- **Editable Review Step**: Extracted/candidate fields (merchant, amount in integer paise, date, category, payment method) are fully editable before saving.
- **Prevention of Accidental Writes**: No expenses or shopping items are created without explicit confirmation by the user. Discarding cleanly removes temporary state and navigates back.

## Review 2 JavaScript Concepts & Architecture Summary

| JavaScript Concept | Implementation in SplitStack | Key Module(s) |
|---|---|---|
| **ES Modules (`import` / `export`)** | Native browser module system with dynamic module loading (`import()`) keyed by `body[data-page]`. | `client/js/app.js`, `client/js/data/api.js` |
| **DOM Traversal & Manipulation** | Safe element creation (`createEl`), attribute management, and safe string rendering using `textContent` (zero `innerHTML` injection). | `client/js/core/dom.js`, `client/js/core/render.js` |
| **Event Handling & Delegation** | Centralized event listener registration and hierarchical event delegation for dynamic tables and checklists. | `client/js/core/dom.js`, `client/js/pages/shopping-detail.js` |
| **Asynchronous Programming** | Universal `async`/`await` patterns, Promise-wrapped data interfaces, error mapping, and optimistic UI updates with automatic error rollback. | `client/js/data/api.js`, `client/js/pages/*.js` |
| **Constraint Validation API** | Field validation using native HTML5 constraint validation (`checkValidity`, `:user-invalid`), custom rules, and ARIA accessibility error linking (`aria-describedby`, `aria-invalid`). | `client/js/ui/forms.js` |
| **Accessible Dialog & Focus Trapping** | Native `<dialog>` modal element (`showModal`, `close`), keyboard focus trapping in mobile drawer, and focus restoration to trigger elements. | `client/js/ui/confirm.js`, `client/js/ui/nav.js` |
| **Internationalization (Intl API)** | Standardized Indian Rupee formatting via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` and localized date string formatting. | `client/js/core/format.js` |
| **Storage & State Persistence** | Versioned collection persistence in `localStorage` under `splitstack:v1`, resilient to private browsing (in-memory fallback) and auto-recovering from corrupted payloads. | `client/js/data/store.js` |
| **Web Cryptography API** | Standard UUID generation (`crypto.randomUUID`) and cryptographic hashing (`crypto.subtle.digest('SHA-256')`) with random salts for client demo authentication. | `client/js/data/store.js`, `client/js/data/api.js` |
| **URL State & Query String Sync** | Deep-linkable UI states via `URLSearchParams` and `history.pushState` for filtering, pagination, and cross-page entity references (`?id=...`, `?groupId=...`). | `client/js/pages/expenses.js`, `client/js/pages/group-detail.js` |
| **MutationObserver & Dynamic Themes** | Real-time observation of `<html data-theme>` attribute modifications to synchronize canvas chart palettes and component theming without page reloads. | `client/js/ui/charts.js`, `client/js/ui/theme.js` |
| **Drag & Drop API** | HTML5 drag-and-drop dropzone with `dragenter`, `dragover`, `dragleave`, and `drop` event listeners and `.is-dragover` styling. | `client/js/pages/receipt-scan.js` |
| **File API & In-Memory Previews** | Client-side MIME and size validation, in-memory object URL rendering via `URL.createObjectURL`, and memory cleanup via `URL.revokeObjectURL`. | `client/js/domain/receipt.js`, `client/js/pages/receipt-scan.js` |
| **Algorithmic Graph Simplification** | Greedy minimum-cash-flow algorithm reducing $O(N^2)$ circular group debts into at most $N-1$ direct transfers while preserving zero-sum balance conservation. | `client/js/domain/settle.js` |
| **Statistical Forecasting Model** | Linear daily velocity spending projection with explicit minimum transaction data-sufficiency gating ($\ge 3$ transactions) and calendar-boundary safety. | `client/js/domain/forecast.js` |
| **WAI-ARIA Combobox & Listbox** | Accessible live-search pattern (`role="combobox"`, `role="listbox"`, `aria-activedescendant`) with 200ms input debouncing and full keyboard navigation. | `client/js/ui/search.js` |

## Review 3 Frontend API Integration (Step P13)

In Step P13, SplitStack's frontend data layer is integrated with the Express and MongoDB backend (`/api`) while maintaining full backwards compatibility for offline/local storage mode and existing unit tests.

### 1. Architecture & Dual-Mode Dispatch (`api-http.js` and `api.js`)
- **Centralized Dispatcher**: `client/js/data/api-http.js` provides centralized fetch handling with base URL configuration (`getApiBaseUrl()`, `setApiBaseUrl()`), automatic query string serialization, HttpOnly cookie transport (`credentials: 'include'`), in-memory tab-scoped Bearer token management, and structured error normalization to `ApiError { message, field, status }`.
- **Mode Delegation**: `client/js/data/api.js` delegates transparently to `api-http.js` when in `'api'` mode and to `store.js` when in `'local'` mode.
  - In a real browser running on `http:` or `https:`, `getApiMode()` defaults to `'api'`.
  - In Node test environments, `getApiMode()` defaults to `'local'`, ensuring all 176 Review 2 unit tests run without modification.
  - Operating mode can be toggled via `setApiMode('api' | 'local')`.
- **Strictly No Silent Fallback**: When in `'api'` mode, any server error (400, 401, 404, 500) or network failure throws an `ApiError` directly to the page form/component. It **never** silently writes data to `localStorage` or falsely implies that data was saved to the server.

### 2. Authentication & Session Transport
- **Zero Insecure Storage**: Passwords and long-lived JWT tokens are never stored in `localStorage`.
- **Transport**: Standard session management uses `credentials: 'include'` for HttpOnly cookies. Tab-scoped Bearer tokens are kept in memory and synchronized only to `sessionStorage`.
- **Session Verification**: The active user session is verified via `GET /api/auth/me` (`httpCurrentUser()`), validating against the server session rather than trusting a client-supplied user ID.
- **Session Invalidation**: Receiving an HTTP 401 Unauthorized automatically clears in-memory tokens.
- **Logout**: `httpLogout()` calls `POST /api/auth/logout` to clear server cookies and clears client in-memory tokens.

### 3. Receipt Upload & Server-Side OCR Workflow
- **Multipart Form Upload**: `httpUploadReceipt(file)` uploads binary image files via `FormData` using the exact field name `receipt` expected by the backend without manually setting multipart boundary headers.
- **Progress & Loading State**: `receipt-scan.js` disables the submit button and displays a live pending state (`Uploading & scanning receipt...`).
- **Unverified OCR Candidate Review**: Extracted OCR metadata (`candidate { merchant, amount, date, confidence }`) is passed via tab session storage to `receipt-confirm.js`, pre-filling form inputs as unverified suggestions with confidence badges.
- **Explicit Confirmation**: Expenses are created only after the user explicitly reviews/edits fields and clicks "Confirm & save", calling `POST /api/receipts/:id/confirm` with integer paise.
- **Duplicate Protection**: Button debounce prevents multi-clicks. Server 409 Conflict responses are mapped to a clear user warning without data duplication.
- **Local vs Server Distinction**: Badges and figcaptions clearly distinguish local client previews from server-processed receipts.

### 4. Local Data Migration & Recovery
- **Non-Destructive Snapshot**: `exportLocalData()` provides a snapshot of `localStorage` (`splitstack:v1`) without modifying or deleting any records.
- **Deliberate Migration**: `importLocalDataToServer()` provides a deliberate, user-initiated migration helper that verifies an authenticated session, validates records, and imports categories, expenses, income, groups, and shopping lists to the server database.

