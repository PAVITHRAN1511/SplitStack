/**
 * SplitStack Shopping Lists & Itemized Checklist REST API (Review 3, Step P11).
 * Supports collaborative and personal checklists, item purchasing, price tracking,
 * and duplicate-safe conversion to personal or group shared expenses.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId, assertNonNegativePaise, isValidObjectId } from '../middleware/validate.js';
import { ShoppingList } from '../models/ShoppingList.js';
import { Group } from '../models/Group.js';
import { Expense } from '../models/Expense.js';
import { SharedExpense } from '../models/SharedExpense.js';
import { Category } from '../models/Category.js';
import { calculateEqualSplit } from '../utils/domain.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const shoppingRouter = Router();

shoppingRouter.use(requireAuth);

/**
 * Helper to retrieve a shopping list and verify read/write permission.
 * Accessible if caller is the owner OR caller is a member of the linked group.
 * @param {string} listId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function requireAccessibleShoppingList(listId, userId) {
  if (!isValidObjectId(listId)) {
    throw new BadRequestError('Invalid shopping list ID format.');
  }

  const list = await ShoppingList.findById(listId).populate('items.assignedTo', 'name email');
  if (!list) {
    throw new NotFoundError('Shopping list not found.');
  }

  if (list.owner.toString() === userId) {
    return list;
  }

  if (list.group) {
    const group = await Group.findById(list.group);
    if (group && group.members.some((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()) === userId)) {
      return list;
    }
  }

  throw new NotFoundError('Shopping list not found.');
}

/**
 * List shopping lists accessible to the user (personal lists + group lists where user is a member).
 */
shoppingRouter.get('/', async (req, res, next) => {
  try {
    const { groupId } = req.query;

    if (isDbConnected()) {
      // Find all groups user belongs to
      const userGroups = await Group.find({ 'members.user': req.userId }).select('_id').lean();
      const userGroupIds = userGroups.map((g) => g._id);

      const query = {
        $or: [{ owner: req.userId }, { group: { $in: userGroupIds } }],
      };

      if (groupId) {
        if (!isValidObjectId(groupId)) {
          throw new BadRequestError('Invalid groupId format.');
        }
        query.group = groupId;
      }

      const lists = await ShoppingList.find(query)
        .populate('owner', 'name email')
        .populate('group', 'name')
        .sort({ updatedAt: -1 })
        .lean();

      return res.status(200).json(lists);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new shopping list.
 */
shoppingRouter.post('/', async (req, res, next) => {
  try {
    const { name, budget = 0, groupId = null, items = [] } = req.body || {};

    if (!name || !name.trim()) {
      throw new BadRequestError('List name is required.', { name: 'Name is required' });
    }
    assertNonNegativePaise(budget, 'budget');

    if (isDbConnected()) {
      let resolvedGroupId = null;
      if (groupId && groupId !== 'null') {
        if (!isValidObjectId(groupId)) {
          throw new BadRequestError('Invalid group ID format.');
        }
        const group = await Group.findById(groupId);
        if (!group || !group.members.some((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()) === req.userId)) {
          throw new ForbiddenError('You are not a member of the specified group.');
        }
        resolvedGroupId = group._id;
      }

      const formattedItems = (items || []).map((it) => ({
        name: it.name?.trim() || 'Item',
        quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
        estimatedPrice: Math.max(0, parseInt(it.estimatedPrice, 10) || 0),
        actualPrice: it.actualPrice !== null && it.actualPrice !== undefined ? Math.max(0, parseInt(it.actualPrice, 10) || 0) : null,
        purchased: Boolean(it.purchased),
        assignedTo: it.assignedTo && isValidObjectId(it.assignedTo) ? it.assignedTo : null,
      }));

      const list = new ShoppingList({
        owner: req.userId,
        group: resolvedGroupId,
        name: name.trim(),
        budget,
        items: formattedItems,
      });

      await list.save();
      return res.status(201).json(list.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439029',
      owner: req.userId,
      name: name.trim(),
      budget,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get shopping list detail by ID.
 */
shoppingRouter.get('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const list = await requireAccessibleShoppingList(req.params.id, req.userId);
      return res.status(200).json(list.toJSON());
    }

    res.status(200).json({ _id: req.params.id });
  } catch (err) {
    next(err);
  }
});

/**
 * Update shopping list metadata.
 */
shoppingRouter.patch('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    const { name, budget, groupId } = req.body || {};

    if (budget !== undefined) {
      assertNonNegativePaise(budget, 'budget');
    }

    if (isDbConnected()) {
      const list = await requireAccessibleShoppingList(req.params.id, req.userId);

      if (name !== undefined) {
        if (!name.trim()) throw new BadRequestError('List name cannot be empty.', { name: 'Name is required' });
        list.name = name.trim();
      }
      if (budget !== undefined) list.budget = budget;
      if (groupId !== undefined) {
        if (groupId && groupId !== 'null') {
          if (!isValidObjectId(groupId)) throw new BadRequestError('Invalid groupId format.');
          list.group = groupId;
        } else {
          list.group = null;
        }
      }

      await list.save();
      return res.status(200).json(list.toJSON());
    }

    res.status(200).json({ _id: req.params.id, ...req.body });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a shopping list (Owner only).
 */
shoppingRouter.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const list = await ShoppingList.findById(req.params.id);
      if (!list) {
        throw new NotFoundError('Shopping list not found.');
      }

      if (list.owner.toString() !== req.userId) {
        throw new ForbiddenError('Only the list owner can delete this shopping list.');
      }

      await ShoppingList.findByIdAndDelete(req.params.id);
      return res.status(200).json({ ok: true, id: req.params.id });
    }

    res.status(200).json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

/**
 * Add an item to a shopping list.
 */
shoppingRouter.post('/:id/items', validateObjectId('id'), async (req, res, next) => {
  try {
    const { name, quantity = 1, estimatedPrice = 0, actualPrice = null, assignedTo = null } = req.body || {};

    if (!name || !name.trim()) {
      throw new BadRequestError('Item name is required.', { name: 'Name is required' });
    }

    if (isDbConnected()) {
      const list = await requireAccessibleShoppingList(req.params.id, req.userId);

      const newItem = {
        name: name.trim(),
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        estimatedPrice: Math.max(0, parseInt(estimatedPrice, 10) || 0),
        actualPrice: actualPrice !== null && actualPrice !== undefined ? Math.max(0, parseInt(actualPrice, 10) || 0) : null,
        purchased: false,
        assignedTo: assignedTo && isValidObjectId(assignedTo) ? assignedTo : null,
      };

      list.items.push(newItem);
      await list.save();

      const added = list.items[list.items.length - 1];
      return res.status(201).json(added);
    }

    res.status(201).json({ name: name.trim(), quantity, estimatedPrice });
  } catch (err) {
    next(err);
  }
});

/**
 * Toggle the purchased state of a shopping item.
 */
shoppingRouter.patch('/:id/items/:itemId/toggle', validateObjectId(['id', 'itemId']), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const list = await requireAccessibleShoppingList(req.params.id, req.userId);
      const item = list.items.id(req.params.itemId);

      if (!item) {
        throw new NotFoundError('Item not found in shopping list.');
      }

      item.purchased = !item.purchased;
      if (item.purchased && item.actualPrice === null) {
        item.actualPrice = item.estimatedPrice;
      }

      await list.save();
      return res.status(200).json(item);
    }

    res.status(200).json({ _id: req.params.itemId, purchased: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Update an individual item in a shopping list.
 */
shoppingRouter.patch('/:id/items/:itemId', validateObjectId(['id', 'itemId']), async (req, res, next) => {
  try {
    const { name, quantity, estimatedPrice, actualPrice, purchased, assignedTo } = req.body || {};

    if (isDbConnected()) {
      const list = await requireAccessibleShoppingList(req.params.id, req.userId);
      const item = list.items.id(req.params.itemId);

      if (!item) {
        throw new NotFoundError('Item not found in shopping list.');
      }

      if (name !== undefined) {
        if (!name.trim()) throw new BadRequestError('Item name cannot be empty.');
        item.name = name.trim();
      }
      if (quantity !== undefined) item.quantity = Math.max(1, parseInt(quantity, 10) || 1);
      if (estimatedPrice !== undefined) item.estimatedPrice = Math.max(0, parseInt(estimatedPrice, 10) || 0);
      if (actualPrice !== undefined) {
        item.actualPrice = actualPrice !== null ? Math.max(0, parseInt(actualPrice, 10) || 0) : null;
      }
      if (purchased !== undefined) item.purchased = Boolean(purchased);
      if (assignedTo !== undefined) {
        item.assignedTo = assignedTo && isValidObjectId(assignedTo) ? assignedTo : null;
      }

      await list.save();
      return res.status(200).json(item);
    }

    res.status(200).json({ _id: req.params.itemId, ...req.body });
  } catch (err) {
    next(err);
  }
});

/**
 * Remove an item from a shopping list.
 */
shoppingRouter.delete('/:id/items/:itemId', validateObjectId(['id', 'itemId']), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const list = await requireAccessibleShoppingList(req.params.id, req.userId);
      const item = list.items.id(req.params.itemId);

      if (!item) {
        throw new NotFoundError('Item not found in shopping list.');
      }

      list.items.pull(req.params.itemId);
      await list.save();
      return res.status(200).json({ ok: true, id: req.params.itemId });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Convert a completed shopping list into a personal or group shared expense.
 * Enforces duplicate protection: rejects second conversion attempt with 409 Conflict.
 */
shoppingRouter.post('/:id/convert-expense', validateObjectId('id'), async (req, res, next) => {
  try {
    const { categoryId, category, paymentMethod = 'Card' } = req.body || {};
    const catId = categoryId || category;

    if (isDbConnected()) {
      const list = await requireAccessibleShoppingList(req.params.id, req.userId);

      if (list.convertedExpense) {
        throw new ConflictError('Shopping list has already been converted to an expense.');
      }

      // Calculate total actual price (or estimated price if actual not recorded)
      const totalAmount = (list.items || []).reduce((sum, it) => {
        const price = it.actualPrice !== null ? it.actualPrice : it.estimatedPrice;
        return sum + price;
      }, 0);

      if (totalAmount <= 0) {
        throw new BadRequestError('Cannot convert an empty or zero-amount shopping list.');
      }

      // Find or default to a category
      let targetCategoryId = catId;
      if (!targetCategoryId || !isValidObjectId(targetCategoryId)) {
        const foodCat = await Category.findOne({
          $or: [{ user: null }, { user: req.userId }],
          name: /Food|Groceries|Shopping/i,
        });
        targetCategoryId = foodCat?._id;
      }

      if (!targetCategoryId) {
        const anyCat = await Category.findOne({ $or: [{ user: null }, { user: req.userId }] });
        targetCategoryId = anyCat?._id;
      }

      if (!targetCategoryId) {
        throw new BadRequestError('No valid category available for expense conversion.');
      }

      let createdRecord;
      if (!list.group) {
        // Convert to personal expense
        const expense = new Expense({
          user: req.userId,
          category: targetCategoryId,
          amount: totalAmount,
          date: new Date(),
          description: `Shopping: ${list.name}`,
          paymentMethod,
          notes: `Converted from shopping list "${list.name}" (${list.items.length} items)`,
        });

        await expense.save();
        list.convertedExpense = expense._id;
        await list.save();
        createdRecord = expense.toJSON();
      } else {
        // Convert to shared group expense split equally among all group members
        const group = await Group.findById(list.group);
        const groupMemberIds = group.members.map((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()));

        const rawShares = calculateEqualSplit({
          amount: totalAmount,
          participants: groupMemberIds,
          payerId: req.userId,
        });

        const shared = new SharedExpense({
          group: list.group,
          title: `Shopping: ${list.name}`,
          amount: totalAmount,
          category: targetCategoryId,
          date: new Date(),
          splitType: 'equal',
          paidBy: req.userId,
          shares: rawShares.map((s) => ({ user: s.userId, amount: s.amount })),
          notes: `Converted from group shopping list "${list.name}" (${list.items.length} items)`,
        });

        await shared.save();
        list.convertedExpense = shared._id;
        await list.save();
        createdRecord = shared.toJSON();
      }

      return res.status(201).json(createdRecord);
    }

    res.status(201).json({ ok: true, amount: 1000 });
  } catch (err) {
    next(err);
  }
});

export default shoppingRouter;
