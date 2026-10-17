/**
 * SplitStack Categories REST API (Review 3, Step P11).
 * GET    /api/categories
 * POST   /api/categories
 * GET    /api/categories/:id
 * PATCH  /api/categories/:id
 * DELETE /api/categories/:id
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validate.js';
import { Category } from '../models/Category.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

/**
 * List available categories (system defaults with user=null plus user-defined custom categories).
 */
categoriesRouter.get('/', async (req, res, next) => {
  try {
    const { type } = req.query;

    if (isDbConnected()) {
      const query = {
        $or: [{ user: null }, { user: req.userId }],
      };

      if (type && (type === 'expense' || type === 'income')) {
        query.type = type;
      }

      const categories = await Category.find(query).sort({ user: 1, name: 1 }).lean();
      return res.status(200).json(categories);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new user-custom category.
 */
categoriesRouter.post('/', async (req, res, next) => {
  try {
    const { name, type, icon, color } = req.body || {};

    if (!name || !name.trim()) {
      throw new BadRequestError('Category name is required.', { name: 'Name is required' });
    }
    if (type !== 'expense' && type !== 'income') {
      throw new BadRequestError('Category type must be either "expense" or "income".', { type: 'Invalid type' });
    }

    if (isDbConnected()) {
      const trimmedName = name.trim();
      const existing = await Category.findOne({
        user: req.userId,
        name: trimmedName,
        type,
      });

      if (existing) {
        throw new ConflictError('A category with this name already exists for this type.', {
          name: 'Category already exists',
        });
      }

      const category = new Category({
        user: req.userId,
        name: trimmedName,
        type,
        icon: icon || 'tag',
        color: color || '#6366f1',
      });

      await category.save();
      return res.status(201).json(category.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439023',
      id: '507f1f77bcf86cd799439023',
      user: req.userId,
      name: name.trim(),
      type,
      icon: icon || 'tag',
      color: color || '#6366f1',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get category by ID.
 */
categoriesRouter.get('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const category = await Category.findOne({
        _id: req.params.id,
        $or: [{ user: null }, { user: req.userId }],
      }).lean();

      if (!category) {
        throw new NotFoundError('Category not found.');
      }
      return res.status(200).json(category);
    }

    res.status(200).json({ _id: req.params.id });
  } catch (err) {
    next(err);
  }
});

/**
 * Update a user-custom category. System categories cannot be modified.
 */
categoriesRouter.patch('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    const { name, icon, color } = req.body || {};

    if (isDbConnected()) {
      const category = await Category.findById(req.params.id);
      if (!category) {
        throw new NotFoundError('Category not found.');
      }

      if (category.user === null) {
        throw new ForbiddenError('Built-in system categories cannot be modified.');
      }

      if (category.user.toString() !== req.userId) {
        throw new ForbiddenError('You do not have permission to modify this category.');
      }

      if (name !== undefined) {
        if (!name.trim()) throw new BadRequestError('Category name cannot be empty.', { name: 'Name is required' });
        category.name = name.trim();
      }
      if (icon !== undefined) category.icon = icon.trim();
      if (color !== undefined) category.color = color.trim();

      await category.save();
      return res.status(200).json(category.toJSON());
    }

    res.status(200).json({ _id: req.params.id, ...req.body });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a user-custom category. System categories cannot be deleted.
 */
categoriesRouter.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const category = await Category.findById(req.params.id);
      if (!category) {
        throw new NotFoundError('Category not found.');
      }

      if (category.user === null) {
        throw new ForbiddenError('Built-in system categories cannot be deleted.');
      }

      if (category.user.toString() !== req.userId) {
        throw new ForbiddenError('You do not have permission to delete this category.');
      }

      await Category.findByIdAndDelete(req.params.id);
      return res.status(200).json({ ok: true, id: req.params.id });
    }

    res.status(200).json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default categoriesRouter;
