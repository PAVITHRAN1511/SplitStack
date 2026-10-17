/**
 * SplitStack Receipts Metadata REST API (Review 3, Step P11).
 * GET /api/receipts
 * GET /api/receipts/:id
 * (Binary upload and OCR parsing engine deferred to Step P12).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validate.js';
import { Receipt } from '../models/Receipt.js';
import { NotFoundError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const receiptsRouter = Router();

receiptsRouter.use(requireAuth);

/**
 * List receipts uploaded by the authenticated user.
 */
receiptsRouter.get('/', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const receipts = await Receipt.find({ user: req.userId })
        .sort({ date: -1, createdAt: -1 })
        .lean();
      return res.status(200).json(receipts);
    }

    res.status(200).json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * Get receipt metadata by ID.
 * Strict ownership check: only owner can retrieve.
 */
receiptsRouter.get('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const receipt = await Receipt.findOne({ _id: req.params.id, user: req.userId }).lean();
      if (!receipt) {
        throw new NotFoundError('Receipt not found.');
      }
      return res.status(200).json(receipt);
    }

    res.status(200).json({ _id: req.params.id, user: req.userId });
  } catch (err) {
    next(err);
  }
});

export default receiptsRouter;
