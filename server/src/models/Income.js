/**
 * SplitStack Income Model (Review 3, Step P10).
 * Stores personal earnings and revenue streams with integer paise monetary values.
 */

import mongoose from 'mongoose';
import { positiveIntegerPaise } from './validators.js';

const incomeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Income amount is required'],
      validate: positiveIntegerPaise,
    },
    date: {
      type: Date,
      required: [true, 'Income date is required'],
      default: Date.now,
      index: true,
    },
    source: {
      type: String,
      required: [true, 'Income source is required'],
      trim: true,
      maxlength: [200, 'Source cannot exceed 200 characters'],
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['UPI', 'Card', 'Net banking', 'Cash', 'Other'],
        message: '{VALUE} is not a supported payment method',
      },
      default: 'Net banking',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
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

incomeSchema.index({ user: 1, date: -1 });

export const Income = mongoose.model('Income', incomeSchema);
export default Income;
