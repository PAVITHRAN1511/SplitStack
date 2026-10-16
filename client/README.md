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
node --test tests/client/data-layer.test.mjs tests/client/render.test.mjs
```

All 25 pages validate with zero errors (config in `.htmlvalidate.json`). Text colours meet WCAG AA contrast. All 47 client unit and integration tests pass.

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
