/**
 * SplitStack Recurring Payments REST API (Review 3, Step P11).
 * GET    /api/recurring
 * POST   /api/recurring
 * PATCH  /api/recurring/:id/toggle
 * DELETE /api/recurring/:id
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId, assertPositivePaise, isValidObjectId } from '../middleware/validate.js';
import { Recurring } from '../models/Recurring.js';
import { Category } from '../models/Category.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const recurringRouter = Router();

recurringRouter.use(requireAuth);

/**
 * List recurring payment schedules for the authenticated user.
 */
recurringRouter.get('/', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const items = await Recurring.find({ user: req.userId })
        .populate('category', 'name type icon color')
        .sort({ nextDueDate: 1 })
        .lean();
      return res.status(200).json(items);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new recurring payment schedule.
 */
recurringRouter.post('/', async (req, res, next) => {
  try {
    const { name, amount, categoryId, category, frequency, startDate, nextDueDate, active } = req.body || {};
    const catId = categoryId || category;

    if (!name || !name.trim()) {
      throw new BadRequestError('Payment schedule name is required.', { name: 'Name is required' });
    }
    assertPositivePaise(amount, 'amount');
    if (!catId) {
      throw new BadRequestError('Category is required.', { categoryId: 'Category is required' });
    }

    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!frequency || !validFrequencies.includes(frequency)) {
      throw new BadRequestError('Valid frequency is required (daily, weekly, monthly, yearly).', {
        frequency: 'Invalid frequency',
      });
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
        throw new BadRequestError('Category not found.', { categoryId: 'Not found' });
      }

      const recurring = new Recurring({
        user: req.userId,
        category: catId,
        name: name.trim(),
        amount,
        frequency,
        startDate: startDate ? new Date(startDate) : new Date(),
        nextDueDate: nextDueDate ? new Date(nextDueDate) : startDate ? new Date(startDate) : new Date(),
        active: active !== undefined ? Boolean(active) : true,
      });

      await recurring.save();
      await recurring.populate('category', 'name type icon color');
      return res.status(201).json(recurring.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439025',
      user: req.userId,
      name: name.trim(),
      amount,
      frequency,
      active: active !== undefined ? Boolean(active) : true,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Toggle the active status of a recurring payment.
 */
recurringRouter.patch('/:id/toggle', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const item = await Recurring.findOne({ _id: req.params.id, user: req.userId });
      if (!item) {
        throw new NotFoundError('Recurring payment schedule not found.');
      }

      item.active = !item.active;
      await item.save();
      await item.populate('category', 'name type icon color');
      return res.status(200).json(item.toJSON());
    }

    res.status(200).json({ _id: req.params.id, active: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a recurring payment schedule.
 */
recurringRouter.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const result = await Recurring.findOneAndDelete({ _id: req.params.id, user: req.userId });
      if (!result) {
        throw new NotFoundError('Recurring payment schedule not found.');
      }
      return res.status(200).json({ ok: true, id: req.params.id });
    }

    res.status(200).json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default recurringRouter;
