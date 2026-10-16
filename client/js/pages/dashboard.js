/**
 * Dashboard page module (Review 2, Step P3).
 * Connects dashboard.html to api.js to render welcome summary, monthly KPI stats,
 * recent transactions, budgets progress meters, user groups, smart insights, and month-end forecast.
 */

import {
  currentUser,
  listExpenses,
  listIncome,
  listBudgets,
  listGroups,
  getGroupBalances,
  insights,
  forecast,
  listCategories,
  monthlySummary,
  byCategory
} from '../data/api.js';

import { qs, createEl } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement } from '../core/render.js';
import { renderMonthlyTrendBar, renderCategoryDoughnut } from '../ui/charts.js';

let categoryMap = new Map();

/**
 * Get greeting based on hour of day.
 * @returns {string}
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Render welcome banner with user name, budget spend, and days remaining.
 * @param {Object} user
 * @param {number} totalSpentPaise
 * @param {number} monthlyLimitPaise
 */
function renderWelcome(user, totalSpentPaise, monthlyLimitPaise) {
  const welcomeTitle = qs('#welcome-title');
  const welcomeP = qs('.welcome p');

  if (welcomeTitle) {
    const firstName = (user?.name || 'there').split(' ')[0];
    welcomeTitle.textContent = `${getGreeting()}, ${firstName}`;
  }

  if (welcomeP) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(0, daysInMonth - now.getDate());
    const monthName = now.toLocaleDateString('en-IN', { month: 'long' });

    welcomeP.textContent = `You have spent ${formatINR(totalSpentPaise)} of your ${formatINR(monthlyLimitPaise)} monthly budget with ${daysLeft} days left in ${monthName}.`;
  }
}

/**
 * Render KPI cards in grid-4.
 * @param {number} incomePaise
 * @param {number} expensePaise
 * @param {number} groupNetPaise
 */
function renderKpiCards(incomePaise, expensePaise, groupNetPaise) {
  // Income card
  const incomeVal = qs('.stat.tone-success .stat-value .num');
  if (incomeVal) incomeVal.textContent = formatINR(incomePaise);

  // Expense card
  const expenseVal = qs('.stat.tone-danger .stat-value .num');
  if (expenseVal) expenseVal.textContent = formatINR(expensePaise);

  // Saved card
  const savedPaise = Math.max(0, incomePaise - expensePaise);
  const savedVal = qs('.stat.tone-primary .stat-value .num');
  if (savedVal) savedVal.textContent = formatINR(savedPaise);

  const savingsRate = incomePaise > 0 ? ((savedPaise / incomePaise) * 100).toFixed(1) : '0.0';
  const savingsMeta = qs('.stat.tone-primary .stat-meta .badge');
  if (savingsMeta) savingsMeta.textContent = `${savingsRate}% savings rate`;

  // Group balance card
  const groupVal = qs('.stat.tone-warning .stat-value .num');
  const groupMeta = qs('.stat.tone-warning .stat-meta');
  if (groupVal) {
    groupVal.className = `num ${groupNetPaise > 0 ? 'text-success' : groupNetPaise < 0 ? 'text-danger' : 'text-dim'}`;
    const prefix = groupNetPaise > 0 ? '+' : groupNetPaise < 0 ? '−' : '';
    groupVal.textContent = `${prefix}${formatINR(Math.abs(groupNetPaise))}`;
  }
  if (groupMeta) {
    if (groupNetPaise > 0) {
      groupMeta.textContent = 'Owed to you across groups';
    } else if (groupNetPaise < 0) {
      groupMeta.textContent = 'You owe across groups';
    } else {
      groupMeta.textContent = 'All group debts settled';
    }
  }
}

/**
 * Render recent transactions table.
 * @param {Array} expenses
 */
function renderRecentExpenses(expenses) {
  const tbody = qs('section[aria-labelledby="recent-title"] tbody');
  if (!tbody) return;

  clearElement(tbody);

  if (expenses.length === 0) {
    const tr = createEl('tr', {}, [
      createEl('td', { colspan: '5', className: 'text-center text-dim p-4', textContent: 'No recent expenses logged.' })
    ]);
    tbody.appendChild(tr);
    return;
  }

  for (const exp of expenses.slice(0, 6)) {
    const cat = categoryMap.get(exp.categoryId) || {
      name: exp.categoryId || 'Other',
      icon: 'fa-tag',
      color: 'var(--cat-other)'
    };

    const d = new Date(exp.date);
    const dateFormatted = isNaN(d.getTime())
      ? exp.date
      : `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;

    const tr = createEl('tr', {}, [
      createEl('td', { 'data-label': 'Date', className: 'text-dim', textContent: dateFormatted }),
      createEl('td', { 'data-label': 'Description', className: 'fw-600', textContent: exp.description }),
      createEl('td', { 'data-label': 'Category' }, [
        createEl('span', {
          className: 'cat-tag',
          style: { '--cat': `var(--cat-${exp.categoryId}, ${cat.color || 'var(--cat-other)'})` }
        }, [
          createEl('i', { className: `fa-solid ${cat.icon || 'fa-tag'}`, 'aria-hidden': 'true' }),
          cat.name
        ])
      ]),
      createEl('td', { 'data-label': 'Method' }, [
        createEl('span', { className: 'badge', textContent: exp.paymentMethod || 'UPI' })
      ]),
      createEl('td', {
        'data-label': 'Amount',
        className: 'end num amount-out',
        textContent: `−${formatINR(exp.amount)}`
      })
    ]);

    tbody.appendChild(tr);
  }
}

/**
 * Render budget meters inside dashboard.
 * @param {Array} budgets
 */
function renderBudgets(budgets) {
  const container = qs('section[aria-labelledby="budget-title"] .card-body.stack');
  if (!container) return;

  clearElement(container);

  if (budgets.length === 0) {
    container.appendChild(createEl('p', { className: 'text-dim text-sm text-center p-4', textContent: 'No budgets configured for this month.' }));
    return;
  }

  for (const b of budgets) {
    const cat = b.categoryId ? categoryMap.get(b.categoryId) : null;
    const catName = cat ? cat.name : 'Overall monthly';
    const percent = b.spentPercentage || 0;
    const status = b.status || 'ok';

    const meterToneClass =
      status === 'danger' ? 'is-danger' :
      status === 'warning' ? 'is-warning' :
      status === 'caution' ? 'is-caution' : '';

    const badgeClass =
      status === 'danger' ? 'badge-danger' :
      status === 'warning' ? 'badge-warning' :
      status === 'caution' ? 'badge-warning' : 'badge-success';

    const overPaise = b.spent - b.limit;
    const isOver = overPaise > 0;
    const remainingText = isOver
      ? `${formatINR(overPaise)} over`
      : `${formatINR(b.remaining)} left`;

    const wrapper = createEl('div', {}, [
      createEl('div', { className: 'flex justify-between text-sm mb-2' }, [
        createEl('span', { className: 'fw-600', textContent: catName }),
        createEl('span', { className: `badge ${badgeClass}`, textContent: `${percent}% used` })
      ]),
      createEl('div', {
        className: `meter ${meterToneClass}`,
        role: 'progressbar',
        'aria-label': `${catName} budget`,
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(Math.min(100, percent)),
        'aria-valuetext': `${percent}% of ${formatINR(b.limit)}`
      }, [
        createEl('span', { style: { '--value': `${Math.min(100, percent)}%` } })
      ]),
      createEl('div', { className: 'budget-figures mt-2' }, [
        createEl('span', { textContent: `${formatINR(b.spent)} of ${formatINR(b.limit)}` }),
        createEl('span', {
          className: isOver ? 'text-danger fw-600' : 'text-success',
          textContent: remainingText
        })
      ])
    ]);

    container.appendChild(wrapper);
  }
}

/**
 * Render your groups list in dashboard.
 * @param {Array} groups
 */
async function renderGroups(groups) {
  const listEl = qs('section[aria-labelledby="groups-title"] .list');
  if (!listEl) return;

  clearElement(listEl);

  if (groups.length === 0) {
    listEl.appendChild(createEl('li', { className: 'text-dim text-sm text-center p-4', textContent: 'You are not in any groups yet.' }));
    return;
  }

  const user = await currentUser();

  for (const g of groups) {
    let userBalancePaise = 0;
    try {
      const balances = await getGroupBalances(g.id);
      if (balances && typeof balances === 'object') {
        userBalancePaise = balances[user.id] || 0;
      }
    } catch {
      // Ignored for presentation fallback
    }

    const balanceEl = createEl('span', {
      className: userBalancePaise > 0 ? 'balance-pos num' : userBalancePaise < 0 ? 'balance-neg num' : 'balance-zero',
      textContent: userBalancePaise > 0
        ? `+${formatINR(userBalancePaise)}`
        : userBalancePaise < 0
        ? `−${formatINR(Math.abs(userBalancePaise))}`
        : 'Settled'
    });

    const li = createEl('li', { className: 'list-item' }, [
      createEl('span', { className: 'cat-icon', style: { '--cat': 'var(--cat-travel)' } }, [
        createEl('i', { className: 'fa-solid fa-users', 'aria-hidden': 'true' })
      ]),
      createEl('span', { className: 'grow' }, [
        createEl('a', {
          className: 'list-title',
          href: `group-detail.html?id=${encodeURIComponent(g.id)}`,
          textContent: g.name
        }),
        createEl('span', {
          className: 'list-sub',
          textContent: `${g.members?.length || 1} members`
        })
      ]),
      balanceEl
    ]);

    listEl.appendChild(li);
  }
}

/**
 * Render smart insights list.
 * @param {Array} insightItems
 */
function renderInsights(insightItems) {
  const container = qs('#insights .card-body');
  if (!container) return;

  clearElement(container);

  if (insightItems.length === 0) {
    container.appendChild(createEl('p', { className: 'text-dim text-sm text-center p-4', textContent: 'No insights available.' }));
    return;
  }

  for (const item of insightItems) {
    const toneClass =
      item.kind === 'danger' || item.kind === 'warning' ? 'tone-danger' :
      item.kind === 'info' ? 'tone-info' : 'tone-success';

    const iconClass =
      item.kind === 'danger' || item.kind === 'warning' ? 'fa-triangle-exclamation' :
      item.kind === 'info' ? 'fa-arrow-trend-up' : 'fa-piggy-bank';

    const div = createEl('div', { className: `insight ${toneClass}` }, [
      createEl('i', { className: `fa-solid ${iconClass}`, 'aria-hidden': 'true' }),
      createEl('div', {}, [
        createEl('strong', { textContent: item.title || item.message }),
        createEl('p', { textContent: item.message || '' })
      ])
    ]);

    container.appendChild(div);
  }
}

/**
 * Render month forecast widget.
 * @param {Object} forecastData
 */
function renderForecast(forecastData) {
  const container = qs('section[aria-labelledby="forecast-title"] .card-body.forecast');
  if (!container || !forecastData) return;

  clearElement(container);

  if (forecastData.hasSufficientData === false) {
    container.appendChild(createEl('p', {
      className: 'text-dim text-xs text-center p-4',
      textContent: forecastData.reason || 'Insufficient data to compute monthly spending forecast (minimum 3 transactions needed).'
    }));
    return;
  }

  const projectedPaise = forecastData.projectedSpend || 0;
  const budgetPaise = forecastData.monthlyBudget || 4000000;
  const percent = forecastData.projectedPercentage || (budgetPaise > 0 ? Math.round((projectedPaise / budgetPaise) * 100) : 0);
  const dailyAveragePaise = forecastData.dailyAverage || (forecastData.daysPassed > 0 ? Math.round(projectedPaise / forecastData.daysPassed) : 0);
  const daysPassed = forecastData.daysPassed || 28;
  const status = forecastData.status || (percent > 100 ? 'danger' : percent >= 85 ? 'caution' : 'ok');

  const topDiv = createEl('div', {}, [
    createEl('p', { className: 'text-xs text-dim', textContent: 'Projected monthly spend' }),
    createEl('p', { className: 'forecast-figure num', textContent: formatINR(projectedPaise) })
  ]);

  const meterTone = status === 'danger' ? 'is-danger' :
                    status === 'warning' ? 'is-warning' :
                    status === 'caution' ? 'is-caution' : '';

  const meter = createEl('div', {
    className: `meter ${meterTone}`,
    role: 'progressbar',
    'aria-label': 'Projected spend against budget',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(Math.min(100, percent)),
    'aria-valuetext': `${percent}% of ${formatINR(budgetPaise)}`
  }, [
    createEl('span', { style: { '--value': `${Math.min(100, percent)}%` } })
  ]);

  const statusLabel = status === 'danger' ? 'over budget' :
                      status === 'warning' ? 'warning' :
                      status === 'caution' ? 'at risk' : 'on track';

  const statusClass = status === 'danger' ? 'text-danger' :
                      status === 'warning' || status === 'caution' ? 'text-warning' : 'text-success';

  const statusStrong = createEl('strong', {
    className: statusClass,
    textContent: statusLabel
  });

  const descP = createEl('p', { className: 'text-xs' }, [
    `Based on ${formatINR(dailyAveragePaise)} a day over ${daysPassed} days. That is ${percent}% of your ${formatINR(budgetPaise)} budget: `,
    statusStrong,
    '.'
  ]);

  container.append(topDiv, meter, descP);
}

/**
 * Render dynamic monthly table for accessibility details.
 * @param {Array} months
 */
function renderTrendTable(months) {
  const tbody = qs('section[aria-labelledby="trend-title"] details table.table tbody');
  if (!tbody || !Array.isArray(months) || months.length === 0) return;

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
 * Render dynamic category legend.
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
 * Initialize dashboard module.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  try {
    const [user, cats, expResult, incResult, budgets, groups, insightList, fc, summaryResult, catBreakdown] = await Promise.all([
      currentUser(),
      listCategories(),
      listExpenses({ limit: 100 }),
      listIncome({ limit: 100 }),
      listBudgets(),
      listGroups(),
      insights(),
      forecast(),
      monthlySummary({ months: 6 }),
      byCategory({ month: 10, year: 2026 })
    ]);

    categoryMap = new Map((cats || []).map((c) => [c.id, c]));

    // Calculate totals for October 2026
    const thisMonthExpenses = (expResult?.expenses || []).filter((e) => e.date?.startsWith('2026-10'));
    const totalSpentPaise = thisMonthExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    const thisMonthIncome = (incResult?.income || []).filter((i) => i.date?.startsWith('2026-10'));
    const totalIncomePaise = thisMonthIncome.reduce((s, i) => s + (i.amount || 0), 0);

    const monthlyLimitPaise = user?.preferences?.monthlyBudget || 4000000;

    // Calculate net group balance across all groups for current user
    let groupNetPaise = 0;
    for (const g of groups || []) {
      try {
        const balances = await getGroupBalances(g.id);
        if (balances && typeof balances === 'object') {
          groupNetPaise += balances[user.id] || 0;
        }
      } catch {
        // Ignored
      }
    }

    renderWelcome(user, totalSpentPaise, monthlyLimitPaise);
    renderKpiCards(totalIncomePaise, totalSpentPaise, groupNetPaise);
    renderRecentExpenses(expResult?.expenses || []);
    renderBudgets(budgets || []);
    await renderGroups(groups || []);
    renderInsights(insightList || []);
    renderForecast(fc);

    // Render charts & accessibility tables (Review 2, Step P6)
    const trendContainer = qs('section[aria-labelledby="trend-title"] .card-body');
    if (trendContainer && summaryResult?.months) {
      renderTrendTable(summaryResult.months);
      await renderMonthlyTrendBar(trendContainer, summaryResult.months, { id: 'dash-monthly-trend' });
    }

    const catContainer = qs('section[aria-labelledby="cat-title"] .card-body');
    if (catContainer && catBreakdown) {
      const octTotal = catBreakdown.reduce((sum, c) => sum + (c.total || 0), 0);
      renderCategoryLegend(catBreakdown, octTotal);
      await renderCategoryDoughnut(catContainer, catBreakdown, { id: 'dash-category-doughnut', monthName: 'October' });
    }
  } catch (err) {
    console.warn('[SplitStack] Error rendering dashboard:', err);
  } finally {
    setLoading(main, false);
  }
}

