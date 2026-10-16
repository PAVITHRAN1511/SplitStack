/**
 * Budgets page module (Review 2, Step P3).
 * Connects budgets.html to api.js to render overall limit and category budgets with
 * status badges and progress meters.
 */

import { listBudgets, listCategories } from '../data/api.js';
import { qs, createEl } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement } from '../core/render.js';

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
 * Render category budget cards.
 * @param {Array} categoryBudgets
 */
function renderCategoryBudgets(categoryBudgets) {
  const container = qs('.grid.grid-2');
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
      createEl('div', { className: 'flex gap-2' }, [
        createEl('a', { className: 'btn btn-ghost btn-sm', href: '#set-budget', textContent: 'Edit' }),
        createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [
          createEl('button', { className: 'btn btn-ghost btn-sm', type: 'submit', textContent: 'Remove' })
        ])
      ])
    ]);

    container.appendChild(article);
  }
}

/**
 * Initialize budgets page.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  try {
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
    renderCategoryBudgets(categoryBudgets);
  } catch (err) {
    console.warn('[SplitStack] Error loading budgets:', err);
  } finally {
    setLoading(main, false);
  }
}
