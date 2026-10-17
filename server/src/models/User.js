/**
 * SplitStack User Model (Review 3, Step P10).
 * Stores user account credentials, profile metadata, and visual/notification preferences.
 */

import mongoose from 'mongoose';
import { emailValidator } from './validators.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: emailValidator,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    salt: {
      type: String,
      default: '',
    },
    avatarColor: {
      type: String,
      default: '#4f46e5',
      match: [/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Invalid avatar hex color'],
    },
    initials: {
      type: String,
      default: '',
      trim: true,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['dark', 'light', 'system'],
        default: 'dark',
      },
      currency: {
        type: String,
        default: 'INR',
      },
      readNotifications: {
        type: [String],
        default: [],
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.salt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Auto-populate initials from name if not provided
userSchema.pre('save', function () {
  if (this.name && !this.initials) {
    const parts = this.name.trim().split(/\s+/);
    this.initials = parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].substring(0, 2).toUpperCase();
  }
});

export const User = mongoose.model('User', userSchema);
export default User;
