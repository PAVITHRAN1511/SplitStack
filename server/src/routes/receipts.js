import mongoose from 'mongoose';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { handleReceiptUpload } from '../middleware/upload.js';
import { validateObjectId, assertPositivePaise, isValidObjectId } from '../middleware/validate.js';
import { Receipt } from '../models/Receipt.js';
import { Expense } from '../models/Expense.js';
import { Category } from '../models/Category.js';
import { storeReceiptImage, getReceiptImageStream, deleteReceiptImage } from '../services/storageService.js';
import { processReceiptOcr } from '../services/ocrService.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const receiptsRouter = Router();

// In-memory store for offline/unit-test mode when MongoDB is not connected
export const mockReceiptsStore = new Map();

export function resetMockReceipts() {
  mockReceiptsStore.clear();
}

receiptsRouter.use(requireAuth);

/**
 * Common handler for multipart receipt upload and server-side OCR processing.
 */
async function handleUploadFlow(req, res, next) {
  let storedFileKey = null;

  try {
    const file = req.file;
    if (!file) {
      throw new BadRequestError('No receipt file uploaded. Please select an image.');
    }

    // 1. Store image into GridFS / storage service with server-controlled unique key
    const stored = await storeReceiptImage({
      buffer: file.buffer,
      mimeType: file.verifiedMimeType,
      userId: req.userId,
      ext: file.verifiedExt,
    });
    storedFileKey = stored.fileReference;

    // 2. Perform server-side OCR and candidate extraction
    // Support test mock/bypass options via form body or safe headers
    const mockText =
      req.body?.mockOcrText ||
      (req.headers['x-mock-ocr-base64']
        ? Buffer.from(req.headers['x-mock-ocr-base64'], 'base64').toString('utf8')
        : req.headers['x-mock-ocr-text']);
    const bypassOcr =
      req.body?.bypassOcr === 'true' ||
      req.body?.bypassOcr === true ||
      req.headers['x-bypass-ocr'] === 'true';

    const ocrResult = await processReceiptOcr(file.buffer, {
      mockText,
      bypassOcr,
    });

    if (isDbConnected()) {
      const receipt = new Receipt({
        user: req.userId,
        merchant: ocrResult.merchant || 'Unrecognized Merchant',
        date: ocrResult.date ? new Date(ocrResult.date) : new Date(),
        amount: ocrResult.amountPaise || 0,
        rawText: ocrResult.rawText || '',
        confidence: ocrResult.confidence || 0,
        status: 'pending',
        fileReference: storedFileKey,
        mimeType: file.verifiedMimeType,
        fileSizeBytes: file.size,
        originalName: file.originalname,
      });

      // Generate self-referencing authorized image URL
      receipt.imageUrl = `/api/receipts/${receipt._id}/image`;
      await receipt.save();

      return res.status(201).json({
        receipt: receipt.toJSON(),
        candidate: {
          merchant: ocrResult.merchant,
          date: ocrResult.date,
          amountPaise: ocrResult.amountPaise,
          rawText: ocrResult.rawText,
          confidence: ocrResult.confidence,
        },
      });
    }

    // In offline / mock test mode
    const receiptId = new mongoose.Types.ObjectId().toString();
    const mockReceipt = {
      _id: receiptId,
      id: receiptId,
      user: req.userId,
      merchant: ocrResult.merchant || 'Unrecognized Merchant',
      date: ocrResult.date ? new Date(ocrResult.date) : new Date(),
      amount: ocrResult.amountPaise || 0,
      rawText: ocrResult.rawText || '',
      confidence: ocrResult.confidence || 0,
      status: 'pending',
      fileReference: storedFileKey,
      mimeType: file.verifiedMimeType,
      fileSizeBytes: file.size,
      originalName: file.originalname || 'receipt.png',
      imageUrl: `/api/receipts/${receiptId}/image`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockReceiptsStore.set(receiptId, mockReceipt);

    return res.status(201).json({
      receipt: mockReceipt,
      candidate: {
        merchant: ocrResult.merchant,
        date: ocrResult.date,
        amountPaise: ocrResult.amountPaise,
        rawText: ocrResult.rawText,
        confidence: ocrResult.confidence,
      },
    });
  } catch (err) {
    // Compensating cleanup: delete stored image on failure to prevent orphan files
    if (storedFileKey) {
      await deleteReceiptImage(storedFileKey).catch(() => {});
    }
    next(err);
  }
}

/**
 * POST /api/receipts/upload - Primary multipart upload endpoint.
 */
receiptsRouter.post('/upload', handleReceiptUpload, handleUploadFlow);

/**
 * POST /api/receipts - Alias for upload endpoint.
 */
receiptsRouter.post('/', handleReceiptUpload, handleUploadFlow);

/**
 * GET /api/receipts - List receipts uploaded by authenticated user.
 */
receiptsRouter.get('/', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const receipts = await Receipt.find({ user: req.userId })
        .sort({ date: -1, createdAt: -1 })
        .lean();
      return res.status(200).json(receipts);
    }

    const userReceipts = Array.from(mockReceiptsStore.values()).filter(
      (r) => String(r.user) === String(req.userId)
    );
    res.status(200).json(userReceipts);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/receipts/:id - Retrieve receipt metadata by ID.
 * Enforces ownership: only owner can retrieve.
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

    const receipt = mockReceiptsStore.get(req.params.id);
    if (!receipt || String(receipt.user) !== String(req.userId)) {
      throw new NotFoundError('Receipt not found.');
    }

    res.status(200).json(receipt);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/receipts/:id/image - Stream authorized receipt image binary.
 * Strict ownership check: only owner can download or stream image.
 */
receiptsRouter.get('/:id/image', validateObjectId('id'), async (req, res, next) => {
  try {
    let fileRef = null;
    let mimeType = 'image/jpeg';

    if (isDbConnected()) {
      const receipt = await Receipt.findOne({ _id: req.params.id, user: req.userId });
      if (!receipt) {
        throw new NotFoundError('Receipt not found.');
      }
      fileRef = receipt.fileReference;
      mimeType = receipt.mimeType || 'image/jpeg';
    } else {
      const receipt = mockReceiptsStore.get(req.params.id);
      if (!receipt || String(receipt.user) !== String(req.userId)) {
        throw new NotFoundError('Receipt not found.');
      }
      fileRef = receipt.fileReference;
      mimeType = receipt.mimeType || 'image/jpeg';
    }

    if (!fileRef) {
      throw new NotFoundError('Receipt image reference not found.');
    }

    const streamData = await getReceiptImageStream(fileRef);
    if (!streamData) {
      throw new NotFoundError('Receipt image binary not found in storage.');
    }

    res.setHeader('Content-Type', streamData.mimeType || mimeType);
    if (streamData.length) {
      res.setHeader('Content-Length', streamData.length);
    }
    // Security headers for image streaming
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');

    streamData.stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/receipts/:id/confirm - Confirm verified receipt data and record an expense.
 * Enforces duplicate protection: rejects confirming an already-confirmed receipt with 409 Conflict.
 */
receiptsRouter.post('/:id/confirm', validateObjectId('id'), async (req, res, next) => {
  try {
    const { description, amount, categoryId, category, date, paymentMethod = 'UPI', notes = '' } = req.body || {};
    const catId = categoryId || category;

    if (!description || !description.trim()) {
      throw new BadRequestError('Expense description is required.', { description: 'Required' });
    }
    assertPositivePaise(amount, 'amount');
    if (!catId) {
      throw new BadRequestError('Category is required.', { categoryId: 'Required' });
    }

    if (isDbConnected()) {
      const receipt = await Receipt.findOne({ _id: req.params.id, user: req.userId });
      if (!receipt) {
        throw new NotFoundError('Receipt not found.');
      }

      if (receipt.status === 'confirmed') {
        throw new ConflictError('Receipt has already been confirmed and recorded as an expense.');
      }

      if (!isValidObjectId(catId)) {
        throw new BadRequestError('Invalid category ID format.');
      }

      const catDoc = await Category.findOne({
        _id: catId,
        $or: [{ user: null }, { user: req.userId }],
      });
      if (!catDoc) {
        throw new BadRequestError('Specified category does not exist.', { categoryId: 'Not found' });
      }

      // 1. Create personal expense linked to this receipt
      const expense = new Expense({
        user: req.userId,
        category: catId,
        amount,
        date: date ? new Date(date) : receipt.date || new Date(),
        description: description.trim(),
        paymentMethod,
        notes: (notes || '').trim(),
        receipt: receipt._id,
      });

      await expense.save();

      // 2. Mark receipt confirmed
      receipt.status = 'confirmed';
      receipt.merchant = description.trim();
      receipt.amount = amount;
      await receipt.save();

      await expense.populate('category', 'name type icon color');
      return res.status(201).json({
        receipt: receipt.toJSON(),
        expense: expense.toJSON(),
      });
    }

    // In offline / mock test mode
    const receipt = mockReceiptsStore.get(req.params.id);
    if (!receipt || String(receipt.user) !== String(req.userId)) {
      throw new NotFoundError('Receipt not found.');
    }

    if (receipt.status === 'confirmed') {
      throw new ConflictError('Receipt has already been confirmed and recorded as an expense.');
    }

    if (!isValidObjectId(catId)) {
      throw new BadRequestError('Invalid category ID format.');
    }

    receipt.status = 'confirmed';
    receipt.merchant = description.trim();
    receipt.amount = amount;
    receipt.updatedAt = new Date();

    const expenseId = new mongoose.Types.ObjectId().toString();
    const mockExpense = {
      _id: expenseId,
      id: expenseId,
      user: req.userId,
      category: catId,
      amount,
      date: date ? new Date(date) : receipt.date || new Date(),
      description: description.trim(),
      paymentMethod,
      notes: (notes || '').trim(),
      receipt: receipt._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return res.status(201).json({
      receipt,
      expense: mockExpense,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/receipts/:id - Delete a receipt and clean up stored image binary.
 */
receiptsRouter.delete('/:id', validateObjectId('id'), async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const receipt = await Receipt.findOne({ _id: req.params.id, user: req.userId });
      if (!receipt) {
        throw new NotFoundError('Receipt not found.');
      }

      // Clean up image from storage
      if (receipt.fileReference) {
        await deleteReceiptImage(receipt.fileReference);
      }

      await Receipt.findByIdAndDelete(req.params.id);
      return res.status(200).json({ ok: true, id: req.params.id });
    }

    const receipt = mockReceiptsStore.get(req.params.id);
    if (!receipt || String(receipt.user) !== String(req.userId)) {
      throw new NotFoundError('Receipt not found.');
    }

    if (receipt.fileReference) {
      await deleteReceiptImage(receipt.fileReference);
    }
    mockReceiptsStore.delete(req.params.id);

    res.status(200).json({ ok: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default receiptsRouter;
