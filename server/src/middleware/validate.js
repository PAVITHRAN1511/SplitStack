/**
 * SplitStack Request Validation Middleware (Review 3, Step P11).
 * Validates ObjectId parameters, request bodies, and monetary constraints.
 */

import mongoose from 'mongoose';
import { BadRequestError } from '../utils/errors.js';

/**
 * Check whether a string is a valid MongoDB ObjectId.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

/**
 * Express middleware to validate route params as MongoDB ObjectIds.
 * @param {string|string[]} paramNames - Param name or array of param names to validate
 * @returns {import('express').RequestHandler}
 */
export function validateObjectId(paramNames) {
  const names = Array.isArray(paramNames) ? paramNames : [paramNames];

  return (req, res, next) => {
    for (const name of names) {
      const val = req.params[name];
      if (val && !isValidObjectId(val)) {
        return next(
          new BadRequestError(`Invalid identifier format for parameter "${name}": "${val}". Must be a 24-character hexadecimal ObjectId.`, {
            [name]: 'Invalid ObjectId format',
          })
        );
      }
    }
    next();
  };
}

/**
 * Validate that an amount is a positive integer representing paise.
 * @param {any} amount
 * @param {string} [field='amount']
 * @throws {BadRequestError}
 */
export function assertPositivePaise(amount, field = 'amount') {
  if (amount === undefined || amount === null || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw new BadRequestError(`"${field}" must be a positive integer in paise (1 INR = 100 paise).`, {
      [field]: 'Must be positive integer paise',
    });
  }
}

/**
 * Validate that an amount is a non-negative integer representing paise.
 * @param {any} amount
 * @param {string} [field='amount']
 * @throws {BadRequestError}
 */
export function assertNonNegativePaise(amount, field = 'amount') {
  if (amount === undefined || amount === null || typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
    throw new BadRequestError(`"${field}" must be a non-negative integer in paise.`, {
      [field]: 'Must be non-negative integer paise',
    });
  }
}
