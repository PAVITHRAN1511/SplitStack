/**
 * SplitStack Authentication Service (Review 3, Step P11).
 * Handles password hashing with bcrypt, JWT creation, user registration, and login verification.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { BadRequestError, UnauthorizedError, ConflictError } from '../utils/errors.js';
import { isDbConnected } from '../db.js';

/**
 * Hash a plaintext password using bcrypt with salt rounds configured in config.
 * @param {string} password - Raw plaintext password
 * @returns {Promise<string>} Secure bcrypt password hash
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long.', {
      password: 'Must be at least 8 characters',
    });
  }
  return bcrypt.hash(password, config.bcryptRounds || 12);
}

/**
 * Securely verify a plaintext password against a stored bcrypt hash.
 * @param {string} password - Plaintext password candidate
 * @param {string} hash - Stored bcrypt hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Generate a signed JSON Web Token (JWT) for an authenticated user.
 * @param {Object} user - User document or user info
 * @returns {string} Signed JWT string
 */
export function generateToken(user) {
  const userId = user._id ? user._id.toString() : user.id;
  const payload = {
    userId,
    email: user.email,
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verify and decode a JWT token string.
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

/**
 * Register a new user account.
 * Enforces email normalization, uniqueness, password length, and secure hashing.
 * @param {Object} params
 * @param {string} params.name - User's display name
 * @param {string} params.email - User's email address
 * @param {string} params.password - Plaintext password (min 8 characters)
 * @returns {Promise<{ user: Object, token: string }>}
 */
export async function registerUser({ name, email, password }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new BadRequestError('Full name is required.', { name: 'Full name is required' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new BadRequestError('A valid email address is required.', { email: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long.', {
      password: 'Must be at least 8 characters long',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  // If live database is connected, check for existing user and persist
  if (isDbConnected()) {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new ConflictError('An account with this email already exists.', {
        email: 'An account with this email already exists',
      });
    }

    const passwordHash = await hashPassword(password);
    const user = new User({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      preferences: { theme: 'dark', currency: 'INR' },
    });

    await user.save();
    const token = generateToken(user);
    return { user: user.toJSON(), token };
  }

  // In offline / test-double mode
  const passwordHash = await hashPassword(password);
  const dummyUser = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    name: trimmedName,
    email: normalizedEmail,
    preferences: { theme: 'dark', currency: 'INR' },
    createdAt: new Date().toISOString(),
  };
  const token = generateToken(dummyUser);
  return { user: dummyUser, token };
}

/**
 * Authenticate an existing user with email and password.
 * Employs generic error message to prevent account enumeration.
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @returns {Promise<{ user: Object, token: string }>}
 */
export async function loginUser({ email, password }) {
  if (!email || typeof email !== 'string') {
    throw new BadRequestError('Email address is required.', { email: 'Email is required' });
  }
  if (!password || typeof password !== 'string') {
    throw new BadRequestError('Password is required.', { password: 'Password is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (isDbConnected()) {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const token = generateToken(user);
    return { user: user.toJSON(), token };
  }

  throw new UnauthorizedError('Invalid email or password.');
}
