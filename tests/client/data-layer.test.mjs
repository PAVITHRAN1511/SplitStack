/**
 * Automated tests for SplitStack Client Data Layer (Review 2, Step P2).
 * Tests store.js, seed.js, and api.js using Node.js built-in test runner.
 * Run with: node --test tests/client/data-layer.test.mjs
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock localStorage on globalThis if running in Node without Web Storage
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

// Import data layer modules
const { loadStore, STORE_KEY, STORE_VERSION } = await import('../../client/js/data/store.js');
const api = await import('../../client/js/data/api.js');

describe('Client Data Layer (Step P2)', () => {
  beforeEach(async () => {
    // Reset data to clean initial seed before each test
    await api.resetDemoData();
  });

  describe('1. Store initialization, recovery, and data preservation', () => {
    test('seeds correctly on clean initialization', () => {
      const store = loadStore();
      assert.equal(store.version, STORE_VERSION);
      assert.ok(Array.isArray(store.users));
      assert.ok(Array.isArray(store.categories));
      assert.ok(Array.isArray(store.expenses));
      assert.ok(Array.isArray(store.income));
      assert.ok(Array.isArray(store.budgets));
      assert.ok(Array.isArray(store.recurring));
      assert.ok(Array.isArray(store.groups));
      assert.ok(Array.isArray(store.sharedExpenses));
      assert.ok(Array.isArray(store.settlements));
      assert.ok(Array.isArray(store.shoppingLists));
      assert.ok(Array.isArray(store.receipts));
      assert.ok(Array.isArray(store.insights));

      // Priya Raman is the demo user
      const demoUser = store.users.find((u) => u.email === 'demo@splitstack.app');
      assert.ok(demoUser);
      assert.equal(demoUser.name, 'Priya Raman');
    });

    test('recovers gracefully from corrupted JSON and creates backup', () => {
      const corruptRaw = 'INVALID_CORRUPT_JSON{{{';
      globalThis.localStorage.setItem(STORE_KEY, corruptRaw);

      const store = loadStore();
      assert.equal(store.version, STORE_VERSION);
      assert.ok(Array.isArray(store.expenses));
      assert.ok(store.expenses.length > 0);

      // Verify backup key was created
      const backupKey = globalThis.localStorage.getItem('splitstack:last_corrupt_backup');
      assert.ok(backupKey);
      assert.equal(globalThis.localStorage.getItem(backupKey), corruptRaw);
    });

    test('does not destroy user data when store schema is missing a collection', () => {
      // User has existing custom expenses, but receipts and insights collections are missing
      const partialUserStore = {
        version: 1,
        users: [{ id: 'u_custom', name: 'Preserved User', email: 'custom@example.com' }],
        categories: [],
        expenses: [
          {
            id: 'exp_preserved',
            userId: 'u_custom',
            amount: 55000,
            description: 'Preserved Expense',
            categoryId: 'cat_food',
            date: '2026-10-25'
          }
        ],
        income: [],
        budgets: [],
        recurring: [],
        groups: [],
        sharedExpenses: [],
        settlements: [],
        shoppingLists: []
        // receipts and insights intentionally omitted
      };

      globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(partialUserStore));

      const loaded = loadStore();
      assert.equal(loaded.version, STORE_VERSION);
      assert.equal(loaded.expenses.length, 1);
      assert.equal(loaded.expenses[0].id, 'exp_preserved');
      assert.ok(Array.isArray(loaded.receipts), 'Backfills missing receipts collection as array');
      assert.ok(Array.isArray(loaded.insights), 'Backfills missing insights collection as array');
    });

    test('resetDemoData restores original seed data', async () => {
      await api.createExpense({
        amount: 999900,
        categoryId: 'cat_food',
        date: '2026-10-25',
        description: 'Temporary Test Expense',
        paymentMethod: 'UPI'
      });

      const resBefore = await api.listExpenses({ search: 'Temporary Test Expense' });
      assert.equal(resBefore.items.length, 1);

      await api.resetDemoData();

      const resAfter = await api.listExpenses({ search: 'Temporary Test Expense' });
      assert.equal(resAfter.items.length, 0);
    });
  });

  describe('2. Authentication and Profile API', () => {
    test('authenticates demo user with correct credentials', async () => {
      const res = await api.login({ email: 'demo@splitstack.app', password: 'Demo@1234' });
      assert.ok(res.user);
      assert.equal(res.user.email, 'demo@splitstack.app');
      assert.equal(res.user.name, 'Priya Raman');
      assert.ok(res.token);
      assert.equal(res.user.passwordHash, undefined, 'Password hash must never leak in API response');
      assert.equal(res.user.salt, undefined, 'Salt must never leak in API response');
    });

    test('rejects login with incorrect password with 401 ApiError', async () => {
      await assert.rejects(
        async () => {
          await api.login({ email: 'demo@splitstack.app', password: 'WrongPassword999!' });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 401);
          return true;
        }
      );
    });

    test('logout clears session and subsequent protected calls throw 401 ApiError', async () => {
      await api.login({ email: 'demo@splitstack.app', password: 'Demo@1234' });
      const me = await api.currentUser();
      assert.ok(me);

      await api.logout();
      const meAfter = await api.currentUser();
      assert.equal(meAfter, null);

      await assert.rejects(
        async () => {
          await api.listExpenses();
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 401);
          return true;
        }
      );

      // Re-login to continue tests cleanly
      await api.login({ email: 'demo@splitstack.app', password: 'Demo@1234' });
    });

    test('rejects registration with existing email with 409 ApiError', async () => {
      await assert.rejects(
        async () => {
          await api.register({
            name: 'Priya Clone',
            email: 'demo@splitstack.app',
            password: 'NewPassword123!'
          });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 409);
          assert.equal(err.field, 'email');
          return true;
        }
      );
    });

    test('registers a new user successfully and hashes password', async () => {
      const res = await api.register({
        name: 'Anita Sharma',
        email: 'anita@example.com',
        password: 'SecurePassword123'
      });
      assert.ok(res.user);
      assert.equal(res.user.email, 'anita@example.com');

      // Verify that the new user can log in
      const loginRes = await api.login({
        email: 'anita@example.com',
        password: 'SecurePassword123'
      });
      assert.equal(loginRes.user.name, 'Anita Sharma');
    });

    test('currentUser returns currently logged in user profile', async () => {
      const me = await api.currentUser();
      assert.ok(me);
      assert.equal(me.email, 'demo@splitstack.app');
    });

    test('updateProfile updates name and preferences', async () => {
      const updated = await api.updateProfile({
        name: 'Priya Raman-Sundaram',
        preferences: { theme: 'light', currency: 'INR' }
      });
      assert.equal(updated.name, 'Priya Raman-Sundaram');
      assert.equal(updated.preferences.theme, 'light');
    });
  });

  describe('3. Expenses CRUD and filtering', () => {
    test('enforces integer paise for monetary amounts', async () => {
      // Must reject float amounts like 12.50
      await assert.rejects(
        async () => {
          await api.createExpense({
            amount: 12.5,
            categoryId: 'cat_food',
            date: '2026-10-25',
            description: 'Float amount test',
            paymentMethod: 'UPI'
          });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.field, 'amount');
          return true;
        }
      );

      // Must reject zero or negative amounts
      await assert.rejects(
        async () => {
          await api.createExpense({
            amount: -5000,
            categoryId: 'cat_food',
            date: '2026-10-25',
            description: 'Negative amount test',
            paymentMethod: 'UPI'
          });
        },
        (err) => err.status === 400
      );
    });

    test('creates, reads, updates, and deletes an expense', async () => {
      // Create ₹250.00 = 25000 paise
      const created = await api.createExpense({
        amount: 25000,
        categoryId: 'cat_food',
        date: '2026-10-25',
        description: 'Filter Coffee & Dosa',
        paymentMethod: 'UPI',
        notes: 'Breakfast with friends'
      });

      assert.ok(created.id);
      assert.equal(created.amount, 25000);
      assert.equal(created.description, 'Filter Coffee & Dosa');

      // Read
      const fetched = await api.getExpense(created.id);
      assert.equal(fetched.description, 'Filter Coffee & Dosa');
      assert.equal(fetched.amount, 25000);

      // Update
      const updated = await api.updateExpense(created.id, {
        amount: 28000,
        notes: 'Added extra vada'
      });
      assert.equal(updated.amount, 28000);
      assert.equal(updated.notes, 'Added extra vada');

      // Delete
      const removed = await api.removeExpense(created.id);
      assert.equal(removed.id, created.id);

      // Verify deletion
      await assert.rejects(
        async () => {
          await api.getExpense(created.id);
        },
        (err) => err.status === 404
      );
    });

    test('filters expenses by search text, category (both keys), and date range', async () => {
      const all = await api.listExpenses({ limit: 100 });
      assert.ok(all.total > 0);

      // Filter by categoryId
      const foodById = await api.listExpenses({ categoryId: 'cat_food', limit: 100 });
      assert.ok(foodById.items.length > 0);
      assert.ok(foodById.items.every((e) => e.categoryId === 'cat_food'));

      // Filter by category key
      const foodByKey = await api.listExpenses({ category: 'cat_food', limit: 100 });
      assert.equal(foodByKey.items.length, foodById.items.length);

      // Filter by search text
      const searchRes = await api.listExpenses({ search: 'Swiggy' });
      assert.ok(searchRes.items.length >= 1);
      assert.ok(searchRes.items.some((e) => e.description.includes('Swiggy')));

      // Filter by date range
      const dateFiltered = await api.listExpenses({
        startDate: '2026-10-01',
        endDate: '2026-10-15',
        limit: 100
      });
      assert.ok(dateFiltered.items.length > 0);
      assert.ok(dateFiltered.items.every((e) => e.date >= '2026-10-01' && e.date <= '2026-10-15'));
    });
  });

  describe('4. Income CRUD', () => {
    test('creates and lists income records', async () => {
      const inc = await api.createIncome({
        amount: 8500000, // ₹85,000.00
        categoryId: 'cat_salary',
        date: '2026-10-31',
        source: 'Acme Corp Monthly Salary'
      });
      assert.equal(inc.amount, 8500000);

      const list = await api.listIncome({ limit: 50 });
      assert.ok(list.items.some((i) => i.id === inc.id));

      await api.removeIncome(inc.id);
    });
  });

  describe('5. Budgets, Categories, and Recurring', () => {
    test('lists and creates budgets with positional and object parameters', async () => {
      // Positional
      const budgetsPos = await api.listBudgets(10, 2026);
      assert.ok(Array.isArray(budgetsPos));
      assert.ok(budgetsPos.length > 0);

      // Object
      const budgetsObj = await api.listBudgets({ month: 10, year: 2026 });
      assert.equal(budgetsObj.length, budgetsPos.length);

      // Create new budget for Travel
      const newBudget = await api.createBudget({
        categoryId: 'cat_travel',
        month: 10,
        year: 2026,
        limit: 500000 // ₹5,000.00
      });
      assert.equal(newBudget.limit, 500000);
    });

    test('lists categories by type', async () => {
      const expensesCats = await api.listCategories('expense');
      assert.ok(expensesCats.length > 0);
      assert.ok(expensesCats.every((c) => c.type === 'expense'));

      const incomeCats = await api.listCategories('income');
      assert.ok(incomeCats.length > 0);
      assert.ok(incomeCats.every((c) => c.type === 'income'));
    });

    test('toggles recurring bill active status', async () => {
      const list = await api.listRecurring();
      assert.ok(list.length > 0);
      const first = list[0];
      const initialStatus = first.active;

      const toggled = await api.toggleRecurring(first.id);
      assert.equal(toggled.active, !initialStatus);
    });
  });

  describe('6. Groups, Shared Expenses, and Balances', () => {
    test('retrieves groups and member lists', async () => {
      const groups = await api.listGroups();
      assert.ok(groups.length >= 3);

      const goa = await api.getGroup('grp_goa');
      assert.ok(goa.name.includes('Goa Trip'));
      assert.ok(goa.members.length >= 4);
    });

    test('addMember supports both email string and member object', async () => {
      const newGroup = await api.createGroup({ name: 'Weekend Gamers' });

      // Add by email string
      const updated1 = await api.addMember(newGroup.id, 'gamer1@example.com');
      assert.ok(updated1.members.some((m) => m.email === 'gamer1@example.com'));

      // Add by object
      const updated2 = await api.addMember(newGroup.id, {
        email: 'gamer2@example.com',
        name: 'Gamer Two',
        role: 'member'
      });
      assert.ok(updated2.members.some((m) => m.email === 'gamer2@example.com' && m.name === 'Gamer Two'));
    });

    test('computes group balances in integer paise with zero-sum invariant', async () => {
      const balances = await api.getGroupBalances('grp_goa');
      assert.ok(typeof balances === 'object' && balances !== null);
      assert.ok(Object.keys(balances).length >= 4);

      // Sum of net balances in a closed group must equal 0 paise
      const netSum = Object.values(balances).reduce((acc, b) => acc + b, 0);
      assert.equal(netSum, 0, 'Net balances across all group members must sum to zero');
    });

    test('creates shared expense with valid equal split', async () => {
      const shared = await api.createSharedExpense('grp_goa', {
        title: 'Beach Shack Snacks',
        amount: 120000, // ₹1,200.00
        categoryId: 'cat_food',
        date: '2026-10-24',
        paidBy: 'u_priya',
        splitType: 'equal',
        shares: [
          { userId: 'u_priya', amount: 30000 },
          { userId: 'u_rohan', amount: 30000 },
          { userId: 'u_kavya', amount: 30000 },
          { userId: 'u_arjun', amount: 30000 }
        ]
      });

      assert.ok(shared.id);
      assert.equal(shared.amount, 120000);
    });

    test('rejects shared expense when shares do not sum to amount', async () => {
      await assert.rejects(
        async () => {
          await api.createSharedExpense('grp_goa', {
            title: 'Mismatched Split',
            amount: 100000,
            categoryId: 'cat_food',
            date: '2026-10-24',
            paidBy: 'u_priya',
            splitType: 'custom',
            shares: [
              { userId: 'u_priya', amount: 40000 },
              { userId: 'u_rohan', amount: 40000 } // Total 80,000 !== 100,000
            ]
          });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.field, 'shares');
          return true;
        }
      );
    });

    test('recordSettlement verifies payer and payee are group members', async () => {
      // Valid settlement between Goa Trip members
      const settlement = await api.recordSettlement('grp_goa', {
        payerId: 'u_rohan',
        payeeId: 'u_priya',
        amount: 50000
      });
      assert.ok(settlement.id);
      assert.equal(settlement.amount, 50000);

      // Rejects non-member
      await assert.rejects(
        async () => {
          await api.recordSettlement('grp_goa', {
            payerId: 'u_rohan',
            payeeId: 'non_member_user_999',
            amount: 50000
          });
        },
        (err) => {
          assert.equal(err.name, 'ApiError');
          assert.equal(err.status, 400);
          return true;
        }
      );
    });
  });

  describe('7. Shopping lists and conversion', () => {
    test('group-shared shopping lists are accessible to group members', async () => {
      // Goa packing list (shop_2) is linked to grp_goa
      const goaLists = await api.listShoppingLists('grp_goa');
      assert.ok(goaLists.length >= 1);
      assert.equal(goaLists[0].id, 'shop_2');

      const goaPacking = await api.getShoppingList('shop_2');
      assert.equal(goaPacking.name, 'Goa packing list');
    });

    test('adds item, toggles purchased, and converts list to expense with string categoryId', async () => {
      const list = await api.getShoppingList('shop_1');
      assert.ok(list);

      // Add item
      const added = await api.addShoppingItem('shop_1', {
        name: 'Dark Roast Coffee Beans',
        quantity: 1,
        estimatedPrice: 45000 // ₹450
      });
      assert.ok(added.id);

      // Toggle item
      const toggled = await api.toggleShoppingItem('shop_1', added.id);
      assert.equal(toggled.purchased, true);

      // Convert to expense using string categoryId ('cat_food')
      const createdExpense = await api.convertShoppingListToExpense('shop_1', 'cat_food');
      assert.ok(createdExpense.id);
      assert.ok(createdExpense.amount > 0);
      assert.equal(createdExpense.categoryId, 'cat_food');

      // Duplicate conversion should be rejected
      await assert.rejects(
        async () => {
          await api.convertShoppingListToExpense('shop_1', 'cat_food');
        },
        (err) => err.status === 409
      );
    });
  });

  describe('8. Analytics and Search', () => {
    test('monthlySummary handles both numeric monthsBack and options object', async () => {
      // Positional numeric monthsBack
      const summary3 = await api.monthlySummary(3);
      assert.ok(summary3);
      assert.equal(summary3.trend.length, 3);

      // Options object
      const summaryObj = await api.monthlySummary({ month: 10, year: 2026, monthsBack: 6 });
      assert.ok(summaryObj);
      assert.equal(summaryObj.trend.length, 6);
      assert.ok(typeof summaryObj.totalExpenses === 'number');
      assert.ok(typeof summaryObj.totalIncome === 'number');
    });

    test('byCategory handles both positional (month, year) and options object', async () => {
      // Positional
      const catDataPos = await api.byCategory(10, 2026);
      assert.ok(Array.isArray(catDataPos));
      assert.ok(catDataPos.length > 0);

      // Options object
      const catDataObj = await api.byCategory({ month: 10, year: 2026 });
      assert.equal(catDataObj.length, catDataPos.length);
      assert.ok(catDataObj.every((c) => c.category && typeof c.amount === 'number'));

      // Empty past month with no spending
      const pastEmpty = await api.byCategory(1, 2020);
      assert.equal(pastEmpty.length, 0);
    });

    test('forecast handles both positional (month, year) and options object', async () => {
      const fcPos = await api.forecast(10, 2026);
      assert.ok(fcPos);
      assert.ok(fcPos.totalSoFar > 0);
      assert.ok(fcPos.projectedTotal > 0);
      assert.ok(fcPos.daysInMonth >= 28);

      const fcObj = await api.forecast({ month: 10, year: 2026 });
      assert.equal(fcObj.totalSoFar, fcPos.totalSoFar);
    });

    test('performs cross-collection search', async () => {
      const results = await api.search('Goa');
      assert.ok(results.groups.length >= 1);
      assert.ok(results.groups[0].name.includes('Goa Trip'));
    });
  });
});
