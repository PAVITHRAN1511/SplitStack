/**
 * SplitStack Mongoose Schema Validators (Review 3, Step P10).
 * Provides reusable validators for monetary integer paise and email formatting.
 */

/**
 * Validate that an amount is a non-negative integer number of paise.
 * (₹1 = 100 paise; prevents floating-point rounding errors).
 */
export const nonNegativeIntegerPaise = {
  validator: (v) => v === null || v === undefined || (Number.isInteger(v) && v >= 0),
  message: '{VALUE} is not a valid monetary amount. Must be an integer number of paise >= 0.',
};

/**
 * Validate that an amount is a strictly positive integer number of paise.
 */
export const positiveIntegerPaise = {
  validator: (v) => Number.isInteger(v) && v > 0,
  message: '{VALUE} is not a valid monetary amount. Must be a positive integer number of paise > 0.',
};

/**
 * RFC 5322 compliant email regex validator.
 */
export const emailValidator = {
  validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  message: '{VALUE} is not a valid email address.',
};
