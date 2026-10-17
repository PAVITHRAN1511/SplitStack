/**
 * SplitStack Authentication & Security Tests (Review 3, Step P11).
 * Tests bcrypt password hashing, JWT lifecycle, registration validation,
 * generic login failure protection, unauthenticated rejection, and rate limiting.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
} from '../src/services/authService.js';
import { authRateLimiter } from '../src/middleware/rateLimit.js';

describe('SplitStack Authentication & Security (Step P11)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const testApp = createApp({
      nodeEnv: 'test',
      isTest: true,
      isDevelopment: false,
    });

    await new Promise((resolve) => {
      server = http.createServer(testApp);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('1. Password Hashing (Bcrypt)', () => {
    it('generates a valid bcrypt hash with cost factor', async () => {
      const rawPassword = 'SuperSecretPassword123!';
      const hash = await hashPassword(rawPassword);

      assert.ok(typeof hash === 'string');
      assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'Should be standard bcrypt hash prefix');
      assert.notEqual(hash, rawPassword, 'Plaintext password must never be stored');
    });

    it('correctly verifies candidate password against stored hash', async () => {
      const rawPassword = 'CorrectPassword987';
      const hash = await hashPassword(rawPassword);

      const isValid = await comparePassword(rawPassword, hash);
      assert.equal(isValid, true, 'Matching password must return true');

      const isInvalid = await comparePassword('WrongPassword123', hash);
      assert.equal(isInvalid, false, 'Non-matching password must return false');
    });

    it('rejects passwords shorter than 8 characters', async () => {
      await assert.rejects(
        async () => {
          await hashPassword('short');
        },
        {
          name: 'BadRequestError',
          message: /at least 8 characters/i,
        }
      );
    });
  });

  describe('2. JWT Lifecycle & Signature Verification', () => {
    const mockPrincipal = {
      _id: '507f1f77bcf86cd799439011',
      id: '507f1f77bcf86cd799439011',
      email: 'alex@example.com',
    };

    it('generates a signed JWT containing user claims', () => {
      const token = generateToken(mockPrincipal);
      assert.ok(typeof token === 'string');

      const parts = token.split('.');
      assert.equal(parts.length, 3, 'JWT must comprise header, payload, and signature');

      const decoded = verifyToken(token);
      assert.equal(decoded.userId, mockPrincipal.id);
      assert.equal(decoded.email, mockPrincipal.email);
    });

    it('rejects tampered or malformed tokens', () => {
      const token = generateToken(mockPrincipal);
      const tampered = token.slice(0, -6) + 'xxxxxx';

      assert.throws(
        () => {
          verifyToken(tampered);
        },
        /invalid signature|jwt malformed/i
      );
    });
  });

  describe('3. Registration Endpoint (POST /api/auth/register)', () => {
    it('rejects registration with missing name (400 Bad Request)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'ValidPassword123' }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('name'));
    });

    it('rejects registration with invalid email format (400 Bad Request)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'User', email: 'not-an-email', password: 'ValidPassword123' }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('email'));
    });

    it('rejects registration with password shorter than 8 characters (400 Bad Request)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'User', email: 'valid@example.com', password: '123' }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('8 characters'));
    });

    it('successfully registers valid payload with token and sanitized user (201 Created)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Priya Raman',
          email: 'priya.raman@example.com',
          password: 'SecurePassword123!',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.token, 'Should return signed JWT token');
      assert.ok(data.user, 'Should return user profile');
      assert.equal(data.user.email, 'priya.raman@example.com');
      assert.equal(data.user.passwordHash, undefined, 'Must NEVER return passwordHash');
      assert.equal(data.user.salt, undefined, 'Must NEVER return salt');

      // Verify auth cookie was attached
      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie && setCookie.includes('splitstack_token='), 'Should set splitstack_token cookie');
      assert.ok(setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
    });
  });

  describe('4. Login & Generic Failure Protection (POST /api/auth/login)', () => {
    it('rejects missing email with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'SomePassword123' }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
    });

    it('returns generic 401 error without revealing whether email exists', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent-user@example.com', password: 'SomePassword123' }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'UnauthorizedError');
      assert.equal(data.message, 'Invalid email or password.', 'Generic failure message required');
    });
  });

  describe('5. Session Termination (POST /api/auth/logout)', () => {
    it('clears auth cookie and returns 200 OK', async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);

      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie && (setCookie.includes('splitstack_token=;') || setCookie.includes('Max-Age=0') || setCookie.includes('Expires=')), 'Should clear auth cookie');
    });
  });

  describe('6. Authorization & Protected Routes', () => {
    it('GET /api/auth/me rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'UnauthorizedError');
      assert.ok(data.message.includes('Authentication required'));
    });

    it('GET /api/auth/me rejects malformed token with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer this-is-not-a-valid-jwt' },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'UnauthorizedError');
    });

    it('GET /api/auth/me accepts valid Bearer token and returns authenticated principal', async () => {
      const validToken = generateToken({
        _id: '507f1f77bcf86cd799439011',
        id: '507f1f77bcf86cd799439011',
        email: 'priya@example.com',
      });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.user);
      assert.equal(data.user.email, 'priya@example.com');
      assert.equal(data.user.passwordHash, undefined);
    });

    it('GET /api/auth/me accepts token from HttpOnly cookie', async () => {
      const validToken = generateToken({
        _id: '507f1f77bcf86cd799439011',
        id: '507f1f77bcf86cd799439011',
        email: 'priya@example.com',
      });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: `splitstack_token=${validToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.user);
      assert.equal(data.user.email, 'priya@example.com');
    });
  });

  describe('7. Rate Limiting Protection', () => {
    it('enforces 429 Too Many Requests when rate limit threshold is exceeded', async () => {
      authRateLimiter.reset();

      // Trigger 15 requests within threshold
      for (let i = 0; i < 15; i++) {
        await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-test-rate-limit': 'true',
          },
          body: JSON.stringify({ email: 'rate@example.com', password: 'wrong' }),
        });
      }

      // 16th request must trigger rate limiter
      const blockedRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-rate-limit': 'true',
        },
        body: JSON.stringify({ email: 'rate@example.com', password: 'wrong' }),
      });

      assert.equal(blockedRes.status, 429);
      const data = await blockedRes.json();
      assert.equal(data.error, 'TooManyRequestsError');
      assert.ok(blockedRes.headers.get('retry-after'));

      authRateLimiter.reset();
    });
  });
});
