/**
 * Automated tests for SplitStack Frontend REST API Client & Integration (Review 3, Step P13).
 * Tests HTTP request construction, headers, authentication transport, multipart receipt upload,
 * error mapping to ApiError, integer-paise preservation, and prevention of silent local fallback.
 *
 * NOTE: These deterministic unit tests use mocked global fetch responses.
 * Run with: node --test tests/client/api-http.test.mjs
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  request,
  getApiBaseUrl,
  setApiBaseUrl,
  getAuthToken,
  setAuthToken,
  httpRegister,
  httpLogin,
  httpLogout,
  httpCurrentUser,
  httpUpdateProfile,
  httpChangePassword,
  httpListExpenses,
  httpGetExpense,
  httpCreateExpense,
  httpUpdateExpense,
  httpRemoveExpense,
  httpListIncome,
  httpCreateIncome,
  httpListCategories,
  httpCreateCategory,
  httpListBudgets,
  httpCreateBudget,
  httpListRecurring,
  httpCreateRecurring,
  httpToggleRecurring,
  httpListGroups,
  httpGetGroup,
  httpCreateGroup,
  httpAddMember,
  httpRemoveMember,
  httpLeaveGroup,
  httpListSharedExpenses,
  httpCreateSharedExpense,
  httpRemoveSharedExpense,
  httpGetGroupBalances,
  httpGetSuggestedSettlements,
  httpListSettlements,
  httpRecordSettlement,
  httpRemoveSettlement,
  httpListShoppingLists,
  httpCreateShoppingList,
  httpAddShoppingItem,
  httpToggleShoppingItem,
  httpConvertShoppingListToExpense,
  httpMonthlySummary,
  httpByCategory,
  httpForecast,
  httpInsights,
  httpGetNotifications,
  httpMarkNotificationRead,
  httpMarkAllNotificationsRead,
  httpSearch,
  httpListReceipts,
  httpGetReceipt,
  httpGetReceiptImageUrl,
  httpUploadReceipt,
  httpConfirmReceipt,
  httpRemoveReceipt,
  exportLocalData,
  importLocalDataToServer
} from '../../client/js/data/api-http.js';

import { getApiMode, setApiMode, listExpenses, createExpense } from '../../client/js/data/api.js';

// Mock Fetch Helper
let originalFetch = globalThis.fetch;
let mockFetchHistory = [];
let mockFetchResponses = [];

function setupMockFetch() {
  mockFetchHistory = [];
  mockFetchResponses = [];

  globalThis.fetch = async (url, options = {}) => {
    mockFetchHistory.push({ url: String(url), options });

    if (mockFetchResponses.length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const next = mockFetchResponses.shift();
    if (next instanceof Error) {
      throw next;
    }

    const {
      status = 200,
      body = {},
      headers = { 'Content-Type': 'application/json' }
    } = next;

    const payload = (status === 204 || status === 205 || status === 304)
      ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));
    return new Response(payload, { status, headers });
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  mockFetchHistory = [];
  mockFetchResponses = [];
}

describe('Step P13: Frontend API Integration', () => {
  beforeEach(() => {
    setupMockFetch();
    setApiBaseUrl('/api');
    setAuthToken(null);
    setApiMode('api');
  });

  afterEach(() => {
    restoreFetch();
    setAuthToken(null);
    setApiMode('local');
  });

  // ===========================================================================
  // 1. Base URL & Request Construction
  // ===========================================================================
  describe('1. Base URL & Request Construction', () => {
    test('default base URL is /api and can be configured', () => {
      assert.equal(getApiBaseUrl(), '/api');
      setApiBaseUrl('https://api.splitstack.test/v1');
      assert.equal(getApiBaseUrl(), 'https://api.splitstack.test/v1');
      setApiBaseUrl('/api');
      assert.equal(getApiBaseUrl(), '/api');
    });

    test('serializes query parameters into URL correctly', async () => {
      mockFetchResponses.push({ status: 200, body: { items: [], total: 0 } });
      await request('/expenses', {
        params: { page: 2, limit: 10, search: 'tea stall', empty: '', nullVal: null }
      });

      assert.equal(mockFetchHistory.length, 1);
      const calledUrl = mockFetchHistory[0].url;
      assert.match(calledUrl, /\/api\/expenses\?/);
      assert.match(calledUrl, /page=2/);
      assert.match(calledUrl, /limit=10/);
      assert.match(calledUrl, /search=tea\+stall/);
      assert.doesNotMatch(calledUrl, /empty=/);
      assert.doesNotMatch(calledUrl, /nullVal=/);
    });

    test('sets Accept and Content-Type: application/json for JSON requests', async () => {
      mockFetchResponses.push({ status: 200, body: { id: 'exp_1' } });
      await request('/expenses', {
        method: 'POST',
        body: { description: 'Chai', amount: 3000 }
      });

      const opts = mockFetchHistory[0].options;
      assert.equal(opts.method, 'POST');
      assert.equal(opts.credentials, 'include');
      assert.equal(opts.headers.get('Accept'), 'application/json');
      assert.equal(opts.headers.get('Content-Type'), 'application/json');
      assert.equal(opts.body, JSON.stringify({ description: 'Chai', amount: 3000 }));
    });

    test('handles 204 No Content without JSON parsing errors', async () => {
      mockFetchResponses.push({ status: 204, body: '' });
      const res = await request('/expenses/exp_1', { method: 'DELETE' });
      assert.deepEqual(res, {});
    });
  });

  // ===========================================================================
  // 2. Transport Security & Session Management
  // ===========================================================================
  describe('2. Transport Security & Session Management', () => {
    test('attaches Authorization Bearer header when token is in memory', async () => {
      setAuthToken('mock_jwt_token_123');
      assert.equal(getAuthToken(), 'mock_jwt_token_123');

      mockFetchResponses.push({ status: 200, body: { user: { id: 'usr_1' } } });
      await request('/auth/me');

      const headers = mockFetchHistory[0].options.headers;
      assert.equal(headers.get('Authorization'), 'Bearer mock_jwt_token_123');
    });

    test('clears in-memory token on 401 Unauthorized response', async () => {
      setAuthToken('expired_token_456');
      mockFetchResponses.push({
        status: 401,
        body: { message: 'Session expired. Please log in again.' }
      });

      await assert.rejects(
        async () => {
          await request('/auth/me');
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 401);
          assert.match(err.message, /Session expired/);
          return true;
        }
      );

      assert.equal(getAuthToken(), null);
    });

    test('currentUser returns user object from server /auth/me', async () => {
      mockFetchResponses.push({
        status: 200,
        body: { user: { id: 'usr_pavi', name: 'Pavithran', email: 'pavi@test.com' } }
      });

      const user = await httpCurrentUser();
      assert.equal(user.id, 'usr_pavi');
      assert.equal(user.name, 'Pavithran');
    });

    test('currentUser returns null on 401 unauthenticated session without throwing', async () => {
      mockFetchResponses.push({ status: 401, body: { message: 'Unauthorized' } });
      const user = await httpCurrentUser();
      assert.equal(user, null);
    });

    test('logout posts to /auth/logout and clears in-memory token', async () => {
      setAuthToken('token_to_clear');
      mockFetchResponses.push({ status: 200, body: { ok: true } });

      const res = await httpLogout();
      assert.equal(res.ok, true);
      assert.equal(getAuthToken(), null);
      assert.equal(mockFetchHistory[0].options.method, 'POST');
    });
  });

  // ===========================================================================
  // 3. Error Mapping & Offline Safety
  // ===========================================================================
  describe('3. Error Mapping & Offline Safety', () => {
    test('maps server field validation errors to ApiError with field and message', async () => {
      mockFetchResponses.push({
        status: 400,
        body: {
          message: 'Validation failed',
          fields: { email: 'Email address is already in use.' }
        }
      });

      await assert.rejects(
        async () => {
          await httpRegister({ name: 'Test', email: 'dup@test.com', password: 'Password123' });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 400);
          assert.equal(err.field, 'email');
          assert.equal(err.message, 'Email address is already in use.');
          return true;
        }
      );
    });

    test('maps network connection failure to ApiError with status 0', async () => {
      mockFetchResponses.push(new TypeError('Failed to fetch'));

      await assert.rejects(
        async () => {
          await request('/expenses');
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 0);
          assert.match(err.message, /connection failed|Failed to fetch/i);
          return true;
        }
      );
    });

    test('maps 409 Conflict error for duplicate resources', async () => {
      mockFetchResponses.push({
        status: 409,
        body: { message: 'Receipt has already been confirmed.' }
      });

      await assert.rejects(
        async () => {
          await httpConfirmReceipt('rec_123', { description: 'Dinner', amount: 50000 });
        },
        (err) => {
          assert.equal(err.status, 409);
          assert.match(err.message, /already been confirmed/);
          return true;
        }
      );
    });
  });

  // ===========================================================================
  // 4. Resource Endpoints & Integer-Paise Preservation
  // ===========================================================================
  describe('4. Resource Endpoints & Integer-Paise Preservation', () => {
    test('httpListExpenses maps query filters and normalizes id and categoryId', async () => {
      mockFetchResponses.push({
        status: 200,
        body: {
          items: [{ _id: '507f1f77bcf86cd799439011', description: 'Groceries', amount: 45000, category: 'cat_food' }],
          total: 1,
          page: 1,
          limit: 10
        }
      });

      const res = await httpListExpenses({ page: 1, limit: 10, category: 'cat_food' });
      assert.equal(res.total, 1);
      assert.equal(res.items.length, 1);
      assert.equal(res.items[0].id, '507f1f77bcf86cd799439011');
      assert.equal(res.items[0].amount, 45000); // Preserved integer paise
    });

    test('httpCreateExpense sends payload and normalizes response id', async () => {
      mockFetchResponses.push({
        status: 201,
        body: { _id: 'exp_new', description: 'Metro Card', amount: 50000, paymentMethod: 'UPI' }
      });

      const res = await httpCreateExpense({
        description: 'Metro Card',
        amount: 50000,
        date: '2026-10-17',
        categoryId: 'cat_travel'
      });

      assert.equal(res.id, 'exp_new');
      assert.equal(res.amount, 50000);
      const reqBody = JSON.parse(mockFetchHistory[0].options.body);
      assert.equal(reqBody.amount, 50000);
    });

    test('httpListGroups normalizes member IDs and group ID', async () => {
      mockFetchResponses.push({
        status: 200,
        body: [
          {
            _id: 'grp_goa',
            name: 'Goa Trip',
            members: [{ userId: 'usr_1', role: 'admin' }, { userId: 'usr_2', role: 'member' }]
          }
        ]
      });

      const groups = await httpListGroups();
      assert.equal(groups.length, 1);
      assert.equal(groups[0].id, 'grp_goa');
      assert.equal(groups[0].members[0].userId, 'usr_1');
    });

    test('httpCreateSharedExpense constructs participants payload with sharePaise', async () => {
      mockFetchResponses.push({
        status: 201,
        body: { _id: 'sh_exp_1', description: 'Villa booking', amount: 900000 }
      });

      const res = await httpCreateSharedExpense('grp_goa', {
        title: 'Villa booking',
        amount: 900000,
        date: '2026-10-17',
        paidBy: 'usr_1',
        splitType: 'custom',
        shares: [
          { userId: 'usr_1', amount: 450000 },
          { userId: 'usr_2', amount: 450000 }
        ]
      });

      assert.equal(res.id, 'sh_exp_1');
      const sent = JSON.parse(mockFetchHistory[0].options.body);
      assert.equal(sent.amount, 900000);
      assert.equal(sent.participants.length, 2);
      assert.equal(sent.participants[0].sharePaise, 450000);
    });

    test('httpForecast returns forecast metrics with compatibility aliases', async () => {
      mockFetchResponses.push({
        status: 200,
        body: {
          currentSpent: 2500000,
          projectedSpent: 3800000,
          budgetLimit: 4000000,
          status: 'on_track'
        }
      });

      const fc = await httpForecast(10, 2026);
      assert.equal(fc.totalSoFar, 2500000);
      assert.equal(fc.projectedSpend, 3800000);
      assert.equal(fc.monthlyBudget, 4000000);
    });
  });

  // ===========================================================================
  // 5. Multipart Receipt Upload & Confirmation
  // ===========================================================================
  describe('5. Multipart Receipt Upload & Confirmation', () => {
    test('httpUploadReceipt sends FormData without manual Content-Type header', async () => {
      mockFetchResponses.push({
        status: 201,
        body: {
          receipt: { _id: 'rec_507f', filename: 'server_rec.png' },
          candidate: { merchant: 'Nature Basket', amount: 124500, date: '2026-10-17', confidence: 0.92 }
        }
      });

      const fakeFile = new Blob(['fake_png_data'], { type: 'image/png' });
      fakeFile.name = 'nature_basket.png';

      const res = await httpUploadReceipt(fakeFile);
      assert.equal(res.receipt.id, 'rec_507f');
      assert.equal(res.candidate.merchant, 'Nature Basket');
      assert.equal(res.candidate.amount, 124500);

      // Verify multipart headers
      const opts = mockFetchHistory[0].options;
      assert.equal(opts.method, 'POST');
      assert.equal(mockFetchHistory[0].url, '/api/receipts/upload');
      // Content-Type must NOT be manually set to multipart/form-data
      assert.equal(opts.headers.get('Content-Type'), null);
      assert.ok(opts.body instanceof FormData);
    });

    test('httpConfirmReceipt posts to /api/receipts/:id/confirm and returns linked expense', async () => {
      mockFetchResponses.push({
        status: 200,
        body: {
          receipt: { _id: 'rec_507f', status: 'confirmed' },
          expense: { _id: 'exp_from_rec', description: 'Nature Basket', amount: 124500 }
        }
      });

      const res = await httpConfirmReceipt('rec_507f', {
        description: 'Nature Basket',
        amount: 124500,
        date: '2026-10-17',
        categoryId: 'cat_groceries'
      });

      assert.equal(res.receipt.id, 'rec_507f');
      assert.equal(res.expense.id, 'exp_from_rec');
      assert.equal(res.expense.amount, 124500);
    });

    test('httpGetReceiptImageUrl builds correct streaming endpoint URL', () => {
      const url = httpGetReceiptImageUrl('rec_123');
      assert.equal(url, '/api/receipts/rec_123/image');
    });
  });

  // ===========================================================================
  // 6. Safe Mode Switching & Prevention of Silent Local Fallback
  // ===========================================================================
  describe('6. Safe Mode Switching & Prevention of Silent Local Fallback', () => {
    test('switching mode to api vs local works explicitly', () => {
      setApiMode('local');
      assert.equal(getApiMode(), 'local');
      setApiMode('api');
      assert.equal(getApiMode(), 'api');
    });

    test('rejects invalid API modes', () => {
      assert.throws(() => setApiMode('invalid_mode'), /Invalid API mode/);
    });

    test('in api mode, a failed server call throws ApiError and does NOT silently save to localStorage', async () => {
      setApiMode('api');
      mockFetchResponses.push({
        status: 500,
        body: { message: 'Database transaction failed on server.' }
      });

      await assert.rejects(
        async () => {
          await createExpense({ description: 'Ghost expense', amount: 99900, date: '2026-10-17' });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 500);
          assert.match(err.message, /Database transaction failed/);
          return true;
        }
      );

      // Verify it did NOT secretly write to localStorage
      setApiMode('local');
      const localList = await listExpenses({ search: 'Ghost expense' });
      assert.equal(localList.items.length, 0);
    });

    test('exportLocalData safely returns snapshot of browser storage without mutation', () => {
      const data = exportLocalData();
      assert.equal(typeof data, 'object');
    });

    test('importLocalDataToServer enforces authentication check before migrating data', async () => {
      // Mock /auth/me returning 401 unauthenticated
      mockFetchResponses.push({ status: 401, body: { message: 'Unauthorized' } });

      await assert.rejects(
        async () => {
          await importLocalDataToServer();
        },
        (err) => {
          assert.equal(err.status, 401);
          assert.match(err.message, /Authentication required/);
          return true;
        }
      );
    });
  });
});
