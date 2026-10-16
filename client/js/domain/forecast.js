/**
 * SplitStack Spending Forecast Domain Module (Review 2, Step P6).
 * Pure functions for linear velocity forecasting, daily trajectory projection,
 * and budget risk assessment.
 *
 * All financial amounts are integer paise (1 Rupee = 100 paise).
 * No floating-point arithmetic is used for financial totals.
 */

/**
 * Format local Date as YYYY-MM-DD string without UTC timezone skew.
 * @param {Date} d
 * @returns {string}
 */
export function formatLocalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calculate month-end spending forecast based on daily velocity.
 *
 * Velocity Model:
 * Daily Average = Total Spent / Days Passed
 * Projected Month Spend = Daily Average * Total Days in Month
 *
 * @param {Object|Array} expensesOrParams - Expenses array or params object
 * @param {Object} [options={}] - Additional options when first arg is an array
 * @returns {Object} Forecast projection summary
 */
export function calculateForecast(expensesOrParams, options = {}) {
  let expenses = [];
  let opts = {};

  if (Array.isArray(expensesOrParams)) {
    expenses = expensesOrParams;
    opts = options || {};
  } else if (expensesOrParams && typeof expensesOrParams === 'object') {
    expenses = expensesOrParams.expenses || [];
    opts = expensesOrParams;
  }

  const refDate = opts.currentDate || opts.referenceDate || new Date('2026-10-28');
  const ref = typeof refDate === 'string' ? new Date(refDate) : refDate;

  const targetYear = opts.year !== undefined ? Number(opts.year) : ref.getFullYear();
  const targetMonth = opts.month !== undefined ? Number(opts.month) : (ref.getMonth() + 1);
  const totalDaysInMonth = new Date(targetYear, targetMonth, 0).getDate();

  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;
  const refDay = ref.getDate();

  let daysPassed = totalDaysInMonth;
  if (refYear === targetYear && refMonth === targetMonth) {
    daysPassed = Math.max(1, Math.min(refDay, totalDaysInMonth));
  } else if (refYear < targetYear || (refYear === targetYear && refMonth < targetMonth)) {
    daysPassed = 0; // Future month
  }

  // Filter expenses strictly belonging to target year and month up to reference day
  const prefix = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  const maxDateStr = formatLocalYMD(ref);

  const monthExpenses = (expenses || []).filter((e) => {
    if (!e || !e.date || !e.date.startsWith(prefix)) return false;
    // When evaluating within the current month, do not include future-dated transactions
    if (refYear === targetYear && refMonth === targetMonth && e.date > maxDateStr) {
      return false;
    }
    return true;
  });

  const txCount = monthExpenses.length;
  const currentSpent = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Data sufficiency check: requires at least 3 transactions to generate a reliable velocity forecast
  const hasSufficientData = txCount >= 3;

  const daysRemaining = Math.max(0, totalDaysInMonth - daysPassed);
  const dailyAverage = daysPassed > 0 ? Math.round(currentSpent / daysPassed) : 0;

  let projectedTotal = currentSpent;
  let remainingProjected = 0;

  if (hasSufficientData) {
    if (daysRemaining === 0 || daysPassed >= totalDaysInMonth) {
      projectedTotal = currentSpent;
      remainingProjected = 0;
    } else if (daysPassed > 0) {
      projectedTotal = dailyAverage * totalDaysInMonth;
      remainingProjected = Math.max(0, projectedTotal - currentSpent);
    }
  }

  const budgetPaise = opts.monthlyBudget ?? 4000000;
  const projectedPercentage = budgetPaise > 0 ? Math.round((projectedTotal / budgetPaise) * 100) : 0;
  const onTrack = projectedPercentage <= 100;

  const status = projectedPercentage > 100 ? 'danger' :
                 projectedPercentage >= 90 ? 'warning' :
                 projectedPercentage >= 75 ? 'caution' : 'ok';

  const monthName = new Date(targetYear, targetMonth - 1, 1).toLocaleDateString('en-IN', { month: 'long' });

  let confidence = 'High';
  let message = '';

  if (!hasSufficientData) {
    confidence = 'Low';
    message = `Not enough transactions in ${monthName} to generate a reliable forecast (minimum 3 transactions needed; found ${txCount}).`;
  } else {
    confidence = 'Estimated (Velocity Model)';
    const dailyRupees = (dailyAverage / 100).toFixed(2);
    const projectedRupees = (projectedTotal / 100).toFixed(2);
    message = `Based on your daily average spending of ₹${dailyRupees} over ${daysPassed} days, you are on track to spend ₹${projectedRupees} by the end of ${monthName} (${projectedPercentage}% of budget).`;
  }

  // Daily spend trajectory generation for Chart.js line visualization
  const dailySpendMap = new Map();
  for (let d = 1; d <= totalDaysInMonth; d++) {
    dailySpendMap.set(d, 0);
  }

  for (const e of monthExpenses) {
    const day = parseInt(e.date.slice(8, 10), 10);
    if (day >= 1 && day <= totalDaysInMonth) {
      dailySpendMap.set(day, (dailySpendMap.get(day) || 0) + (e.amount || 0));
    }
  }

  const dailyTrajectory = [];
  let cumActual = 0;

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const daySpend = dailySpendMap.get(d) || 0;
    cumActual += daySpend;

    const actualCumulative = d <= daysPassed ? cumActual : null;
    const projectedCumulative = dailyAverage * d;

    dailyTrajectory.push({
      day: d,
      actualCumulative,
      projectedCumulative
    });
  }

  return {
    hasSufficientData,
    transactionCount: txCount,
    totalSpent: currentSpent,
    currentSpent,
    projectedSpend: projectedTotal,
    projectedTotal,
    remainingProjected,
    projectedRemaining: remainingProjected,
    projectedOverUnder: projectedTotal - budgetPaise,
    dailyAverage,
    daysPassed,
    daysInMonth: totalDaysInMonth,
    totalDaysInMonth,
    daysRemaining,
    projectedPercentage,
    isOnTrack: onTrack,
    onTrack,
    status,
    confidence,
    reason: message,
    message,
    dailyTrajectory
  };
}

/**
 * Assess risk of exceeding configured budgets based on forecast projections or direct values.
 * Supports both assessBudgetRisk(spentPaise, budgetPaise) and assessBudgetRisk({ budgets, currentSpent, projectedTotal })
 *
 * @param {number|Object} spentOrParams
 * @param {number} [budgetPaise]
 * @returns {Object|Array<Object>} Risk assessment result
 */
export function assessBudgetRisk(spentOrParams, budgetPaise) {
  // If called directly with spent and limit numbers: assessBudgetRisk(spent, budget)
  if (typeof spentOrParams === 'number' || typeof budgetPaise === 'number') {
    const spent = Number(spentOrParams) || 0;
    const limit = Number(budgetPaise) || 0;

    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : (spent > 0 ? 100 : 0);
    const status = (limit <= 0 && spent > 0) || percentage > 100 ? 'danger' :
                   percentage >= 90 ? 'warning' :
                   percentage >= 75 ? 'caution' : 'ok';

    const isOnTrack = status !== 'danger' && percentage <= 100;
    const overUnderPaise = spent - limit;

    let message = '';
    if (status === 'danger') {
      const overPercent = percentage - 100;
      message = `${overPercent}% over limit`;
    } else if (status === 'warning') {
      message = `Approaching limit (${percentage}% used)`;
    } else if (status === 'caution') {
      message = `Moderate spend (${percentage}% used)`;
    } else {
      message = `On track (${percentage}% used)`;
    }

    return {
      status,
      riskLevel: status,
      percentage,
      isOnTrack,
      overUnderPaise,
      message
    };
  }

  // Called with params object: assessBudgetRisk({ budgets, currentSpent, projectedTotal, categoryExpenses })
  const {
    budgets = [],
    currentSpent = 0,
    projectedTotal = 0,
    categoryExpenses = {}
  } = spentOrParams || {};

  const risks = [];
  const catMap = categoryExpenses instanceof Map ? categoryExpenses : new Map(Object.entries(categoryExpenses));

  for (const b of budgets) {
    const isOverall = b.categoryId === null;
    const spent = isOverall ? currentSpent : (catMap.get(b.categoryId) || 0);
    const limit = b.limit || 0;

    if (limit <= 0) continue;

    const percent = Math.round((spent / limit) * 100);
    let riskLevel = 'ok';

    if (percent > 100) {
      riskLevel = 'danger';
    } else if (percent >= 90) {
      riskLevel = 'warning';
    } else if (percent >= 75) {
      riskLevel = 'caution';
    }

    let description = '';
    const catName = b.categoryName || (isOverall ? 'Overall budget' : b.categoryId);
    const spentRupees = (spent / 100).toFixed(2);
    const limitRupees = (limit / 100).toFixed(2);

    if (riskLevel === 'danger') {
      const overRupees = ((spent - limit) / 100).toFixed(2);
      description = `${catName} has exceeded limit of ₹${limitRupees} by ₹${overRupees} (${percent}% used).`;
    } else if (riskLevel === 'warning') {
      const leftRupees = ((limit - spent) / 100).toFixed(2);
      description = `${catName} is near limit with ${percent}% used (₹${leftRupees} remaining).`;
    } else if (riskLevel === 'caution') {
      description = `${catName} is at ${percent}% of limit (₹${spentRupees} of ₹${limitRupees}).`;
    } else {
      description = `${catName} is comfortably on track at ${percent}% of limit.`;
    }

    risks.push({
      categoryId: b.categoryId,
      categoryName: catName,
      limit,
      spent,
      projected: isOverall ? projectedTotal : Math.round(spent * 1.1),
      percentage: percent,
      riskLevel,
      status: riskLevel,
      description
    });
  }

  return risks;
}
