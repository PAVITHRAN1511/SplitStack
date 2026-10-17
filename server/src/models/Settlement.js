/**
 * SplitStack Settlement Model (Review 3, Step P10).
 * Stores direct debt settlement transactions between group members in integer paise.
 */

import mongoose from 'mongoose';
import { positiveIntegerPaise } from './validators.js';

const settlementSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: [true, 'Group is required'],
      index: true,
    },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payer is required'],
      index: true,
    },
    payee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payee is required'],
      validate: {
        validator(val) {
          if (!this.payer || !val) return true;
          return this.payer.toString() !== val.toString();
        },
        message: 'Payer and payee cannot be the same user',
      },
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Settlement amount is required'],
      validate: positiveIntegerPaise,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'completed'],
        message: 'Status must be either "pending" or "completed"',
      },
      default: 'completed',
      index: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
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

settlementSchema.index({ group: 1, completedAt: -1 });

export const Settlement = mongoose.model('Settlement', settlementSchema);
export default Settlement;
