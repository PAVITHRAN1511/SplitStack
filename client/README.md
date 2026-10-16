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
npx html-validate "client/**/*.html"
```

All pages validate with zero errors (config in `.htmlvalidate.json`). Text colours meet WCAG AA contrast.

## Data layer (Review 2)

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

