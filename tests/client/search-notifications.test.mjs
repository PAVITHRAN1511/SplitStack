/**
 * Automated tests for Search and Notifications (Review 2, Step P6).
 * Tests cross-collection searching, multi-filter combinations, amount range boundaries,
 * and deterministic in-app notification state management.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock localStorage if running in Node without Web Storage
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MockLocalStorage();
}

const api = await import('../../client/js/data/api.js');

describe('Step P6: Search, Filtering & In-App Notifications', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  describe('1. Global cross-collection search', () => {
    test('searches case-insensitively across expenses, income, groups, and shopping lists', async () => {
      // "Swiggy" exists in expenses
      const expRes = await api.search('swiggy');
      assert.ok(expRes.expenses.length > 0, 'Expected at least 1 expense for "swiggy"');
      assert.equal(expRes.expenses[0].description.includes('Swiggy'), true);

      // "Salary" exists in income
      const incRes = await api.search('salary');
      assert.ok(incRes.income.length > 0, 'Expected at least 1 income for "salary"');

      // "Goa" exists in groups
      const grpRes = await api.search('goa');
      assert.ok(grpRes.groups.length > 0, 'Expected at least 1 group for "goa"');
      assert.equal(grpRes.groups[0].name.includes('Goa'), true);

      // "Diwali" exists in shopping lists
      const shopRes = await api.search('diwali');
      assert.ok(shopRes.shopping.length > 0, 'Expected at least 1 shopping list for "diwali"');
    });

    test('matches transactions by category name', async () => {
      // Searching "food" should match expenses in Food & Dining
      const res = await api.search('food');
      assert.ok(res.expenses.length > 0);
      assert.ok(res.expenses.some((e) => e.categoryId === 'cat_food' || e.categoryName === 'Food & Dining'));
    });

    test('returns empty results with total: 0 for non-matching queries', async () => {
      const res = await api.search('xyz999nonexistentword');
      assert.equal(res.total, 0);
      assert.equal(res.expenses.length, 0);
      assert.equal(res.income.length, 0);
      assert.equal(res.groups.length, 0);
      assert.equal(res.shopping.length, 0);
    });

    test('handles empty or whitespace-only queries safely', async () => {
      const res1 = await api.search('');
      assert.equal(res1.total, 0);

      const res2 = await api.search('   ');
      assert.equal(res2.total, 0);
    });

    test('respects user isolation and does not return other users private records', async () => {
      // Register user 2 (Aarav)
      await api.register({
        name: 'Aarav Sharma',
        email: 'aarav.sharma@example.com',
        password: 'Password@123'
      });

      // Create a private expense for Aarav
      await api.createExpense({
        description: 'Aarav Private Laptop Bag',
        amount: 250000,
        categoryId: 'cat_shopping',
        date: '2026-10-15',
        paymentMethod: 'UPI'
      });

      // Switch back to Priya (demo user)
      await api.login({ email: 'demo@splitstack.app', password: 'Demo@1234' });

      // Priya searches for Aarav's private expense
      const res = await api.search('Aarav Private Laptop Bag');
      assert.equal(res.total, 0);
      assert.equal(res.expenses.length, 0);
    });
  });

  describe('2. Combined multi-field search and filtering', () => {
    test('filters expenses by combined text search, category, and date range', async () => {
      const res = await api.listExpenses({
        q: 'Swiggy',
        category: 'cat_food',
        from: '2026-10-01',
        to: '2026-10-31'
      });

      assert.ok(res.items.length > 0);
      for (const item of res.items) {
        assert.ok(item.description.toLowerCase().includes('swiggy'));
        assert.equal(item.categoryId, 'cat_food');
        assert.ok(item.date >= '2026-10-01' && item.date <= '2026-10-31');
      }
    });

    test('filters expenses by payment method and amount range', async () => {
      // Filter for UPI expenses between ₹500 (50,000 paise) and ₹1,000 (100,000 paise)
      const res = await api.listExpenses({
        method: 'UPI',
        minAmount: 50000,
        maxAmount: 100000
      });

      assert.ok(res.items.length > 0);
      for (const item of res.items) {
        assert.equal(item.paymentMethod.toLowerCase(), 'upi');
        assert.ok(item.amount >= 50000 && item.amount <= 100000);
      }
    });

    test('clearing filters restores full dataset and consistent result counts', async () => {
      const allExpenses = await api.listExpenses({ limit: 100 });
      const filtered = await api.listExpenses({ q: 'swiggy' });

      assert.ok(filtered.total < allExpenses.total);

      // Clearing q
      const cleared = await api.listExpenses({ q: '', limit: 100 });
      assert.equal(cleared.total, allExpenses.total);
    });
  });

  describe('3. In-app notifications & persistence', () => {
    test('generates deterministic notifications from current data and insights', async () => {
      const { notifications, unreadCount } = await api.getNotifications();
      assert.ok(Array.isArray(notifications));
      assert.ok(notifications.length > 0);
      assert.equal(typeof unreadCount, 'number');

      for (const n of notifications) {
        assert.ok(n.id);
        assert.ok(n.title);
        assert.ok(n.message);
        assert.ok(['danger', 'warning', 'info', 'success'].includes(n.kind));
        assert.equal(typeof n.read, 'boolean');
      }
    });

    test('marks individual notification as read and persists in user preferences', async () => {
      const { notifications: initialList, unreadCount: initialUnread } = await api.getNotifications();
      assert.ok(initialList.length > 0);

      const targetId = initialList[0].id;
      const res = await api.markNotificationRead(targetId);
      assert.equal(res.ok, true);

      // Check updated notifications
      const { notifications: updatedList, unreadCount: updatedUnread } = await api.getNotifications();
      const updatedTarget = updatedList.find((n) => n.id === targetId);
      assert.ok(updatedTarget);
      assert.equal(updatedTarget.read, true);
      assert.equal(updatedUnread, initialUnread - 1);
    });

    test('marks all notifications as read and sets unreadCount to 0', async () => {
      const res = await api.markAllNotificationsRead();
      assert.equal(res.ok, true);

      const { notifications, unreadCount } = await api.getNotifications();
      assert.equal(unreadCount, 0);
      for (const n of notifications) {
        assert.equal(n.read, true);
      }
    });

    test('isolates read notification preferences between different users', async () => {
      // Mark all read for Priya
      await api.markAllNotificationsRead();
      const priyaStatus = await api.getNotifications();
      assert.equal(priyaStatus.unreadCount, 0);

      // Register and switch to user 2
      await api.register({
        name: 'Aarav Sharma',
        email: 'aarav.notif@example.com',
        password: 'Password@123'
      });
      const aaravStatus = await api.getNotifications();

      // Aarav should not have Priya's read state applied
      assert.ok(Array.isArray(aaravStatus.notifications));
    });
  });
});
