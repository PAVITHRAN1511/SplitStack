/**
 * SplitStack Budgets REST API (Review 3, Step P11).
 * GET    /api/budgets
 * POST   /api/budgets
 * PATCH  /api/budgets/:id
 * DELETE /api/budgets/:id
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId, assertPositivePaise, isValidObjectId } from '../middleware/validate.js';
import { Budget } from '../models/Budget.js';
import { Expense } from '../models/Expense.js';
import { Category } from '../models/Category.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const budgetsRouter = Router();

budgetsRouter.use(requireAuth);

/**
 * List budgets with live computed spending progress, remaining amounts, and alert states.
 */
budgetsRouter.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const year = parseInt(req.query.year, 10) || now.getFullYear();

    if (month < 1 || month > 12) {
      throw new BadRequestError('Month must be between 1 and 12.', { month: 'Invalid month' });
    }
    if (year < 2000 || year > 2100) {
      throw new BadRequestError('Year must be between 2000 and 2100.', { year: 'Invalid year' });
    }

    if (isDbConnected()) {
      const userBudgets = await Budget.find({
        user: req.userId,
        month,
        year,
      })
        .populate('category', 'name type icon color')
        .lean();

      // Determine date range for the month
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      // Fetch user's expenses for this month
      const monthExpenses = await Expense.find({
        user: req.userId,
        date: { $gte: startOfMonth, $lte: endOfMonth },
      }).lean();

      const items = userBudgets.map((b) => {
        let spent = 0;
        if (!b.category) {
          // Overall monthly budget
          spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
        } else {
          // Category-specific budget
          const catIdStr = b.category._id ? b.category._id.toString() : b.category.toString();
          spent = monthExpenses
            .filter((e) => (e.category?._id ? e.category._id.toString() : e.category.toString()) === catIdStr)
            .reduce((sum, e) => sum + e.amount, 0);
        }

        const percentage = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
        let status = 'ok';
        if (percentage > 100) status = 'danger';
        else if (percentage >= 90) status = 'warning';
        else if (percentage >= 75) status = 'caution';

        return {
          ...b,
          spent,
          remaining: Math.max(0, b.limit - spent),
          percentage,
          status,
        };
      });

      return res.status(200).json(items);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Set or create a monthly budget limit (upsert).
 */
budgetsRouter.post('/', async (req, res, next) => {
  try {
    const { categoryId, category, month, year, limit } = req.body || {};
    const catId = categoryId !== undefined ? categoryId : category;

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      throw new BadRequestError('Month must be between 1 and 12.', { month: 'Invalid month' });
    }
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      throw new BadRequestError('Year must be between 2000 and 2100.', { year: 'Invalid year' });
    }
    assertPositivePaise(limit, 'limit');

    if (isDbConnected()) {
      let resolvedCategory = null;
      if (catId && catId !== 'null') {
        if (!isValidObjectId(catId)) {
          throw new BadRequestError('Invalid category ID format.', { categoryId: 'Invalid ObjectId' });
        }
        const found = await Category.findOne({
          _id: catId,
          $or: [{ user: null }, { user: req.userId }],
        });
        if (!found) {
          throw new BadRequestError('Category not found.', { categoryId: 'Not found' });
        }
        resolvedCategory = found._id;
      }

      // Upsert: check for existing budget for user + category + month + year
      let budget = await Budget.findOne({
        user: req.userId,
        category: resolvedCategory,
        month: parsedMonth,
        year: parsedYear,
      });

      if (budget) {
        budget.limit = limit;
        await budget.save();
      } else {
        budget = new Budget({
          user: req.userId,
          category: resolvedCategory,
          month: parsedMonth,
          year: parsedYear,
          limit,
        });
        await budget.save();
      }

      await budget.populate('category', 'name type icon color');
      return res.status(201).json(budget.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439024',
      user: req.userId,
      category: catId || null,
      month: parsedMonth,
      year: parsedYear,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update budget limit by ID.
 */
budgetsRouter.patch('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    const { limit } = req.body || {};
    if (limit !== undefined) {
      assertPositivePaise(limit, 'limit');
    }

    if (isDbConnected()) {
      const budget = await Budget.findOne({ _id: req.params.id, user: req.userId });
      if (!budget) {
        throw new NotFoundError('Budget not found.');
      }

      if (limit !== undefined) budget.limit = limit;
      await budget.save();
      await budget.populate('category', 'name type icon color');
      return res.status(200).json(budget.toJSON());
    }

    res.status(200).json({ _id: req.params.id, user: req.userId, limit });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a budget limit by ID.
 */
budgetsRouter.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const result = await Budget.findOneAndDelete({ _id: req.params.id, user: req.userId });
      if (!result) {
        throw new NotFoundError('Budget not found.');
      }
      return res.status(200).json({ ok: true, id: req.params.id });
    }

    res.status(200).json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default budgetsRouter;
