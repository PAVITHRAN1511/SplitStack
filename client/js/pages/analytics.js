/**
 * Analytics page module (Review 2, Steps P3 & P6).
 * Connects analytics.html to api.js to render multi-month totals,
 * dynamic monthly trend chart and table, category spending doughnut,
 * month-over-month category changes, and dynamic time range filtering.
 */

import { monthlySummary, byCategory, listCategories } from '../data/api.js';
import { qs, on, createEl } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement } from '../core/render.js';
import { renderMonthlyTrendBar, renderCategoryDoughnut } from '../ui/charts.js';

let categoryMap = new Map();

/**
 * Render multi-month summary stat cards.
 * @param {Array} months
 */
function renderSummaryCards(months) {
  let totalIncome = 0;
  let totalSpent = 0;
  let highestMonth = null;
  let highestSpend = 0;

  for (const m of months) {
    totalIncome += m.income || 0;
    totalSpent += m.expenses || 0;

    if (m.expenses > highestSpend) {
      highestSpend = m.expenses;
      highestMonth = m;
    }
  }

  const netSaved = Math.max(0, totalIncome - totalSpent);
  const savingsRate = totalIncome > 0 ? ((netSaved / totalIncome) * 100).toFixed(1) : '0.0';
  const averageSpent = months.length > 0 ? Math.round(totalSpent / months.length) : 0;

  // Total income card
  const incVal = qs('.grid-4 .tone-success .stat-value .num');
  if (incVal) incVal.textContent = formatINR(totalIncome);

  // Total spent card
  const spentVal = qs('.grid-4 .tone-danger .stat-value .num');
  const spentMeta = qs('.grid-4 .tone-danger .stat-meta');
  if (spentVal) spentVal.textContent = formatINR(totalSpent);
  if (spentMeta) spentMeta.textContent = `Average ${formatINR(averageSpent)} a month`;

  // Net saved card
  const savedVal = qs('.grid-4 .tone-primary .stat-value .num');
  const savedMeta = qs('.grid-4 .tone-primary .stat-meta .badge');
  if (savedVal) savedVal.textContent = formatINR(netSaved);
  if (savedMeta) savedMeta.textContent = `${savingsRate}% savings rate`;

  // Highest month card
  const highVal = qs('.grid-4 .tone-warning .stat-value');
  const highMeta = qs('.grid-4 .tone-warning .stat-meta');
  if (highVal && highestMonth) {
    highVal.textContent = highestMonth.label || highestMonth.monthName || 'October';
  }
  if (highMeta && highestMonth) {
    highMeta.textContent = `${formatINR(highestSpend)} spent`;
  }
}

/**
 * Render monthly table in details.
 * @param {Array} months
 */
function renderMonthlyTable(months) {
  const tbody = qs('details table.table tbody');
  if (!tbody) return;

  clearElement(tbody);

  for (const m of months) {
    const saved = (m.income || 0) - (m.expenses || 0);

    const tr = createEl('tr', {}, [
      createEl('th', { scope: 'row', textContent: m.label || `${m.monthName} ${m.year}` }),
      createEl('td', { className: 'end num', textContent: formatINR(m.income) }),
      createEl('td', { className: 'end num', textContent: formatINR(m.expenses) }),
      createEl('td', { className: 'end num', textContent: formatINR(saved) })
    ]);

    tbody.appendChild(tr);
  }
}

/**
 * Render category legend in donut-wrap.
 * @param {Array} breakdown
 * @param {number} totalPaise
 */
function renderCategoryLegend(breakdown, totalPaise) {
  const legendEl = qs('section[aria-labelledby="cat-title"] ul.legend');
  if (!legendEl || !Array.isArray(breakdown)) return;

  clearElement(legendEl);

  for (const item of breakdown) {
    const rawId = (item.categoryId || '').replace(/^cat_/, '');
    const pct = totalPaise > 0 ? ((item.total / totalPaise) * 100).toFixed(1) : '0.0';
    const li = createEl('li', {
      style: { '--cat': `var(--cat-${rawId}, var(--cat-other))` }
    }, [
      item.name || item.categoryId,
      createEl('span', { className: 'num', textContent: `${pct}%` })
    ]);
    legendEl.appendChild(li);
  }
}

/**
 * Render category ranking table with month-over-month comparisons.
 * @param {Array} categoryBreakdown
 * @param {number} totalExpensesPaise
 */
function renderCategoryRanking(categoryBreakdown, totalExpensesPaise) {
  const tbody = qs('section[aria-labelledby="rank-title"] table.table tbody');
  const tfoot = qs('section[aria-labelledby="rank-title"] table.table tfoot');
  if (!tbody) return;

  clearElement(tbody);

  let rank = 1;
  for (const catItem of categoryBreakdown) {
    const cat = categoryMap.get(catItem.categoryId) || {
      name: catItem.name || catItem.categoryId || 'Other',
      icon: 'fa-tag',
      color: 'var(--cat-other)'
    };

    const sharePercent = totalExpensesPaise > 0
      ? ((catItem.total / totalExpensesPaise) * 100).toFixed(1)
      : '0.0';

    const hasChange = typeof catItem.changePercent === 'number' && !isNaN(catItem.changePercent);
    const changeText = hasChange
      ? `${catItem.changePercent > 0 ? '+' : ''}${catItem.changePercent.toFixed(1)}%`
      : '—';

    const changeClass = hasChange
      ? (catItem.changePercent > 0 ? 'end num text-danger' : catItem.changePercent < 0 ? 'end num text-success' : 'end num text-dim')
      : 'end num text-dim';

    const tr = createEl('tr', {}, [
      createEl('td', { 'data-label': 'Rank', className: 'text-dim', textContent: String(rank++) }),
      createEl('td', { 'data-label': 'Category' }, [
        createEl('span', {
          className: 'cat-tag',
          style: { '--cat': `var(--cat-${catItem.categoryId}, ${cat.color || 'var(--cat-other)'})` }
        }, [
          createEl('i', { className: `fa-solid ${cat.icon || 'fa-tag'}`, 'aria-hidden': 'true' }),
          cat.name
        ])
      ]),
      createEl('td', {
        'data-label': 'Amount',
        className: 'end num fw-600',
        textContent: formatINR(catItem.total)
      }),
      createEl('td', { 'data-label': 'Share' }, [
        createEl('div', { className: 'flex items-center gap-3' }, [
          createEl('div', { className: 'meter grow', style: { '--fill': 'var(--primary)' } }, [
            createEl('span', { style: { '--value': `${sharePercent}%` } })
          ]),
          createEl('span', { className: 'num text-sm', textContent: `${sharePercent}%` })
        ])
      ]),
      createEl('td', {
        'data-label': 'vs September',
        className: changeClass,
        textContent: changeText
      })
    ]);

    tbody.appendChild(tr);
  }

  if (tfoot) {
    const totalAmountTd = qs('td[data-label="Amount"]', tfoot);
    if (totalAmountTd) totalAmountTd.textContent = formatINR(totalExpensesPaise);
  }
}

/**
 * Load and render monthly trend data according to selected range.
 * @param {number} rangeCount
 */
async function updateTrendData(rangeCount) {
  try {
    const summaryResult = await monthlySummary({ months: rangeCount });
    const months = summaryResult?.months || [];
    renderSummaryCards(months);
    renderMonthlyTable(months);

    const trendContainer = qs('section[aria-labelledby="trend-title"] .card-body');
    if (trendContainer && months.length > 0) {
      await renderMonthlyTrendBar(trendContainer, months, { id: 'an-monthly-trend' });
    }

    // Update section subtitle
    const pageSubP = qs('.page-title-row p');
    if (pageSubP && months.length > 0) {
      const first = months[0].label || months[0].monthName;
      const last = months[months.length - 1].label || months[months.length - 1].monthName;
      pageSubP.textContent = `${months.length} months of income and spending, ${first} to ${last} 2026.`;
    }
  } catch (err) {
    console.warn('[SplitStack] Error updating monthly trend:', err);
  }
}

/**
 * Initialize analytics page.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  try {
    const [summaryResult, breakdown, cats] = await Promise.all([
      monthlySummary({ months: 6 }),
      byCategory({ month: 10, year: 2026 }),
      listCategories()
    ]);

    categoryMap = new Map((cats || []).map((c) => [c.id, c]));

    const months = summaryResult?.months || [];
    renderSummaryCards(months);
    renderMonthlyTable(months);

    const octTotal = (breakdown || []).reduce((sum, c) => sum + (c.total || 0), 0);
    renderCategoryLegend(breakdown || [], octTotal);
    renderCategoryRanking(breakdown || [], octTotal);

    // Render Charts
    const trendContainer = qs('section[aria-labelledby="trend-title"] .card-body');
    if (trendContainer && months.length > 0) {
      await renderMonthlyTrendBar(trendContainer, months, { id: 'an-monthly-trend' });
    }

    const catContainer = qs('section[aria-labelledby="cat-title"] .card-body');
    if (catContainer && breakdown) {
      await renderCategoryDoughnut(catContainer, breakdown, { id: 'an-category-doughnut', monthName: 'October' });
    }

    // Connect time range filter controls
    const rangeForm = qs('form.page-actions');
    const rangeSelect = qs('#range');

    if (rangeForm && rangeSelect) {
      on(rangeForm, 'submit', async (e) => {
        e.preventDefault();
        const selected = parseInt(rangeSelect.value, 10) || 6;
        await updateTrendData(selected);
      });

      on(rangeSelect, 'change', async () => {
        const selected = parseInt(rangeSelect.value, 10) || 6;
        await updateTrendData(selected);
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading analytics page:', err);
  } finally {
    setLoading(main, false);
  }
}

