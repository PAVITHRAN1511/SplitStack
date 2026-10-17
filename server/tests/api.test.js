/**
 * SplitStack REST API Endpoints & Authorization Tests (Review 3, Step P11).
 * Tests authentication enforcement across protected resources, ObjectId parameter validation,
 * monetary constraint validation, ownership rules, and domain algorithm parity.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { generateToken } from '../src/services/authService.js';
import {
  calculateEqualSplit,
  validateCustomShares,
  calculateNetBalances,
  simplifyDebts,
} from '../src/utils/domain.js';

describe('SplitStack REST API & Authorization (Step P11)', () => {
  let server;
  let baseUrl;
  let validToken;
  const userA = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    email: 'userA@example.com',
    name: 'User A',
  };

  before(async () => {
    validToken = generateToken(userA);

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

  describe('1. Unauthenticated Access Protection (401 Unauthorized)', () => {
    const protectedRoutes = [
      { method: 'GET', path: '/api/expenses' },
      { method: 'POST', path: '/api/expenses' },
      { method: 'GET', path: '/api/income' },
      { method: 'POST', path: '/api/income' },
      { method: 'GET', path: '/api/categories' },
      { method: 'POST', path: '/api/categories' },
      { method: 'GET', path: '/api/budgets' },
      { method: 'POST', path: '/api/budgets' },
      { method: 'GET', path: '/api/recurring' },
      { method: 'POST', path: '/api/recurring' },
      { method: 'GET', path: '/api/groups' },
      { method: 'POST', path: '/api/groups' },
      { method: 'GET', path: '/api/shopping' },
      { method: 'POST', path: '/api/shopping' },
      { method: 'GET', path: '/api/analytics/monthly' },
      { method: 'GET', path: '/api/analytics/categories' },
      { method: 'GET', path: '/api/notifications' },
      { method: 'GET', path: '/api/search' },
      { method: 'GET', path: '/api/receipts' },
    ];

    for (const route of protectedRoutes) {
      it(`${route.method} ${route.path} rejects unauthenticated requests with 401`, async () => {
        const res = await fetch(`${baseUrl}${route.path}`, {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
          body: route.method === 'POST' ? JSON.stringify({}) : undefined,
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.error, 'UnauthorizedError');
        assert.ok(data.message.includes('Authentication required'));
      });
    }
  });

  describe('2. Parameter Validation & Malformed ObjectId Handling (400 Bad Request)', () => {
    it('GET /api/expenses/:id rejects malformed ObjectId with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/expenses/not-an-objectid-123`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('Invalid identifier format'));
    });

    it('GET /api/income/:id rejects malformed ObjectId with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/income/invalid-id`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
    });

    it('GET /api/groups/:id rejects malformed ObjectId with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/groups/not-a-24-hex-id`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
    });

    it('GET /api/shopping/:id rejects malformed ObjectId with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/shopping/bad-shopping-list-id`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
    });
  });

  describe('3. Monetary Validation & Integer Paise Constraints', () => {
    it('POST /api/expenses rejects decimal rupee amounts (requires integer paise)', async () => {
      const res = await fetch(`${baseUrl}/api/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          categoryId: '507f1f77bcf86cd799439031',
          amount: 25.50, // Float rupees instead of integer paise (2550)
          description: 'Coffee',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('paise'));
    });

    it('POST /api/expenses rejects zero or negative amounts', async () => {
      const res = await fetch(`${baseUrl}/api/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          categoryId: '507f1f77bcf86cd799439031',
          amount: -1500,
          description: 'Negative expense',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
    });

    it('POST /api/income rejects negative amounts', async () => {
      const res = await fetch(`${baseUrl}/api/income`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          categoryId: '507f1f77bcf86cd799439031',
          amount: -5000,
          source: 'Salary',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
    });

    it('POST /api/budgets rejects invalid month numbers', async () => {
      const res = await fetch(`${baseUrl}/api/budgets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          month: 13, // Invalid month
          year: 2026,
          limit: 5000000,
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('Month'));
    });
  });

  describe('4. Resource Validation & Protected Operations', () => {
    it('POST /api/categories rejects invalid category types', async () => {
      const res = await fetch(`${baseUrl}/api/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          name: 'Investment',
          type: 'asset', // Invalid type: must be expense or income
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('type'));
    });

    it('GET /api/search with empty query returns total: 0 and empty arrays', async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.total, 0);
      assert.deepEqual(data.expenses, []);
      assert.deepEqual(data.income, []);
      assert.deepEqual(data.groups, []);
      assert.deepEqual(data.shopping, []);
    });
  });

  describe('5. Domain Algorithm Server Interoperability', () => {
    it('calculates exact equal splits with deterministic remainder allocation', () => {
      const split = calculateEqualSplit({
        amount: 10000, // ₹100.00
        participants: ['u1', 'u2', 'u3'],
        payerId: 'u1',
      });

      assert.equal(split.length, 3);
      // 10000 / 3 = 3333 with remainder 1 allocated to payer u1
      assert.equal(split.find((s) => s.userId === 'u1')?.amount, 3334);
      assert.equal(split.find((s) => s.userId === 'u2')?.amount, 3333);
      assert.equal(split.find((s) => s.userId === 'u3')?.amount, 3333);

      const total = split.reduce((acc, s) => acc + s.amount, 0);
      assert.equal(total, 10000, 'Sum of shares must equal total amount exactly');
    });

    it('validates custom shares and enforces exact sum match', () => {
      const valid = validateCustomShares({
        amount: 5000,
        shares: [
          { userId: 'u1', amount: 3000 },
          { userId: 'u2', amount: 2000 },
        ],
      });
      assert.equal(valid.isValid, true);
      assert.equal(valid.remaining, 0);

      const invalid = validateCustomShares({
        amount: 5000,
        shares: [
          { userId: 'u1', amount: 3000 },
          { userId: 'u2', amount: 1500 }, // sum 4500 != 5000
        ],
      });
      assert.equal(invalid.isValid, false);
      assert.ok(invalid.error.includes('difference'));
    });

    it('computes net group balances with zero-sum conservation invariant', () => {
      const members = ['u1', 'u2', 'u3'];
      const expenses = [
        {
          paidBy: 'u1',
          amount: 3000,
          shares: [
            { userId: 'u1', amount: 1000 },
            { userId: 'u2', amount: 1000 },
            { userId: 'u3', amount: 1000 },
          ],
        },
      ];

      const { balances, netSum } = calculateNetBalances({ members, expenses });
      assert.equal(balances['u1'], 2000); // paid 3000, share 1000 => +2000
      assert.equal(balances['u2'], -1000); // owes 1000
      assert.equal(balances['u3'], -1000); // owes 1000
      assert.equal(netSum, 0, 'Net balances must sum to exactly zero');
    });

    it('simplifies group debts using greedy minimum cash flow', () => {
      const members = [
        { userId: 'u1', name: 'Alice' },
        { userId: 'u2', name: 'Bob' },
        { userId: 'u3', name: 'Charlie' },
      ];
      const balances = {
        u1: 2000,
        u2: -1000,
        u3: -1000,
      };

      const result = simplifyDebts(members, balances);
      assert.equal(result.transfers.length, 2);
      assert.equal(result.transfers[0].to, 'u1');
      assert.equal(result.transfers[1].to, 'u1');
    });
  });
});
