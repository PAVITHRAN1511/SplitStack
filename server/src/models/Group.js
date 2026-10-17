/**
 * SplitStack Group Model (Review 3, Step P10).
 * Stores collaborative expense-sharing groups with embedded member rosters.
 */

import mongoose from 'mongoose';

const groupMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member user is required'],
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'member'],
        message: 'Member role must be either "admin" or "member"',
      },
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      maxlength: [100, 'Group name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Group creator is required'],
    },
    members: {
      type: [groupMemberSchema],
      validate: {
        validator: (members) => Array.isArray(members) && members.length > 0,
        message: 'A group must have at least one member',
      },
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

groupSchema.index({ 'members.user': 1 });

export const Group = mongoose.model('Group', groupSchema);
export default Group;
