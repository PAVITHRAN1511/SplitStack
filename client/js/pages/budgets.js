/**
 * Budgets page module (Review 2, Steps P3 & P4).
 * Connects budgets.html to api.js to render overall limit and category budgets with
 * status badges and progress meters, wires the budget creation form,
 * and handles budget deletion with confirmation dialogs.
 */

import { listBudgets, listCategories, createBudget, removeBudget } from '../data/api.js';
import { qs, on, createEl } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import {
  rupeesToPaise,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

let categoryMap = new Map();

/**
 * Render overall monthly budget card.
 * @param {Object} overallBudget
 */
function renderOverallBudget(overallBudget) {
  const section = qs('section[aria-labelledby="overall-title"]');
  if (!section || !overallBudget) return;

  const percent = overallBudget.spentPercentage || 0;
  const status = overallBudget.status || 'ok';

  const badgeEl = qs('.budget-head .badge', section);
  if (badgeEl) {
    badgeEl.className = `badge ${
      status === 'danger' ? 'badge-danger' :
      status === 'warning' ? 'badge-warning' :
      status === 'caution' ? 'badge-warning' : 'badge-success'
    }`;
    badgeEl.textContent =
      status === 'danger' ? 'Over budget' :
      status === 'warning' ? 'Warning' :
      status === 'caution' ? 'Caution' : 'On track';
  }

  const meter = qs('.meter', section);
  if (meter) {
    meter.className = `meter ${
      status === 'danger' ? 'is-danger' :
      status === 'warning' ? 'is-warning' :
      status === 'caution' ? 'is-caution' : ''
    }`;
    meter.setAttribute('aria-valuenow', String(Math.min(100, percent)));
    const bar = qs('span', meter);
    if (bar) bar.style.setProperty('--value', `${Math.min(100, percent)}%`);
  }

  const figures = qs('.budget-figures', section);
  if (figures) {
    clearElement(figures);

    const spentLimitSpan = createEl('span', {}, [
      createEl('strong', { className: 'num', textContent: formatINR(overallBudget.spent) }),
      ` of ${formatINR(overallBudget.limit)} · ${percent}%`
    ]);

    const isOver = overallBudget.spent > overallBudget.limit;
    const diffPaise = Math.abs(overallBudget.spent - overallBudget.limit);

    const remainingSpan = createEl('span', {
      className: isOver ? 'text-danger fw-600' : 'text-success',
      textContent: isOver ? `${formatINR(diffPaise)} over` : `${formatINR(overallBudget.remaining)} left`
    });

    figures.append(spentLimitSpan, remainingSpan);
  }
}

/**
 * Render category budgets grid.
 * @param {Array} categoryBudgets
 * @param {Function} [onRefresh]
 */
function renderCategoryBudgets(categoryBudgets, onRefresh) {
  const container = qs('#cat-budgets-grid');
  if (!container) return;

  clearElement(container);

  if (categoryBudgets.length === 0) {
    container.appendChild(createEl('p', { className: 'text-dim p-4', textContent: 'No category budgets configured.' }));
    return;
  }

  for (const b of categoryBudgets) {
    const cat = categoryMap.get(b.categoryId) || {
      name: b.categoryId || 'Category',
      icon: 'fa-tag',
      color: 'var(--cat-other)'
    };

    const percent = b.spentPercentage || 0;
    const status = b.status || 'ok';
    const isOver = b.spent > b.limit;
    const diffPaise = Math.abs(b.spent - b.limit);

    const badgeClass =
      status === 'danger' ? 'badge-danger' :
      status === 'warning' ? 'badge-warning' :
      status === 'caution' ? 'badge-warning' : 'badge-success';

    const badgeLabel =
      status === 'danger' ? 'Over budget' :
      status === 'warning' ? 'Warning' :
      status === 'caution' ? 'Caution' : 'On track';

    const meterTone =
      status === 'danger' ? 'is-danger' :
      status === 'warning' ? 'is-warning' :
      status === 'caution' ? 'is-caution' : '';

    const editLink = createEl('a', {
      className: 'btn btn-ghost btn-sm',
      href: '#set-budget',
      textContent: 'Edit'
    });
    on(editLink, 'click', () => {
      const catSelect = qs('#b-cat');
      const monthSelect = qs('#b-month');
      const yearInput = qs('#b-year');
      const amountInput = qs('#b-amount');
      if (catSelect) catSelect.value = b.categoryId.replace(/^cat_/, '');
      if (monthSelect) monthSelect.value = String(b.month);
      if (yearInput) yearInput.value = String(b.year);
      if (amountInput) {
        amountInput.value = String(Math.round(b.limit / 100));
        amountInput.focus();
      }
    });

    const removeBtn = createEl('button', {
      className: 'btn btn-ghost btn-sm',
      type: 'submit',
      textContent: 'Remove'
    });
    const removeForm = createEl('form', {
      className: 'inline-form',
      action: '#',
      method: 'post'
    }, [removeBtn]);

    on(removeForm, 'submit', async (e) => {
      e.preventDefault();
      const confirmed = await confirmDialog({
        title: 'Remove budget',
        message: `Remove budget for "${cat.name}"? This action cannot be undone.`,
        confirmText: 'Remove'
      });
      if (!confirmed) return;
      try {
        await removeBudget(b.id);
        showToast(`Budget for ${cat.name} removed`, 'info');
        if (onRefresh) await onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to remove budget', 'danger');
      }
    });

    const article = createEl('article', { className: 'card budget' }, [
      createEl('div', { className: 'budget-head' }, [
        createEl('span', {
          className: 'cat-icon',
          style: { '--cat': `var(--cat-${b.categoryId}, ${cat.color || 'var(--cat-other)'})` }
        }, [
          createEl('i', { className: `fa-solid ${cat.icon || 'fa-tag'}`, 'aria-hidden': 'true' })
        ]),
        createEl('div', { className: 'grow' }, [
          createEl('h3', { textContent: cat.name }),
          createEl('p', { className: 'text-xs', textContent: `${percent}% used` })
        ]),
        createEl('span', { className: `badge ${badgeClass}`, textContent: badgeLabel })
      ]),
      createEl('div', {
        className: `meter ${meterTone}`,
        role: 'progressbar',
        'aria-label': `${cat.name} budget used`,
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(Math.min(100, percent)),
        'aria-valuetext': `${percent}%`
      }, [
        createEl('span', { style: { '--value': `${Math.min(100, percent)}%` } })
      ]),
      createEl('div', { className: 'budget-figures' }, [
        createEl('span', {}, [
          createEl('strong', { className: 'num', textContent: formatINR(b.spent) }),
          ` of ${formatINR(b.limit)}`
        ]),
        createEl('span', {
          className: isOver ? 'text-danger fw-600' : 'text-success',
          textContent: isOver ? `${formatINR(diffPaise)} over` : `${formatINR(b.remaining)} left`
        })
      ]),
      createEl('div', { className: 'flex gap-2' }, [editLink, removeForm])
    ]);

    container.appendChild(article);
  }
}

/**
 * Fetch and render all budgets.
 */
async function loadAndRenderBudgets() {
  const [budgets, cats] = await Promise.all([
    listBudgets(),
    listCategories()
  ]);

  categoryMap = new Map((cats || []).map((c) => [c.id, c]));

  const overall = budgets.find((b) => !b.categoryId);
  const categoryBudgets = budgets.filter((b) => Boolean(b.categoryId));

  if (overall) {
    renderOverallBudget(overall);
  }
  renderCategoryBudgets(categoryBudgets, loadAndRenderBudgets);
}

/**
 * Initialize budgets page.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  try {
    await loadAndRenderBudgets();

    // Wire #set-budget form
    const form = qs('#set-budget form');
    if (form) {
      const submitBtn = qs('button[type="submit"]', form);
      const catSelect = qs('#b-cat', form);
      const monthSelect = qs('#b-month', form);
      const yearInput = qs('#b-year', form);
      const amountInput = qs('#b-amount', form);

      on(form, 'submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);

        let hasError = false;
        let limitPaise = 0;

        try {
          limitPaise = rupeesToPaise(amountInput?.value);
        } catch (err) {
          showFieldError(amountInput, err.message);
          hasError = true;
        }

        const rawCat = catSelect?.value || '';
        const catId = rawCat ? (rawCat.startsWith('cat_') ? rawCat : `cat_${rawCat}`) : null;
        const month = parseInt(monthSelect?.value || '10', 10);
        const year = parseInt(yearInput?.value || '2026', 10);

        if (isNaN(month) || month < 1 || month > 12) {
          showFieldError(monthSelect, 'Invalid month');
          hasError = true;
        }
        if (isNaN(year) || year < 2000 || year > 2100) {
          showFieldError(yearInput, 'Invalid year');
          hasError = true;
        }

        if (hasError) {
          focusFirstInvalid(form);
          return;
        }

        setButtonLoading(submitBtn, true, 'Saving budget...');

        try {
          await createBudget({
            categoryId: catId,
            month,
            year,
            limit: limitPaise
          });

          showToast('Budget saved successfully!', 'success');
          if (amountInput) amountInput.value = '';
          await loadAndRenderBudgets();
        } catch (err) {
          showFieldError(amountInput, err.message || 'Failed to save budget');
          focusFirstInvalid(form);
        } finally {
          setButtonLoading(submitBtn, false);
        }
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading budgets:', err);
  } finally {
    setLoading(main, false);
  }
}
