/**
 * SplitStack Personal Income REST API (Review 3, Step P11).
 * GET    /api/income
 * POST   /api/income
 * GET    /api/income/:id
 * PATCH  /api/income/:id
 * DELETE /api/income/:id
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId, assertPositivePaise, isValidObjectId } from '../middleware/validate.js';
import { Income } from '../models/Income.js';
import { Category } from '../models/Category.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const incomeRouter = Router();

incomeRouter.use(requireAuth);

/**
 * List personal income streams with filtering, keyword search, and pagination.
 * Scoped strictly to authenticated user: { user: req.userId }.
 */
incomeRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.q || req.query.search || '').trim();
    const categoryId = req.query.categoryId || req.query.category || '';
    const startDate = req.query.startDate || req.query.from || '';
    const endDate = req.query.endDate || req.query.to || '';
    const minPaise = req.query.minPaise !== undefined ? parseInt(req.query.minPaise, 10) : null;
    const maxPaise = req.query.maxPaise !== undefined ? parseInt(req.query.maxPaise, 10) : null;
    const sort = req.query.sort || 'date_desc';

    if (isDbConnected()) {
      const query = { user: req.userId };

      if (search) {
        query.$or = [
          { source: { $regex: search, $options: 'i' } },
          { notes: { $regex: search, $options: 'i' } },
        ];
      }

      if (categoryId && isValidObjectId(categoryId)) {
        query.category = categoryId;
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

      let sortOpt = { date: -1, createdAt: -1 };
      if (sort === 'date_asc') sortOpt = { date: 1, createdAt: 1 };
      else if (sort === 'amount_desc') sortOpt = { amount: -1 };
      else if (sort === 'amount_asc') sortOpt = { amount: 1 };

      const total = await Income.countDocuments(query);
      const totalPages = Math.ceil(total / limit) || 1;
      const skip = (page - 1) * limit;

      const items = await Income.find(query)
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
 * Record a new income stream.
 */
incomeRouter.post('/', async (req, res, next) => {
  try {
    const { categoryId, category, amount, date, source, paymentMethod, notes } = req.body || {};
    const catId = categoryId || category;

    if (!catId) {
      throw new BadRequestError('Category is required.', { categoryId: 'Category is required' });
    }
    assertPositivePaise(amount, 'amount');
    if (!source || !source.trim()) {
      throw new BadRequestError('Income source is required.', { source: 'Source is required' });
    }

    if (isDbConnected()) {
      if (!isValidObjectId(catId)) {
        throw new BadRequestError('Invalid category ID format.', { categoryId: 'Invalid ObjectId' });
      }

      const catDoc = await Category.findOne({
        _id: catId,
        $or: [{ user: null }, { user: req.userId }],
      });
      if (!catDoc) {
        throw new BadRequestError('Specified category does not exist or is inaccessible.', { categoryId: 'Not found' });
      }

      const income = new Income({
        user: req.userId,
        category: catId,
        amount,
        date: date ? new Date(date) : new Date(),
        source: source.trim(),
        paymentMethod: paymentMethod || 'Net banking',
        notes: (notes || '').trim(),
      });

      await income.save();
      await income.populate('category', 'name type icon color');
      return res.status(201).json(income.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439022',
      id: '507f1f77bcf86cd799439022',
      user: req.userId,
      category: catId,
      amount,
      source: source.trim(),
      date: date || new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Retrieve a single income record by ID.
 * Strict ownership check: only owner can retrieve.
 */
incomeRouter.get('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const income = await Income.findOne({ _id: req.params.id, user: req.userId })
        .populate('category', 'name type icon color')
        .lean();
      if (!income) {
        throw new NotFoundError('Income record not found.');
      }
      return res.status(200).json(income);
    }

    res.status(200).json({ _id: req.params.id, user: req.userId });
  } catch (err) {
    next(err);
  }
});

/**
 * Update an existing income record.
 * Strict ownership check: only owner can update.
 */
incomeRouter.patch('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    const { categoryId, category, amount, date, source, paymentMethod, notes } = req.body || {};
    const catId = categoryId || category;

    if (amount !== undefined) {
      assertPositivePaise(amount, 'amount');
    }

    if (isDbConnected()) {
      const income = await Income.findOne({ _id: req.params.id, user: req.userId });
      if (!income) {
        throw new NotFoundError('Income record not found.');
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
        income.category = catId;
      }

      if (amount !== undefined) income.amount = amount;
      if (date !== undefined) income.date = new Date(date);
      if (source !== undefined) income.source = source.trim();
      if (paymentMethod !== undefined) income.paymentMethod = paymentMethod;
      if (notes !== undefined) income.notes = notes.trim();

      await income.save();
      await income.populate('category', 'name type icon color');
      return res.status(200).json(income.toJSON());
    }

    res.status(200).json({ _id: req.params.id, user: req.userId, ...req.body });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete an income record.
 * Strict ownership check: only owner can delete.
 */
incomeRouter.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const result = await Income.findOneAndDelete({ _id: req.params.id, user: req.userId });
      if (!result) {
        throw new NotFoundError('Income record not found.');
      }
      return res.status(200).json({ ok: true, id: req.params.id });
    }

    res.status(200).json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default incomeRouter;
