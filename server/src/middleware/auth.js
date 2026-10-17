/**
 * SplitStack Authentication Middleware (Review 3, Step P11).
 * Verifies JWT tokens from Bearer authorization headers and HttpOnly cookies.
 * Attaches the authenticated user to `req.user` and prevents unauthorized access.
 */

import { verifyToken } from '../services/authService.js';
import { User } from '../models/User.js';
import { isDbConnected } from '../db.js';
import { config } from '../config.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * Configure standard secure cookie options.
 * @returns {import('express').CookieOptions}
 */
export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/',
  };
}

/**
 * Set the authentication cookie on the response.
 * @param {import('express').Response} res
 * @param {string} token
 */
export function setAuthCookie(res, token) {
  res.cookie('splitstack_token', token, getAuthCookieOptions());
}

/**
 * Clear the authentication cookie.
 * @param {import('express').Response} res
 */
export function clearAuthCookie(res) {
  res.clearCookie('splitstack_token', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Extract token from request (Bearer header preferred, fallback to cookie).
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.cookies && req.cookies.splitstack_token) {
    return req.cookies.splitstack_token;
  }
  return null;
}

/**
 * Middleware requiring a valid authenticated session.
 * Derives user strictly from verified token, never from user-supplied request body.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return next(new UnauthorizedError('Authentication required. Please sign in.'));
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Session expired. Please sign in again.'));
    }
    return next(new UnauthorizedError('Invalid authentication token.'));
  }

  try {
    if (isDbConnected()) {
      const user = await User.findById(decoded.userId);
      if (!user) {
        return next(new UnauthorizedError('User account not found.'));
      }
      req.user = user;
      req.userId = user._id.toString();
    } else {
      // In offline / test-double environments, construct safe principal from verified token claims
      const mockPrincipal = req.mockUser || {
        _id: decoded.userId,
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name || 'Test User',
      };
      req.user = mockPrincipal;
      req.userId = decoded.userId;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication middleware: populates req.user if valid token exists,
 * but does not reject request if unauthenticated.
 */
export async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);
    if (isDbConnected()) {
      const user = await User.findById(decoded.userId);
      if (user) {
        req.user = user;
        req.userId = user._id.toString();
      }
    } else {
      req.user = req.mockUser || {
        _id: decoded.userId,
        id: decoded.userId,
        email: decoded.email,
      };
      req.userId = decoded.userId;
    }
  } catch {
    // Ignore invalid token in optional auth
  }

  next();
}

export default requireAuth;
