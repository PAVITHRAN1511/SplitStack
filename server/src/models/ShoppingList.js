/**
 * SplitStack ShoppingList Model (Review 3, Step P10).
 * Stores collaborative shopping lists with itemized checklist subdocuments.
 */

import mongoose from 'mongoose';
import { nonNegativeIntegerPaise } from './validators.js';

const shoppingItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [150, 'Item name cannot exceed 150 characters'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      default: 1,
    },
    estimatedPrice: {
      type: Number,
      default: 0,
      validate: nonNegativeIntegerPaise,
    },
    actualPrice: {
      type: Number,
      default: null,
      validate: nonNegativeIntegerPaise,
    },
    purchased: {
      type: Boolean,
      default: false,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

const shoppingListSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner is required'],
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      default: null, // null denotes personal shopping list
      index: true,
    },
    name: {
      type: String,
      required: [true, 'List name is required'],
      trim: true,
      maxlength: [150, 'List name cannot exceed 150 characters'],
    },
    budget: {
      type: Number,
      default: 0,
      validate: nonNegativeIntegerPaise,
    },
    convertedExpense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      default: null,
    },
    items: {
      type: [shoppingItemSchema],
      default: [],
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

shoppingListSchema.index({ owner: 1, createdAt: -1 });

export const ShoppingList = mongoose.model('ShoppingList', shoppingListSchema);
export default ShoppingList;
