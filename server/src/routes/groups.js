/**
 * SplitStack Groups, Shared Expenses & Debt Settlements REST API (Review 3, Step P11).
 * Supports collaborative workspace, member role enforcement, share allocation,
 * net balance computation, greedy debt simplification, and settlement recording.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId, assertPositivePaise, isValidObjectId } from '../middleware/validate.js';
import { Group } from '../models/Group.js';
import { User } from '../models/User.js';
import { SharedExpense } from '../models/SharedExpense.js';
import { Settlement } from '../models/Settlement.js';
import { Category } from '../models/Category.js';
import {
  calculateEqualSplit,
  validateCustomShares,
  calculateNetBalances,
  simplifyDebts,
} from '../utils/domain.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

/**
 * Helper to ensure the current authenticated user is a member of the group.
 * @param {string} groupId
 * @param {string} userId
 * @returns {Promise<Object>} Group document
 */
async function requireGroupMembership(groupId, userId) {
  if (!isValidObjectId(groupId)) {
    throw new BadRequestError('Invalid group ID format.');
  }

  const group = await Group.findById(groupId).populate('members.user', 'name email avatarColor initials');
  if (!group) {
    throw new NotFoundError('Group not found.');
  }

  const isMember = group.members.some((m) => {
    const mId = m.user?._id ? m.user._id.toString() : m.user.toString();
    return mId === userId;
  });

  if (!isMember) {
    throw new NotFoundError('Group not found or you are not a member.');
  }

  return group;
}

// =============================================================================
// GROUP CRUD & ROSTER MANAGEMENT
// =============================================================================

/**
 * List groups where the authenticated user is a member.
 */
groupsRouter.get('/', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const groups = await Group.find({ 'members.user': req.userId })
        .populate('members.user', 'name email avatarColor initials')
        .populate('createdBy', 'name email')
        .sort({ updatedAt: -1 })
        .lean();
      return res.status(200).json(groups);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new group.
 */
groupsRouter.post('/', async (req, res, next) => {
  try {
    const { name, description = '', memberEmails = [] } = req.body || {};

    if (!name || !name.trim()) {
      throw new BadRequestError('Group name is required.', { name: 'Name is required' });
    }

    if (isDbConnected()) {
      const members = [
        {
          user: req.userId,
          role: 'admin',
          joinedAt: new Date(),
        },
      ];

      // Add additional members by email if specified
      if (Array.isArray(memberEmails)) {
        for (const rawEmail of memberEmails) {
          if (!rawEmail || typeof rawEmail !== 'string') continue;
          const norm = rawEmail.trim().toLowerCase();
          if (norm === req.user.email?.toLowerCase()) continue;

          const foundUser = await User.findOne({ email: norm });
          if (foundUser) {
            const alreadyAdded = members.some((m) => m.user.toString() === foundUser._id.toString());
            if (!alreadyAdded) {
              members.push({
                user: foundUser._id,
                role: 'member',
                joinedAt: new Date(),
              });
            }
          }
        }
      }

      const group = new Group({
        name: name.trim(),
        description: description.trim(),
        createdBy: req.userId,
        members,
      });

      await group.save();
      await group.populate('members.user', 'name email avatarColor initials');
      return res.status(201).json(group.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439026',
      name: name.trim(),
      description,
      createdBy: req.userId,
      members: [{ user: req.userId, role: 'admin' }],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get group detail by ID. Caller must be a member.
 */
groupsRouter.get('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);
      return res.status(200).json(group.toJSON());
    }

    res.status(200).json({ _id: req.params.id });
  } catch (err) {
    next(err);
  }
});

/**
 * Add a member to an existing group by email.
 */
groupsRouter.post('/:id/members', validateObjectId('id'), async (req, res, next) => {
  try {
    const { email, role = 'member' } = req.body || {};
    if (!email || !email.includes('@')) {
      throw new BadRequestError('Valid email address is required.', { email: 'Valid email is required' });
    }

    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);
      const norm = email.trim().toLowerCase();

      const targetUser = await User.findOne({ email: norm });
      if (!targetUser) {
        throw new NotFoundError(`No registered user found with email "${norm}".`);
      }

      const isAlreadyMember = group.members.some((m) => {
        const mId = m.user?._id ? m.user._id.toString() : m.user.toString();
        return mId === targetUser._id.toString();
      });

      if (isAlreadyMember) {
        throw new ConflictError('User is already a member of this group.', { email: 'Already a member' });
      }

      group.members.push({
        user: targetUser._id,
        role: role === 'admin' ? 'admin' : 'member',
        joinedAt: new Date(),
      });

      await group.save();
      await group.populate('members.user', 'name email avatarColor initials');
      return res.status(200).json(group.toJSON());
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Remove a member from a group (Admin only).
 */
groupsRouter.delete('/:id/members/:userId', validateObjectId(['id', 'userId']), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);

      const callerMember = group.members.find((m) => {
        const mId = m.user?._id ? m.user._id.toString() : m.user.toString();
        return mId === req.userId;
      });

      if (!callerMember || callerMember.role !== 'admin') {
        throw new ForbiddenError('Admin permissions are required to remove group members.');
      }

      group.members = group.members.filter((m) => {
        const mId = m.user?._id ? m.user._id.toString() : m.user.toString();
        return mId !== req.params.userId;
      });

      await group.save();
      await group.populate('members.user', 'name email avatarColor initials');
      return res.status(200).json(group.toJSON());
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Leave a group. Caller must have a net balance of zero.
 */
groupsRouter.post('/:id/leave', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);

      // Check net balance before permitting departure
      const shared = await SharedExpense.find({ group: group._id }).lean();
      const completedSettlements = await Settlement.find({ group: group._id, status: 'completed' }).lean();

      const memberIds = group.members.map((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()));
      const formattedExpenses = shared.map((e) => ({
        paidBy: e.paidBy.toString(),
        amount: e.amount,
        shares: (e.shares || []).map((s) => ({ userId: s.user.toString(), amount: s.amount })),
      }));
      const formattedSettlements = completedSettlements.map((s) => ({
        payerId: s.payer.toString(),
        payeeId: s.payee.toString(),
        amount: s.amount,
        status: s.status,
      }));

      const { balances } = calculateNetBalances({
        members: memberIds,
        expenses: formattedExpenses,
        settlements: formattedSettlements,
      });

      const userBalance = balances[req.userId] || 0;
      if (userBalance !== 0) {
        throw new BadRequestError(
          `Cannot leave group with an unsettled balance (${userBalance > 0 ? `owed ₹${userBalance / 100}` : `owes ₹${-userBalance / 100}`}). Please settle debts first.`
        );
      }

      // Check if sole admin
      const admins = group.members.filter((m) => m.role === 'admin');
      const isCallerAdmin = admins.some((m) => {
        const mId = m.user?._id ? m.user._id.toString() : m.user.toString();
        return mId === req.userId;
      });

      if (isCallerAdmin && admins.length === 1 && group.members.length > 1) {
        throw new BadRequestError('As the sole admin, you must promote another member to admin before leaving.');
      }

      group.members = group.members.filter((m) => {
        const mId = m.user?._id ? m.user._id.toString() : m.user.toString();
        return mId !== req.userId;
      });

      await group.save();
      return res.status(200).json({ ok: true, message: 'You have left the group.' });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// BALANCES & DEBT SIMPLIFICATION
// =============================================================================

/**
 * Compute net member balances for a group.
 */
groupsRouter.get('/:id/balances', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);
      const shared = await SharedExpense.find({ group: group._id }).lean();
      const completedSettlements = await Settlement.find({ group: group._id, status: 'completed' }).lean();

      const memberIds = group.members.map((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()));
      const formattedExpenses = shared.map((e) => ({
        paidBy: e.paidBy.toString(),
        amount: e.amount,
        shares: (e.shares || []).map((s) => ({ userId: s.user.toString(), amount: s.amount })),
      }));
      const formattedSettlements = completedSettlements.map((s) => ({
        payerId: s.payer.toString(),
        payeeId: s.payee.toString(),
        amount: s.amount,
        status: s.status,
      }));

      const { balances } = calculateNetBalances({
        members: memberIds,
        expenses: formattedExpenses,
        settlements: formattedSettlements,
      });

      return res.status(200).json(balances);
    }

    res.status(200).json({});
  } catch (err) {
    next(err);
  }
});

/**
 * Compute comprehensive member statistics (paid, share, net).
 */
groupsRouter.get('/:id/member-stats', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);
      const shared = await SharedExpense.find({ group: group._id }).lean();
      const completedSettlements = await Settlement.find({ group: group._id, status: 'completed' }).lean();

      const memberIds = group.members.map((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()));
      const formattedExpenses = shared.map((e) => ({
        paidBy: e.paidBy.toString(),
        amount: e.amount,
        shares: (e.shares || []).map((s) => ({ userId: s.user.toString(), amount: s.amount })),
      }));
      const formattedSettlements = completedSettlements.map((s) => ({
        payerId: s.payer.toString(),
        payeeId: s.payee.toString(),
        amount: s.amount,
        status: s.status,
      }));

      const stats = calculateNetBalances({
        members: memberIds,
        expenses: formattedExpenses,
        settlements: formattedSettlements,
      });

      return res.status(200).json(stats);
    }

    res.status(200).json({ balances: {}, memberStats: {}, netSum: 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * Get greedy minimum-cash-flow suggested settlement plan.
 */
groupsRouter.get('/:id/suggested-settlements', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);
      const shared = await SharedExpense.find({ group: group._id }).lean();
      const completedSettlements = await Settlement.find({ group: group._id, status: 'completed' }).lean();

      const memberList = group.members.map((m) => ({
        userId: m.user?._id ? m.user._id.toString() : m.user.toString(),
        name: m.user?.name || 'Member',
      }));

      const formattedExpenses = shared.map((e) => ({
        paidBy: e.paidBy.toString(),
        amount: e.amount,
        shares: (e.shares || []).map((s) => ({ userId: s.user.toString(), amount: s.amount })),
      }));
      const formattedSettlements = completedSettlements.map((s) => ({
        payerId: s.payer.toString(),
        payeeId: s.payee.toString(),
        amount: s.amount,
        status: s.status,
      }));

      const { balances } = calculateNetBalances({
        members: memberList.map((m) => m.userId),
        expenses: formattedExpenses,
        settlements: formattedSettlements,
      });

      const plan = simplifyDebts(memberList, balances);
      return res.status(200).json(plan);
    }

    res.status(200).json({ transfers: [], pairwiseDebtsCount: 0, optimizedCount: 0, savedPercent: 0 });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// SETTLEMENTS
// =============================================================================

/**
 * List settlements recorded for a group.
 */
groupsRouter.get('/:id/settlements', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);
      const settlements = await Settlement.find({ group: group._id })
        .populate('payer', 'name email avatarColor initials')
        .populate('payee', 'name email avatarColor initials')
        .sort({ completedAt: -1 })
        .lean();
      return res.status(200).json(settlements);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Record a settlement transaction with debt limit validation.
 */
groupsRouter.post('/:id/settlements', validateObjectId('id'), async (req, res, next) => {
  try {
    const { payerId, payeeId, amount } = req.body || {};

    if (!payerId || !payeeId) {
      throw new BadRequestError('Payer and payee are required.', { payerId: 'Required', payeeId: 'Required' });
    }
    if (payerId === payeeId) {
      throw new BadRequestError('Payer and payee cannot be the same member.', { payeeId: 'Cannot match payer' });
    }
    assertPositivePaise(amount, 'amount');

    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);

      const memberIds = group.members.map((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()));
      if (!memberIds.includes(payerId) || !memberIds.includes(payeeId)) {
        throw new BadRequestError('Payer and payee must both be members of this group.');
      }

      // Calculate current net balances
      const shared = await SharedExpense.find({ group: group._id }).lean();
      const completedSettlements = await Settlement.find({ group: group._id, status: 'completed' }).lean();

      const formattedExpenses = shared.map((e) => ({
        paidBy: e.paidBy.toString(),
        amount: e.amount,
        shares: (e.shares || []).map((s) => ({ userId: s.user.toString(), amount: s.amount })),
      }));
      const formattedSettlements = completedSettlements.map((s) => ({
        payerId: s.payer.toString(),
        payeeId: s.payee.toString(),
        amount: s.amount,
        status: s.status,
      }));

      const { balances } = calculateNetBalances({
        members: memberIds,
        expenses: formattedExpenses,
        settlements: formattedSettlements,
      });

      const payerNet = balances[payerId] ?? 0;
      const payeeNet = balances[payeeId] ?? 0;

      if (payerNet >= 0) {
        throw new BadRequestError('Payer does not have an outstanding debt in this group.');
      }
      if (payeeNet <= 0) {
        throw new BadRequestError('Payee is not owed money in this group.');
      }

      const maxAllowable = Math.min(-payerNet, payeeNet);
      if (amount > maxAllowable) {
        throw new BadRequestError(
          `Settlement amount (${amount} paise) exceeds maximum allowable debt transfer (${maxAllowable} paise).`
        );
      }

      const settlement = new Settlement({
        group: group._id,
        payer: payerId,
        payee: payeeId,
        amount,
        status: 'completed',
        completedAt: new Date(),
      });

      await settlement.save();
      await settlement.populate('payer', 'name email avatarColor initials');
      await settlement.populate('payee', 'name email avatarColor initials');
      return res.status(201).json(settlement.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439027',
      group: req.params.id,
      payer: payerId,
      payee: payeeId,
      amount,
      status: 'completed',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Remove a recorded settlement.
 */
groupsRouter.delete('/:id/settlements/:settlementId', validateObjectId(['id', 'settlementId']), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      await requireGroupMembership(req.params.id, req.userId);
      const settlement = await Settlement.findOneAndDelete({
        _id: req.params.settlementId,
        group: req.params.id,
      });

      if (!settlement) {
        throw new NotFoundError('Settlement not found.');
      }
      return res.status(200).json({ ok: true, id: req.params.settlementId });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// SHARED EXPENSES
// =============================================================================

/**
 * List shared expenses for a group.
 */
groupsRouter.get('/:id/expenses', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);
      const expenses = await SharedExpense.find({ group: group._id })
        .populate('paidBy', 'name email avatarColor initials')
        .populate('category', 'name type icon color')
        .populate('shares.user', 'name email avatarColor initials')
        .sort({ date: -1, createdAt: -1 })
        .lean();
      return res.status(200).json(expenses);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Create a shared expense within a group.
 */
groupsRouter.post('/:id/expenses', validateObjectId('id'), async (req, res, next) => {
  try {
    const { title, amount, categoryId, category, date, splitType = 'equal', shares = [], paidBy, notes } = req.body || {};
    const catId = categoryId || category;

    if (!title || !title.trim()) {
      throw new BadRequestError('Expense title is required.', { title: 'Title is required' });
    }
    assertPositivePaise(amount, 'amount');
    if (!catId) {
      throw new BadRequestError('Category is required.', { categoryId: 'Category is required' });
    }

    if (isDbConnected()) {
      const group = await requireGroupMembership(req.params.id, req.userId);

      const payerId = paidBy || req.userId;
      const groupMemberIds = group.members.map((m) => (m.user?._id ? m.user._id.toString() : m.user.toString()));

      if (!groupMemberIds.includes(payerId)) {
        throw new BadRequestError('Payer must be an active member of this group.', { paidBy: 'Not a member' });
      }

      if (!isValidObjectId(catId)) {
        throw new BadRequestError('Invalid category ID format.');
      }

      let computedShares;
      if (splitType === 'equal') {
        const participantIds = Array.isArray(shares) && shares.length > 0
          ? shares.map((s) => (typeof s === 'string' ? s.trim() : s.userId?.trim() || s.user?.trim()))
          : groupMemberIds;

        for (const pId of participantIds) {
          if (!groupMemberIds.includes(pId)) {
            throw new BadRequestError(`Participant "${pId}" is not a member of this group.`);
          }
        }

        const rawShares = calculateEqualSplit({
          amount,
          participants: participantIds,
          payerId,
        });

        computedShares = rawShares.map((s) => ({
          user: s.userId,
          amount: s.amount,
        }));
      } else if (splitType === 'custom') {
        const formattedShares = (shares || []).map((s) => ({
          userId: s.userId || s.user,
          amount: s.amount,
        }));

        const customResult = validateCustomShares({
          amount,
          shares: formattedShares,
          allowedMemberIds: groupMemberIds,
        });

        if (!customResult.isValid) {
          throw new BadRequestError(customResult.error, { shares: customResult.error });
        }

        computedShares = formattedShares.map((s) => ({
          user: s.userId,
          amount: s.amount,
        }));
      } else {
        throw new BadRequestError(`Unsupported split type: "${splitType}". Must be "equal" or "custom".`);
      }

      const sharedExpense = new SharedExpense({
        group: group._id,
        title: title.trim(),
        amount,
        category: catId,
        date: date ? new Date(date) : new Date(),
        splitType,
        paidBy: payerId,
        shares: computedShares,
        notes: (notes || '').trim(),
      });

      await sharedExpense.save();
      await sharedExpense.populate('paidBy', 'name email avatarColor initials');
      await sharedExpense.populate('category', 'name type icon color');
      return res.status(201).json(sharedExpense.toJSON());
    }

    res.status(201).json({
      _id: '507f1f77bcf86cd799439028',
      group: req.params.id,
      title: title.trim(),
      amount,
      splitType,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a shared expense from a group.
 */
groupsRouter.delete('/:id/expenses/:expenseId', validateObjectId(['id', 'expenseId']), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      await requireGroupMembership(req.params.id, req.userId);
      const result = await SharedExpense.findOneAndDelete({
        _id: req.params.expenseId,
        group: req.params.id,
      });

      if (!result) {
        throw new NotFoundError('Shared expense not found.');
      }
      return res.status(200).json({ ok: true, id: req.params.expenseId });
    }

    res.status(200).json({ ok: true, id: req.params.expenseId });
  } catch (err) {
    next(err);
  }
});

export default groupsRouter;
