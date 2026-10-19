# SplitStack · Review 1 (HTML5 & CSS3 Frontend)

This folder contains the complete, standalone HTML5 and CSS3 frontend for **SplitStack**, prepared as an official artifact repository link for the **Review 1 Presentation** (Web Technology Course).

All files in this directory are exact, byte-for-byte copies of the refurbished frontend located in [`client/`](../client/). No files have been rewritten, reformatted, or simplified.

---

## 1. Folder Structure & Path Preservation

The files are organized to preserve the original relative linking structure between the landing page, application sub-pages, and modular CSS stylesheets without modifying any source code:

```
review-1-html-css/
├── README.md               # This documentation and file manifest
├── index.html              # Public landing page and feature showcase
├── css/                    # Layered CSS3 design system (7 stylesheets)
│   ├── base.css            # CSS reset, typography base, focus rings, skip link
│   ├── components.css      # Reusable UI components, glassmorphic cards, meters, charts
│   ├── layout.css          # App shell, responsive grid, sidebar, no-JS mobile drawer
│   ├── main.css            # Master stylesheet with @layer cascade management
│   ├── pages.css           # Page-specific styling (hero, split toggles, receipt view)
│   ├── tokens.css          # Design tokens: colours, typography, spacing, dark/light theme
│   └── utilities.css       # Utility classes (spacing, alignment, display)
└── pages/                  # Application views with sample data (24 HTML pages)
    ├── 404.html            # Custom accessible 404 error page
    ├── analytics.html      # 6-month trajectory trends & category distributions
    ├── budgets.html        # Budget limits, progress gauges, and threshold alerts
    ├── categories.html     # Custom spending categories & color tags
    ├── dashboard.html      # Main user overview (KPIs, transactions, budgets, groups)
    ├── expense-edit.html   # Edit existing expense form
    ├── expense-form.html   # Add new expense form
    ├── expenses.html       # Searchable, filterable expense history
    ├── group-create.html   # Collaborative group creation form
    ├── group-detail.html   # Group overview, member balances & shared activity
    ├── groups.html         # Expense-sharing groups list
    ├── income-form.html    # Add income stream form
    ├── income.html         # Income tracker & earnings history
    ├── login.html          # Authentication login screen
    ├── profile.html        # User profile, notification & theme settings
    ├── receipt-confirm.html# OCR receipt verification & confirmation form
    ├── receipt-scan.html   # Receipt upload & OCR scanner interface
    ├── recurring.html      # Subscriptions & recurring bill schedules
    ├── register.html       # User account registration screen
    ├── settlements.html    # Greedy debt settlement cash flow minimization view
    ├── shared-expense-form.html # Multi-party group bill split form (equal/custom)
    ├── shopping-detail.html# Itemized shopping checklist with price estimates
    ├── shopping-form.html  # Create/edit shopping list form
    └── shopping.html       # Shared & personal shopping lists dashboard
```

### Why this organization was chosen
- **Relative Path Integrity**: In `index.html`, `<link rel="stylesheet" href="css/main.css">` resolves directly to `css/main.css`. In all 24 sub-pages under `pages/`, `<link rel="stylesheet" href="../css/main.css">` resolves cleanly to `../css/main.css`.
- **Inter-Page Navigation**: Relative links between pages (e.g. `dashboard.html` to `analytics.html`, and `login.html` to `../index.html`) continue to function without broken paths.
- **CSS Import Hierarchy**: Within `css/main.css`, all `@import url("...")` statements reference sibling files within `css/`, ensuring the `@layer` rules load correctly.
- **Zero Modification**: No file content required alteration or path rewriting, preserving exact SHA-256 cryptographic checksums.

---

## 2. Inventory of Files

| Category | File Count | File List |
|---|---|---|
| **Root HTML** | 1 file | `index.html` |
| **App Pages (HTML)** | 24 files | `pages/404.html`, `pages/analytics.html`, `pages/budgets.html`, `pages/categories.html`, `pages/dashboard.html`, `pages/expense-edit.html`, `pages/expense-form.html`, `pages/expenses.html`, `pages/group-create.html`, `pages/group-detail.html`, `pages/groups.html`, `pages/income-form.html`, `pages/income.html`, `pages/login.html`, `pages/profile.html`, `pages/receipt-confirm.html`, `pages/receipt-scan.html`, `pages/recurring.html`, `pages/register.html`, `pages/settlements.html`, `pages/shared-expense-form.html`, `pages/shopping-detail.html`, `pages/shopping-form.html`, `pages/shopping.html` |
| **CSS Stylesheets** | 7 files | `css/base.css`, `css/components.css`, `css/layout.css`, `css/main.css`, `css/pages.css`, `css/tokens.css`, `css/utilities.css` |
| **Documentation** | 1 file | `README.md` |
| **Total Files** | **33 files** | (32 copied frontend assets + 1 README) |

---

## 3. Key CSS Techniques & Architecture

The CSS design system implements modern CSS3 standards without external CSS frameworks:

1. **Explicit Cascade Layers (`@layer`)**: `main.css` defines `@layer tokens, base, layout, components, pages, utilities;` to ensure strict override order regardless of selector specificity.
2. **Design Tokens via CSS Custom Properties**: `tokens.css` defines responsive spacing, dark-slate glassmorphism tokens, semantic color palettes (income, expense, warning, danger), and typography scales.
3. **Dual Theme Architecture (Zero-FOUC)**: Native dark theme default with light theme support triggered via `prefers-color-scheme: light` or `[data-theme="light"]`.
4. **No-JS Mobile Drawer**: `layout.css` implements an off-canvas responsive mobile drawer navigation using a hidden checkbox hack and the `:has()` relational pseudo-class (`.app-shell:has(#nav-toggle:checked)`).
5. **Dynamic Split Switcher without JS**: `pages.css` toggles equal versus custom splitting inputs automatically using `form:has(#split-custom:checked) .split-custom-panel`.
6. **Pure CSS Data Visualizations**:
   - Doughnut chart: Rendered using CSS `conic-gradient()` with tokenized variables (`components.css`).
   - Bar charts: Rendered using flexbox columns driven by inline custom property heights `--h` (`components.css`).
   - Budget meters: Progress bars with CSS variables `--value` and contextual state coloring (`.meter.is-caution`, `.meter.is-danger`).
7. **Responsive Table Transformations**: Data tables gracefully transform on mobile viewports into stacked, labeled cards using `td::before { content: attr(data-label) }`.
8. **Modern Form Feedback**: Interactive validation states use `:user-invalid` so inputs only display warning styles after the user has interacted with them.
9. **Fluid Typography**: Fluid headings and text scaling using `clamp()` expressions.
10. **Accessibility First**: WCAG AA compliant color contrast (minimum 4.5:1 ratio throughout), dedicated skip link (`.skip-link`), visible high-contrast focus rings, and `prefers-reduced-motion` media queries.

---

## 4. Dependencies & Non-Copied Assets

To maintain repository hygiene and avoid duplicating binary assets, unrelated files, or exposing secrets, only the HTML and CSS source files were copied into this review package. The HTML files reference the following dependencies:

### External CDN Dependencies
- **Web Fonts**: Google Fonts (`Outfit` for headings, `Inter` for body copy) linked via CDN preconnect.
- **Icons**: FontAwesome 6 Free icon set loaded from cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css`).

### Local Project Assets (Kept in Original Paths)
- **Brand Favicon**: `<link rel="icon" href="../assets/favicon.svg">` (located at `client/assets/favicon.svg`).
- **Sample Receipt**: `receipt-confirm.html` references the demo receipt image at `client/assets/sample-receipt.webp`.
- **Modular JavaScript Engine**: HTML files contain `<script type="module" src="../js/app.js"></script>`. For Review 1, all 25 screens include hard-coded sample data, semantic fallback rows, and CSS-only interactive toggles, making the entire UI reviewable and visualizable without requiring the JavaScript engine. The modular client JavaScript is part of **Review 2**.
- **Backend / Database**: Express REST API and MongoDB backend components are contained separately in `server/` as part of **Review 3**.

### Security & Hygiene
- **No secrets or credentials**: No `.env` files, API tokens, database connection strings, or private keys are present in this folder.
- **No dependencies or build artifacts**: `node_modules/`, Python virtual environments (`.venv/`, `venv/`), and build output are excluded.

---

## 5. Verification & Integrity

All 32 copied HTML and CSS files have been cryptographically verified against their original counterparts in `client/` using SHA-256 hashes:
- **HTML files matching originals**: 25 / 25 (100% byte-for-byte match)
- **CSS files matching originals**: 7 / 7 (100% byte-for-byte match)
- **Mismatches / Corruptions**: 0
