/**
 * SplitStack Analytics, Forecast & Smart Insights REST API (Review 3, Step P11).
 * GET /api/analytics/monthly
 * GET /api/analytics/categories
 * GET /api/analytics/forecast
 * GET /api/analytics/insights
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { Category } from '../models/Category.js';
import { Budget } from '../models/Budget.js';
import { Recurring } from '../models/Recurring.js';
import { Group } from '../models/Group.js';
import { SharedExpense } from '../models/SharedExpense.js';
import { Settlement } from '../models/Settlement.js';
import { calculateForecast, generateInsights, calculateNetBalances } from '../utils/domain.js';
import { isDbConnected } from '../db.js';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

/**
 * Monthly financial summary (income, expenses, savings rate, and historical trend).
 */
analyticsRouter.get('/monthly', async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const monthsBack = Math.max(1, Math.min(24, parseInt(req.query.monthsBack, 10) || 6));

    if (isDbConnected()) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      const [currExpenses, currIncome] = await Promise.all([
        Expense.find({ user: req.userId, date: { $gte: startOfMonth, $lte: endOfMonth } }).select('amount').lean(),
        Income.find({ user: req.userId, date: { $gte: startOfMonth, $lte: endOfMonth } }).select('amount').lean(),
      ]);

      const totalExpenses = currExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalIncome = currIncome.reduce((sum, i) => sum + i.amount, 0);
      const savings = Math.max(0, totalIncome - totalExpenses);
      const savingsRate = totalIncome > 0 ? Number(((savings / totalIncome) * 100).toFixed(1)) : 0;

      // Historical trend
      const trend = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0, 23, 59, 59, 999);

        const [mExp, mInc] = await Promise.all([
          Expense.aggregate([
            { $match: { user: req.user._id || req.userId, date: { $gte: start, $lte: end } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
          Income.aggregate([
            { $match: { user: req.user._id || req.userId, date: { $gte: start, $lte: end } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        ]);

        const expensesSum = mExp[0]?.total || 0;
        const incomeSum = mInc[0]?.total || 0;
        const label = d.toLocaleString('en-IN', { month: 'short' }) + ' ' + y;

        trend.push({
          month: m,
          year: y,
          label,
          expenses: expensesSum,
          income: incomeSum,
        });
      }

      return res.status(200).json({
        totalIncome,
        totalExpenses,
        savings,
        savingsRate,
        trend,
      });
    }

    res.status(200).json({
      totalIncome: 0,
      totalExpenses: 0,
      savings: 0,
      savingsRate: 0,
      trend: [],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Category breakdown for a month with month-over-month comparisons.
 */
analyticsRouter.get('/categories', async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const type = req.query.type || 'expense';

    if (isDbConnected()) {
      const startCurr = new Date(year, month - 1, 1);
      const endCurr = new Date(year, month, 0, 23, 59, 59, 999);

      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const startPrev = new Date(prevYear, prevMonth - 1, 1);
      const endPrev = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

      const Model = type === 'expense' ? Expense : Income;

      const [currRecords, prevRecords, allCategories] = await Promise.all([
        Model.find({ user: req.userId, date: { $gte: startCurr, $lte: endCurr } }).populate('category').lean(),
        Model.find({ user: req.userId, date: { $gte: startPrev, $lte: endPrev } }).populate('category').lean(),
        Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean(),
      ]);

      const total = currRecords.reduce((sum, r) => sum + r.amount, 0);

      const byCat = {};
      for (const r of currRecords) {
        const catId = r.category?._id ? r.category._id.toString() : 'uncategorized';
        byCat[catId] = (byCat[catId] || 0) + r.amount;
      }

      const prevByCat = {};
      for (const r of prevRecords) {
        const catId = r.category?._id ? r.category._id.toString() : 'uncategorized';
        prevByCat[catId] = (prevByCat[catId] || 0) + r.amount;
      }

      const result = [];
      const catMap = new Map(allCategories.map((c) => [c._id.toString(), c]));

      for (const [catId, amount] of Object.entries(byCat)) {
        const catDoc = catMap.get(catId) || { name: 'Other', color: '#64748b', icon: 'tag' };
        const percentage = total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0;
        const prevAmount = prevByCat[catId] || 0;
        const changePercent = prevAmount > 0 ? Number((((amount - prevAmount) / prevAmount) * 100).toFixed(1)) : null;

        result.push({
          categoryId: catId,
          category: catDoc,
          name: catDoc.name,
          amount,
          percentage,
          prevAmount,
          changePercent,
        });
      }

      result.sort((a, b) => b.amount - a.amount);
      return res.status(200).json(result);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Velocity spending forecast model.
 */
analyticsRouter.get('/forecast', async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const referenceDate = req.query.referenceDate || now.toISOString().slice(0, 10);

    if (isDbConnected()) {
      const expenses = await Expense.find({ user: req.userId }).lean();
      const budgetDoc = await Budget.findOne({ user: req.userId, category: null, month, year }).lean();
      const monthlyBudget = budgetDoc?.limit || req.user.preferences?.monthlyBudget || 4000000;

      const formatted = expenses.map((e) => ({
        ...e,
        date: e.date.toISOString().slice(0, 10),
      }));

      const fc = calculateForecast({
        expenses: formatted,
        month,
        year,
        referenceDate,
        monthlyBudget,
      });

      return res.status(200).json({
        ...fc,
        monthlyBudget,
        projectedSpend: fc.projectedTotal,
        totalSoFar: fc.currentSpent,
      });
    }

    res.status(200).json({
      currentSpent: 0,
      projectedTotal: 0,
      budget: 4000000,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Smart, data-driven financial insights & alerts.
 */
analyticsRouter.get('/insights', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const [expenses, income, budgets, categories, recurring, groups] = await Promise.all([
        Expense.find({ user: req.userId }).lean(),
        Income.find({ user: req.userId }).lean(),
        Budget.find({ user: req.userId }).lean(),
        Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean(),
        Recurring.find({ user: req.userId }).lean(),
        Group.find({ 'members.user': req.userId }).lean(),
      ]);

      const groupBalancesMap = {};
      for (const g of groups) {
        const shared = await SharedExpense.find({ group: g._id }).lean();
        const settlements = await Settlement.find({ group: g._id, status: 'completed' }).lean();
        const memberIds = g.members.map((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()));

        const { balances } = calculateNetBalances({
          members: memberIds,
          expenses: shared.map((e) => ({
            paidBy: e.paidBy.toString(),
            amount: e.amount,
            shares: (e.shares || []).map((s) => ({ userId: s.user.toString(), amount: s.amount })),
          })),
          settlements: settlements.map((s) => ({
            payerId: s.payer.toString(),
            payeeId: s.payee.toString(),
            amount: s.amount,
            status: s.status,
          })),
        });

        groupBalancesMap[g._id.toString()] = balances[req.userId] || 0;
      }

      const formattedExpenses = expenses.map((e) => ({
        ...e,
        date: e.date.toISOString().slice(0, 10),
        categoryId: e.category?.toString(),
      }));
      const formattedIncome = income.map((i) => ({
        ...i,
        date: i.date.toISOString().slice(0, 10),
      }));

      const insightsList = generateInsights({
        user: req.user,
        expenses: formattedExpenses,
        income: formattedIncome,
        budgets,
        categories,
        recurring,
        groups,
        groupBalancesMap,
        referenceDate: new Date().toISOString().slice(0, 10),
      });

      return res.status(200).json(insightsList);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

export default analyticsRouter;
