/**
 * SplitStack Authentication Routes (Review 3, Step P11).
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 * PATCH /api/auth/profile
 * POST /api/auth/change-password
 */

import { Router } from 'express';
import { registerUser, loginUser, hashPassword, comparePassword } from '../services/authService.js';
import { requireAuth, setAuthCookie, clearAuthCookie } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { User } from '../models/User.js';
import { BadRequestError, UnauthorizedError, ConflictError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

export const authRouter = Router();

// Apply rate limiting specifically to register and login endpoints
authRouter.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    const result = await registerUser({ name, email, password });
    setAuthCookie(res, result.token);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await loginUser({ email, password });
    setAuthCookie(res, result.token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.status(200).json({ ok: true, message: 'Logged out successfully.' });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const safeUser = req.user.toJSON ? req.user.toJSON() : req.user;
  res.status(200).json({ user: safeUser });
});

authRouter.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const { name, email, preferences } = req.body || {};

    if (isDbConnected()) {
      const user = await User.findById(req.userId);
      if (!user) {
        throw new UnauthorizedError('User not found.');
      }

      if (name !== undefined) {
        if (!name.trim()) throw new BadRequestError('Name cannot be empty.', { name: 'Name is required' });
        user.name = name.trim();
      }

      if (email !== undefined) {
        const norm = email.trim().toLowerCase();
        if (!norm.includes('@')) throw new BadRequestError('Invalid email format.', { email: 'Invalid email' });
        const conflict = await User.findOne({ email: norm, _id: { $ne: user._id } });
        if (conflict) throw new ConflictError('Email address already in use.', { email: 'Email already in use' });
        user.email = norm;
      }

      if (preferences && typeof preferences === 'object') {
        user.preferences = { ...user.preferences.toObject?.(), ...preferences };
      }

      await user.save();
      return res.status(200).json({ user: user.toJSON() });
    }

    // Offline / mock mode
    const updated = {
      ...req.user,
      ...(name && { name: name.trim() }),
      ...(email && { email: email.trim().toLowerCase() }),
      ...(preferences && { preferences: { ...(req.user.preferences || {}), ...preferences } }),
    };
    res.status(200).json({ user: updated });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword) {
      throw new BadRequestError('Current password is required.', { currentPassword: 'Required' });
    }
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestError('New password must be at least 8 characters long.', {
        newPassword: 'Must be at least 8 characters',
      });
    }

    if (isDbConnected()) {
      const user = await User.findById(req.userId);
      if (!user) {
        throw new UnauthorizedError('User not found.');
      }

      const isMatch = await comparePassword(currentPassword, user.passwordHash);
      if (!isMatch) {
        throw new UnauthorizedError('Current password is incorrect.');
      }

      user.passwordHash = await hashPassword(newPassword);
      await user.save();
      return res.status(200).json({ ok: true, message: 'Password changed successfully.' });
    }

    res.status(200).json({ ok: true, message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
});

export default authRouter;
