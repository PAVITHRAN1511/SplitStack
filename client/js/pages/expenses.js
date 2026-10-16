/**
 * Expenses page module (Review 2, Step P3).
 * Connects expenses.html to api.js with live debounced filtering, query-string sync,
 * 10-per-page pagination, and accessible empty/loading states.
 */

import { listExpenses, listCategories, removeExpense } from '../data/api.js';
import { qs, qsa, on, createEl } from '../core/dom.js';
import { formatINR, formatDate } from '../core/format.js';
import { setLoading, clearElement, renderEmptyState, renderErrorState } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';

let categoryMap = new Map();
let debounceTimer = null;

const PAGE_SIZE = 10;

/**
 * Get current filter parameters from form/inputs and URL.
 * @returns {Object}
 */
function getFilterParams() {
  const url = new URL(window.location.href);
  const searchInput = qs('#f-search');
  const catSelect = qs('#f-cat');
  const methodSelect = qs('#f-method');
  const fromInput = qs('#f-from');
  const toInput = qs('#f-to');
  const sortSelect = qs('#sort');

  const page = parseInt(url.searchParams.get('page') || '1', 10);

  return {
    q: searchInput ? searchInput.value.trim() : (url.searchParams.get('q') || ''),
    category: catSelect ? catSelect.value : (url.searchParams.get('category') || ''),
    method: methodSelect ? methodSelect.value : (url.searchParams.get('method') || ''),
    from: fromInput ? fromInput.value : (url.searchParams.get('from') || ''),
    to: toInput ? toInput.value : (url.searchParams.get('to') || ''),
    sort: sortSelect ? sortSelect.value : (url.searchParams.get('sort') || 'Newest first'),
    page: isNaN(page) || page < 1 ? 1 : page,
    limit: PAGE_SIZE
  };
}

/**
 * Sync active filter parameters to URL search params without page reload.
 * @param {Object} params
 */
function syncUrlParams(params) {
  const url = new URL(window.location.href);
  const keys = ['q', 'category', 'method', 'from', 'to', 'sort'];

  for (const key of keys) {
    if (params[key]) {
      url.searchParams.set(key, params[key]);
    } else {
      url.searchParams.delete(key);
    }
  }

  if (params.page > 1) {
    url.searchParams.set('page', String(params.page));
  } else {
    url.searchParams.delete('page');
  }

  window.history.replaceState({}, '', url.toString());
}

/**
 * Render a single expense row safely.
 * @param {Object} expense
 * @returns {HTMLTableRowElement}
 */
function renderExpenseRow(expense) {
  const cat = categoryMap.get(expense.categoryId) || {
    name: expense.categoryId || 'Other',
    icon: 'fa-tag',
    color: 'var(--cat-other)'
  };

  const tr = createEl('tr');

  // Date column
  const dateTd = createEl('td', { 'data-label': 'Date' }, [
    createEl('time', {
      datetime: expense.date || '',
      className: 'text-dim',
      textContent: formatDate(expense.date)
    })
  ]);

  // Description column
  const descTd = createEl('td', {
    'data-label': 'Description',
    className: 'fw-600',
    textContent: expense.description || 'Expense'
  });

  // Category column
  const catTag = createEl('span', {
    className: 'cat-tag',
    style: { '--cat': `var(--cat-${expense.categoryId}, ${cat.color || 'var(--cat-other)'})` }
  }, [
    createEl('i', { className: `fa-solid ${cat.icon || 'fa-tag'}`, 'aria-hidden': 'true' }),
    cat.name
  ]);
  const catTd = createEl('td', { 'data-label': 'Category' }, [catTag]);

  // Method column
  const methodTd = createEl('td', { 'data-label': 'Method' }, [
    createEl('span', { className: 'badge', textContent: expense.paymentMethod || 'UPI' })
  ]);

  // Amount column
  const amountFormatted = `−${formatINR(expense.amount)}`;
  const amountTd = createEl('td', {
    'data-label': 'Amount',
    className: 'end num amount-out',
    textContent: amountFormatted
  });

  // Actions column
  const editLink = createEl('a', {
    className: 'icon-btn sm',
    href: `expense-edit.html?id=${encodeURIComponent(expense.id)}`,
    'aria-label': `Edit ${expense.description || 'expense'}`
  }, [
    createEl('i', { className: 'fa-solid fa-pen', 'aria-hidden': 'true' })
  ]);

  const deleteBtn = createEl('button', {
    className: 'icon-btn sm danger',
    type: 'submit',
    'aria-label': `Delete ${expense.description || 'expense'}`
  }, [
    createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
  ]);

  const deleteForm = createEl('form', {
    className: 'inline-form',
    action: '#',
    method: 'post'
  }, [deleteBtn]);

  deleteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const confirmed = await confirmDialog({
      title: 'Delete expense',
      message: `Are you sure you want to delete "${expense.description || 'this expense'}"? This action cannot be undone.`,
      confirmText: 'Delete'
    });
    if (!confirmed) return;
    try {
      await removeExpense(expense.id);
      showToast('Expense deleted', 'info');
      await loadAndRenderExpenses();
    } catch (err) {
      showToast(err.message || 'Failed to delete expense', 'danger');
    }
  });

  const actionsWrapper = createEl('div', { className: 'row-actions' }, [editLink, deleteForm]);
  const actionsTd = createEl('td', { 'data-label': 'Actions', className: 'end' }, [actionsWrapper]);

  tr.append(dateTd, descTd, catTd, methodTd, amountTd, actionsTd);
  return tr;
}

/**
 * Fetch and render expenses based on current filters.
 */
async function loadAndRenderExpenses() {
  const tbody = qs('table.table tbody');
  const tfoot = qs('table.table tfoot');
  const cardBody = qs('.card-body.flush');
  const cardFooter = qs('.card-footer');
  const heading = qs('#exp-list-title');

  if (!tbody) return;

  const params = getFilterParams();
  syncUrlParams(params);

  setLoading(cardBody, true);

  try {
    const result = await listExpenses({
      q: params.q,
      category: params.category,
      paymentMethod: params.method,
      startDate: params.from,
      endDate: params.to,
      sort: params.sort,
      page: params.page,
      limit: params.limit
    });

    setLoading(cardBody, false);
    clearElement(tbody);

    const expenses = result.expenses || [];
    const totalCount = result.total || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    // Update list heading
    if (heading) {
      if (params.from && params.to && params.from.slice(0, 7) === params.to.slice(0, 7)) {
        const d = new Date(params.from);
        heading.innerHTML = '';
        heading.append(
          createEl('i', { className: 'fa-solid fa-list', 'aria-hidden': 'true' }),
          ` ${d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`
        );
      } else {
        heading.innerHTML = '';
        heading.append(
          createEl('i', { className: 'fa-solid fa-list', 'aria-hidden': 'true' }),
          ' Filtered expenses'
        );
      }
    }

    if (expenses.length === 0) {
      if (tfoot) tfoot.style.display = 'none';
      if (cardFooter) cardFooter.style.display = 'none';

      const emptyRow = createEl('tr', {}, [
        createEl('td', { colspan: '6', className: 'p-0' }, [
          renderEmptyState(createEl('div'), {
            icon: 'fa-receipt',
            title: 'No expenses found',
            message: 'No expenses match your current filters. Try clearing filters.',
            actionText: 'Clear filters',
            onAction: () => {
              resetFilters();
            }
          })
        ])
      ]);
      tbody.appendChild(emptyRow);
      return;
    }

    if (tfoot) tfoot.style.display = '';
    if (cardFooter) cardFooter.style.display = '';

    // Render table rows
    let pageSumPaise = 0;
    for (const exp of expenses) {
      pageSumPaise += exp.amount || 0;
      tbody.appendChild(renderExpenseRow(exp));
    }

    // Update table footer summary
    if (tfoot) {
      const shownTd = qs('td[data-label="Shown"]', tfoot);
      const totalTd = qs('td[data-label="Total"]', tfoot);
      if (shownTd) shownTd.textContent = `Total of ${expenses.length} shown (${totalCount} total)`;
      if (totalTd) totalTd.textContent = formatINR(pageSumPaise);
    }

    // Update pagination controls
    if (cardFooter) {
      const pageInfo = qs('.text-dim', cardFooter);
      if (pageInfo) {
        pageInfo.textContent = `Page ${params.page} of ${totalPages}`;
      }

      const paginationNav = qs('nav[aria-label="Pagination"]', cardFooter);
      if (paginationNav) {
        clearElement(paginationNav);

        const prevBtn = createEl('a', {
          className: 'btn btn-secondary btn-sm',
          textContent: 'Previous',
          role: 'button'
        });

        if (params.page <= 1) {
          prevBtn.setAttribute('aria-disabled', 'true');
        } else {
          prevBtn.href = `expenses.html?page=${params.page - 1}`;
          on(prevBtn, 'click', (e) => {
            e.preventDefault();
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set('page', String(params.page - 1));
            window.history.replaceState({}, '', nextUrl.toString());
            loadAndRenderExpenses();
          });
        }

        const nextBtn = createEl('a', {
          className: 'btn btn-secondary btn-sm',
          textContent: 'Next',
          role: 'button'
        });

        if (params.page >= totalPages) {
          nextBtn.setAttribute('aria-disabled', 'true');
        } else {
          nextBtn.href = `expenses.html?page=${params.page + 1}`;
          on(nextBtn, 'click', (e) => {
            e.preventDefault();
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set('page', String(params.page + 1));
            window.history.replaceState({}, '', nextUrl.toString());
            loadAndRenderExpenses();
          });
        }

        paginationNav.append(prevBtn, nextBtn);
      }
    }
  } catch (err) {
    setLoading(cardBody, false);
    clearElement(tbody);
    renderErrorState(tbody, 'Error loading expenses. Please try again.', loadAndRenderExpenses);
  }
}

/**
 * Reset all filter inputs to default and re-render.
 */
function resetFilters() {
  const searchInput = qs('#f-search');
  const catSelect = qs('#f-cat');
  const methodSelect = qs('#f-method');
  const fromInput = qs('#f-from');
  const toInput = qs('#f-to');
  const sortSelect = qs('#sort');

  if (searchInput) searchInput.value = '';
  if (catSelect) catSelect.value = '';
  if (methodSelect) methodSelect.value = '';
  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  if (sortSelect) sortSelect.selectedIndex = 0;

  const url = new URL(window.location.href);
  url.search = '';
  window.history.replaceState({}, '', url.pathname);

  loadAndRenderExpenses();
}

/**
 * Initialize expenses page module.
 */
export async function init() {
  try {
    // Load category definitions for labels and colors
    const cats = await listCategories();
    categoryMap = new Map((cats || []).map((c) => [c.id, c]));
  } catch (err) {
    console.warn('[SplitStack] Could not load categories map:', err);
  }

  // Pre-fill inputs from URL query string
  const url = new URL(window.location.href);
  const qVal = url.searchParams.get('q');
  const catVal = url.searchParams.get('category');
  const methodVal = url.searchParams.get('method');
  const fromVal = url.searchParams.get('from');
  const toVal = url.searchParams.get('to');
  const sortVal = url.searchParams.get('sort');

  if (qVal && qs('#f-search')) qs('#f-search').value = qVal;
  if (catVal && qs('#f-cat')) qs('#f-cat').value = catVal;
  if (methodVal && qs('#f-method')) qs('#f-method').value = methodVal;
  if (fromVal && qs('#f-from')) qs('#f-from').value = fromVal;
  if (toVal && qs('#f-to')) qs('#f-to').value = toVal;
  if (sortVal && qs('#sort')) qs('#sort').value = sortVal;

  // Debounced search input handler (250ms)
  const searchInput = qs('#f-search');
  if (searchInput) {
    on(searchInput, 'input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('page'); // Reset to page 1 on search change
        window.history.replaceState({}, '', nextUrl.toString());
        loadAndRenderExpenses();
      }, 250);
    });
  }

  // Filter selects live change handlers
  const filterSelects = qsa('#f-cat, #f-method, #sort, #f-from, #to-to');
  for (const select of filterSelects) {
    on(select, 'change', () => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('page');
      window.history.replaceState({}, '', nextUrl.toString());
      loadAndRenderExpenses();
    });
  }

  // Intercept filter form submit
  const filterForm = qs('.filter-bar');
  if (filterForm) {
    on(filterForm, 'submit', (e) => {
      e.preventDefault();
      loadAndRenderExpenses();
    });
  }

  // Initial render
  await loadAndRenderExpenses();
}
