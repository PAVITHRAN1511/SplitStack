/**
 * SplitStack Recurring Payment Model (Review 3, Step P10).
 * Stores scheduled subscriptions and recurring bills with frequency and next due date.
 */

import mongoose from 'mongoose';
import { positiveIntegerPaise } from './validators.js';

const recurringSchema = new mongoose.Schema(
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
    },
    name: {
      type: String,
      required: [true, 'Payment name is required'],
      trim: true,
      maxlength: [150, 'Name cannot exceed 150 characters'],
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      validate: positiveIntegerPaise,
    },
    frequency: {
      type: String,
      required: [true, 'Payment frequency is required'],
      enum: {
        values: ['daily', 'weekly', 'monthly', 'yearly'],
        message: '{VALUE} is not a valid recurring frequency',
      },
      default: 'monthly',
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    nextDueDate: {
      type: Date,
      required: [true, 'Next due date is required'],
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
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

export const Recurring = mongoose.model('Recurring', recurringSchema);
export default Recurring;
