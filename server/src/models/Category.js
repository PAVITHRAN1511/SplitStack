/**
 * SplitStack Category Model (Review 3, Step P10).
 * Stores personal and system categories for expense and income classification.
 */

import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null denotes system-wide built-in category
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [50, 'Category name cannot exceed 50 characters'],
    },
    type: {
      type: String,
      required: [true, 'Category type is required'],
      enum: {
        values: ['expense', 'income'],
        message: 'Category type must be either "expense" or "income"',
      },
      index: true,
    },
    icon: {
      type: String,
      required: [true, 'Category icon is required'],
      default: 'ellipsis',
      trim: true,
    },
    color: {
      type: String,
      required: [true, 'Category color is required'],
      default: '#64748b',
      match: [/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Invalid category hex color'],
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

// Prevent a user from having duplicate category names for the same type
categorySchema.index({ user: 1, name: 1, type: 1 }, { unique: true });

export const Category = mongoose.model('Category', categorySchema);
export default Category;
