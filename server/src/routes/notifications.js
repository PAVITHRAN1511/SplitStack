/**
 * SplitStack In-App Notifications REST API (Review 3, Step P11).
 * GET    /api/notifications
 * PATCH  /api/notifications/:id/read
 * POST   /api/notifications/mark-all-read
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { Budget } from '../models/Budget.js';
import { Category } from '../models/Category.js';
import { Recurring } from '../models/Recurring.js';
import { Group } from '../models/Group.js';
import { SharedExpense } from '../models/SharedExpense.js';
import { Settlement } from '../models/Settlement.js';
import { generateInsights, calculateNetBalances } from '../utils/domain.js';
import { isDbConnected } from '../db.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

/**
 * Generate in-app notifications with read status and unread count badge.
 */
notificationsRouter.get('/', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const [userDoc, expenses, income, budgets, categories, recurring, groups] = await Promise.all([
        User.findById(req.userId).lean(),
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

      const rawInsights = generateInsights({
        user: userDoc || req.user,
        expenses: formattedExpenses,
        income: formattedIncome,
        budgets,
        categories,
        recurring,
        groups,
        groupBalancesMap,
        referenceDate: new Date().toISOString().slice(0, 10),
      });

      const readNotifications = userDoc?.preferences?.readNotifications || [];
      const readSet = new Set(readNotifications);

      const notifications = rawInsights.map((ins) => ({
        ...ins,
        read: readSet.has(ins.id),
      }));

      const unreadCount = notifications.filter((n) => !n.read).length;
      return res.status(200).json({ notifications, unreadCount });
    }

    res.status(200).json({ notifications: [], unreadCount: 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * Mark a single notification as read.
 */
notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const notificationId = req.params.id;

    if (isDbConnected()) {
      const user = await User.findById(req.userId);
      if (user) {
        if (!user.preferences) user.preferences = {};
        if (!Array.isArray(user.preferences.readNotifications)) {
          user.preferences.readNotifications = [];
        }

        if (!user.preferences.readNotifications.includes(notificationId)) {
          user.preferences.readNotifications.push(notificationId);
          await user.save();
        }
      }
      return res.status(200).json({ ok: true });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Mark all notifications as read.
 */
notificationsRouter.post('/mark-all-read', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const user = await User.findById(req.userId);
      if (user) {
        // Find current notification IDs from analytics insights
        const [expenses, income, budgets, categories, recurring, groups] = await Promise.all([
          Expense.find({ user: req.userId }).lean(),
          Income.find({ user: req.userId }).lean(),
          Budget.find({ user: req.userId }).lean(),
          Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean(),
          Recurring.find({ user: req.userId }).lean(),
          Group.find({ 'members.user': req.userId }).lean(),
        ]);

        const rawInsights = generateInsights({
          user: user.toJSON(),
          expenses: expenses.map((e) => ({ ...e, date: e.date.toISOString().slice(0, 10) })),
          income: income.map((i) => ({ ...i, date: i.date.toISOString().slice(0, 10) })),
          budgets,
          categories,
          recurring,
          groups,
          groupBalancesMap: {},
          referenceDate: new Date().toISOString().slice(0, 10),
        });

        if (!user.preferences) user.preferences = {};
        user.preferences.readNotifications = rawInsights.map((ins) => ins.id);
        await user.save();
      }
      return res.status(200).json({ ok: true });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default notificationsRouter;
