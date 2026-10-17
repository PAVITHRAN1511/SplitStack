/**
 * SplitStack Insight Model (Review 3, Step P10).
 * Stores deterministic financial alerts, trend notifications, and pending action reminders.
 */

import mongoose from 'mongoose';

const insightSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    kind: {
      type: String,
      required: [true, 'Insight kind is required'],
      enum: {
        values: ['warning', 'info', 'primary', 'success', 'danger'],
        message: '{VALUE} is not a valid insight kind',
      },
      default: 'info',
    },
    message: {
      type: String,
      required: [true, 'Insight message is required'],
      trim: true,
      maxlength: [500, 'Insight message cannot exceed 500 characters'],
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
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

insightSchema.index({ user: 1, createdAt: -1 });

export const Insight = mongoose.model('Insight', insightSchema);
export default Insight;
