/**
 * SplitStack Personal Expenses REST API (Review 3, Step P11).
 * GET    /api/expenses
 * POST   /api/expenses
 * GET    /api/expenses/:id
 * PATCH  /api/expenses/:id
 * DELETE /api/expenses/:id
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId, assertPositivePaise, isValidObjectId } from '../middleware/validate.js';
import { Expense } from '../models/Expense.js';
import { Category } from '../models/Category.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const expensesRouter = Router();

expensesRouter.use(requireAuth);

/**
 * List personal expenses with filtering, keyword search, sorting, and pagination.
 * Scoped strictly to authenticated user: { user: req.userId }.
 */
expensesRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.q || req.query.search || '').trim();
    const categoryId = req.query.categoryId || req.query.category || '';
    const paymentMethod = req.query.paymentMethod || req.query.method || '';
    const startDate = req.query.startDate || req.query.from || '';
    const endDate = req.query.endDate || req.query.to || '';
    const minPaise = req.query.minPaise !== undefined ? parseInt(req.query.minPaise, 10) : null;
    const maxPaise = req.query.maxPaise !== undefined ? parseInt(req.query.maxPaise, 10) : null;
    const sort = req.query.sort || 'date_desc';

    if (isDbConnected()) {
      const query = { user: req.userId };

      if (search) {
        query.$or = [
          { description: { $regex: search, $options: 'i' } },
          { notes: { $regex: search, $options: 'i' } },
        ];
      }

      if (categoryId && isValidObjectId(categoryId)) {
        query.category = categoryId;
      }

      if (paymentMethod) {
        query.paymentMethod = new RegExp(`^${paymentMethod}$`, 'i');
      }

      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.date.$lte = end;
        }
      }

      if (minPaise !== null && !isNaN(minPaise)) {
        query.amount = query.amount || {};
        query.amount.$gte = minPaise;
      }

      if (maxPaise !== null && !isNaN(maxPaise)) {
        query.amount = query.amount || {};
        query.amount.$lte = maxPaise;
      }

      // Sort ordering
      let sortOpt = { date: -1, createdAt: -1 };
      if (sort === 'date_asc') sortOpt = { date: 1, createdAt: 1 };
      else if (sort === 'amount_desc') sortOpt = { amount: -1 };
      else if (sort === 'amount_asc') sortOpt = { amount: 1 };

      const total = await Expense.countDocuments(query);
      const totalPages = Math.ceil(total / limit) || 1;
      const skip = (page - 1) * limit;

      const items = await Expense.find(query)
        .populate('category', 'name type icon color')
        .sort(sortOpt)
        .skip(skip)
        .limit(limit)
        .lean();

      return res.status(200).json({
        items,
        total,
        page,
        limit,
        totalPages,
      });
    }

    // Offline / mock mode
    res.status(200).json({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Record a new personal expense.
 */
expensesRouter.post('/', async (req, res, next) => {
  try {
    const { categoryId, category, amount, date, description, paymentMethod, notes, tags } = req.body || {};
    const catId = categoryId || category;

    if (!catId) {
      throw new BadRequestError('Category is required.', { categoryId: 'Category is required' });
    }
    assertPositivePaise(amount, 'amount');
    if (!description || !description.trim()) {
      throw new BadRequestError('Description is required.', { description: 'Description is required' });
    }

    if (isDbConnected()) {
      if (!isValidObjectId(catId)) {
        throw new BadRequestError('Invalid category ID format.', { categoryId: 'Invalid ObjectId' });
      }

      // Ensure category exists and is accessible
      const catDoc = await Category.findOne({
        _id: catId,
        $or: [{ user: null }, { user: req.userId }],
      });
      if (!catDoc) {
        throw new BadRequestError('Specified category does not exist or is inaccessible.', { categoryId: 'Not found' });
      }

      const expense = new Expense({
        user: req.userId,
        category: catId,
        amount,
        date: date ? new Date(date) : new Date(),
        description: description.trim(),
        paymentMethod: paymentMethod || 'UPI',
        notes: (notes || '').trim(),
        tags: Array.isArray(tags) ? tags : [],
      });

      await expense.save();
      await expense.populate('category', 'name type icon color');
      return res.status(201).json(expense.toJSON());
    }

    const mockCreated = {
      _id: '507f1f77bcf86cd799439021',
      id: '507f1f77bcf86cd799439021',
      user: req.userId,
      category: catId,
      amount,
      date: date || new Date().toISOString().slice(0, 10),
      description: description.trim(),
      paymentMethod: paymentMethod || 'UPI',
      notes: notes || '',
    };
    res.status(201).json(mockCreated);
  } catch (err) {
    next(err);
  }
});

/**
 * Retrieve a single personal expense by ID.
 * Strict ownership check: only owner can retrieve.
 */
expensesRouter.get('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const expense = await Expense.findOne({ _id: req.params.id, user: req.userId })
        .populate('category', 'name type icon color')
        .lean();
      if (!expense) {
        throw new NotFoundError('Expense not found.');
      }
      return res.status(200).json(expense);
    }

    res.status(200).json({ _id: req.params.id, user: req.userId });
  } catch (err) {
    next(err);
  }
});

/**
 * Update an existing personal expense.
 * Strict ownership check: only owner can update.
 */
expensesRouter.patch('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    const { categoryId, category, amount, date, description, paymentMethod, notes, tags } = req.body || {};
    const catId = categoryId || category;

    if (amount !== undefined) {
      assertPositivePaise(amount, 'amount');
    }

    if (isDbConnected()) {
      const expense = await Expense.findOne({ _id: req.params.id, user: req.userId });
      if (!expense) {
        throw new NotFoundError('Expense not found.');
      }

      if (catId) {
        if (!isValidObjectId(catId)) {
          throw new BadRequestError('Invalid category ID format.', { categoryId: 'Invalid ObjectId' });
        }
        const catDoc = await Category.findOne({
          _id: catId,
          $or: [{ user: null }, { user: req.userId }],
        });
        if (!catDoc) {
          throw new BadRequestError('Specified category does not exist.', { categoryId: 'Not found' });
        }
        expense.category = catId;
      }

      if (amount !== undefined) expense.amount = amount;
      if (date !== undefined) expense.date = new Date(date);
      if (description !== undefined) expense.description = description.trim();
      if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
      if (notes !== undefined) expense.notes = notes.trim();
      if (tags !== undefined && Array.isArray(tags)) expense.tags = tags;

      await expense.save();
      await expense.populate('category', 'name type icon color');
      return res.status(200).json(expense.toJSON());
    }

    res.status(200).json({ _id: req.params.id, user: req.userId, ...req.body });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a personal expense.
 * Strict ownership check: only owner can delete.
 */
expensesRouter.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const result = await Expense.findOneAndDelete({ _id: req.params.id, user: req.userId });
      if (!result) {
        throw new NotFoundError('Expense not found.');
      }
      return res.status(200).json({ ok: true, id: req.params.id });
    }

    res.status(200).json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default expensesRouter;
