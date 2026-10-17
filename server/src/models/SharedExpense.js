/**
 * SplitStack SharedExpense Model (Review 3, Step P10).
 * Stores group expenses with itemized member shares in integer paise.
 */

import mongoose from 'mongoose';
import { positiveIntegerPaise, nonNegativeIntegerPaise } from './validators.js';

const expenseShareSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Share user is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Share amount is required'],
      validate: nonNegativeIntegerPaise,
    },
  },
  { _id: false }
);

const sharedExpenseSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: [true, 'Group is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Expense title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    amount: {
      type: Number,
      required: [true, 'Expense total amount is required'],
      validate: positiveIntegerPaise,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payer user is required'],
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    date: {
      type: Date,
      required: [true, 'Expense date is required'],
      default: Date.now,
      index: true,
    },
    splitType: {
      type: String,
      enum: {
        values: ['equal', 'custom'],
        message: 'Split type must be either "equal" or "custom"',
      },
      default: 'equal',
    },
    shares: {
      type: [expenseShareSchema],
      validate: [
        {
          validator: (shares) => Array.isArray(shares) && shares.length > 0,
          message: 'A shared expense must have at least one participant share',
        },
        {
          validator(shares) {
            if (!Array.isArray(shares) || shares.length === 0) return true;
            const sumShares = shares.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
            return sumShares === this.amount;
          },
          message: 'The sum of participant shares ({VALUE}) must exactly equal the total expense amount',
        },
      ],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
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

sharedExpenseSchema.index({ group: 1, date: -1 });

export const SharedExpense = mongoose.model('SharedExpense', sharedExpenseSchema);
export default SharedExpense;
