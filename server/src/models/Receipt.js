/**
 * SplitStack Receipt Model (Review 3, Step P10).
 * Stores uploaded receipt metadata, OCR candidate extraction outputs, and confirmation status.
 */

import mongoose from 'mongoose';
import { nonNegativeIntegerPaise } from './validators.js';

const receiptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    merchant: {
      type: String,
      required: [true, 'Merchant name is required'],
      trim: true,
      maxlength: [200, 'Merchant name cannot exceed 200 characters'],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    amount: {
      type: Number,
      default: 0,
      validate: nonNegativeIntegerPaise,
    },
    rawText: {
      type: String,
      default: '',
      trim: true,
    },
    confidence: {
      type: Number,
      min: [0, 'Confidence cannot be less than 0'],
      max: [1, 'Confidence cannot exceed 1'],
      default: 0,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'confirmed', 'discarded'],
        message: '{VALUE} is not a valid receipt status',
      },
      default: 'pending',
      index: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    fileReference: {
      type: String,
      default: '',
    },
    mimeType: {
      type: String,
      default: 'image/png',
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
    },
    originalName: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

receiptSchema.index({ user: 1, createdAt: -1 });

export const Receipt = mongoose.model('Receipt', receiptSchema);
export default Receipt;
