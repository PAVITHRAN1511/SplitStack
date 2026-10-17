/**
 * SplitStack Budget Model (Review 3, Step P10).
 * Stores monthly overall and category-specific budget limits in integer paise.
 */

import mongoose from 'mongoose';
import { positiveIntegerPaise } from './validators.js';

const budgetSchema = new mongoose.Schema(
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
      default: null, // null denotes overall monthly spending limit
      index: true,
    },
    month: {
      type: Number,
      required: [true, 'Budget month is required'],
      min: [1, 'Month must be between 1 and 12'],
      max: [12, 'Month must be between 1 and 12'],
    },
    year: {
      type: Number,
      required: [true, 'Budget year is required'],
      min: [2000, 'Year must be 2000 or later'],
      max: [2100, 'Year must be 2100 or earlier'],
    },
    limit: {
      type: Number,
      required: [true, 'Budget limit is required'],
      validate: positiveIntegerPaise,
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

// Unique constraint: one budget per user+category+month+year combination
budgetSchema.index({ user: 1, category: 1, month: 1, year: 1 }, { unique: true });

export const Budget = mongoose.model('Budget', budgetSchema);
export default Budget;
