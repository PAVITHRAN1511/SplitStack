/**
 * SplitStack Global Workspace Search REST API (Review 3, Step P11).
 * GET /api/search?q=...
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Expense } from '../models/Expense.js';
import { Income } from '../models/Income.js';
import { Group } from '../models/Group.js';
import { ShoppingList } from '../models/ShoppingList.js';
import { isDbConnected } from '../db.js';

export const searchRouter = Router();

searchRouter.use(requireAuth);

/**
 * Search across personal expenses, income, groups, and shopping lists.
 */
searchRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    if (!q) {
      return res.status(200).json({
        expenses: [],
        income: [],
        groups: [],
        shopping: [],
        shoppingLists: [],
        total: 0,
      });
    }

    if (isDbConnected()) {
      const regex = new RegExp(q, 'i');

      // User's accessible groups
      const userGroups = await Group.find({ 'members.user': req.userId }).select('_id name description').lean();
      const userGroupIds = userGroups.map((g) => g._id);

      const [matchedExpenses, matchedIncome, matchedShopping] = await Promise.all([
        Expense.find({
          user: req.userId,
          $or: [{ description: regex }, { notes: regex }],
        })
          .populate('category', 'name color icon')
          .limit(5)
          .lean(),

        Income.find({
          user: req.userId,
          $or: [{ source: regex }, { notes: regex }],
        })
          .populate('category', 'name color icon')
          .limit(5)
          .lean(),

        ShoppingList.find({
          $or: [{ owner: req.userId }, { group: { $in: userGroupIds } }],
          $or: [{ name: regex }, { 'items.name': regex }],
        })
          .limit(5)
          .lean(),
      ]);

      const matchedGroups = userGroups.filter((g) => regex.test(g.name) || regex.test(g.description || '')).slice(0, 5);

      const total = matchedExpenses.length + matchedIncome.length + matchedGroups.length + matchedShopping.length;

      return res.status(200).json({
        expenses: matchedExpenses,
        income: matchedIncome,
        groups: matchedGroups,
        shopping: matchedShopping,
        shoppingLists: matchedShopping,
        total,
      });
    }

    res.status(200).json({
      expenses: [],
      income: [],
      groups: [],
      shopping: [],
      shoppingLists: [],
      total: 0,
    });
  } catch (err) {
    next(err);
  }
});

export default searchRouter;
