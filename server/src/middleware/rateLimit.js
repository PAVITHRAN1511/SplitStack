/**
 * SplitStack In-Memory Rate Limiting Middleware (Review 3, Step P11).
 * Protects authentication and critical endpoints against brute-force attacks.
 */

import { config } from '../config.js';

/**
 * Factory for creating an in-memory sliding-window rate limiter.
 * @param {Object} options
 * @param {number} [options.windowMs=900000] - Window duration in milliseconds (default 15 minutes)
 * @param {number} [options.max=20] - Maximum requests allowed per IP within the window
 * @param {string} [options.message] - Custom error message
 * @param {boolean} [options.enabledInTest=false] - Whether to enforce during automated test runs
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
  message = 'Too many requests. Please try again later.',
  enabledInTest = false,
} = {}) {
  // Map of ip -> array of request timestamps
  const hits = new Map();

  const limiter = (req, res, next) => {
    // Skip during automated testing unless explicitly enabled
    if (config.isTest && !enabledInTest && req.headers['x-test-rate-limit'] !== 'true') {
      return next();
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Prune stale timestamps
    let timestamps = hits.get(ip) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= max) {
      const retryAfterSec = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: 'TooManyRequestsError',
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  };

  // Helper method to clear the in-memory state for testing
  limiter.reset = () => {
    hits.clear();
  };

  return limiter;
}

// Default limiter for authentication endpoints: max 15 attempts per 15 minutes
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
});

export default authRateLimiter;
