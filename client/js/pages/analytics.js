/**
 * Analytics page module (Review 2, Step P3).
 * Connects analytics.html to api.js to render multi-month totals,
 * monthly trend table, and category spending rankings.
 */

import { monthlySummary, byCategory, listCategories } from '../data/api.js';
import { qs, createEl } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement } from '../core/render.js';

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
 * Render category ranking table.
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
        className: 'end num text-dim',
        textContent: '—'
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
    renderCategoryRanking(breakdown || [], octTotal);
  } catch (err) {
    console.warn('[SplitStack] Error loading analytics page:', err);
  } finally {
    setLoading(main, false);
  }
}
