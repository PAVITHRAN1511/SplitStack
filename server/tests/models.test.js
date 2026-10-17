/**
 * SplitStack Mongoose Models & Database Tests (Review 3, Step P10).
 * Tests schema validation, constraints, required fields, enums, monetary validation,
 * and database connection lifecycle without requiring an external MongoDB instance.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  User,
  Category,
  Expense,
  Income,
  Budget,
  Recurring,
  Group,
  SharedExpense,
  Settlement,
  ShoppingList,
  Receipt,
  Insight,
} from '../src/models/index.js';

import {
  sanitizeMongoUri,
  connectDb,
  getConnectionState,
  isDbConnected,
} from '../src/db.js';

describe('SplitStack Mongoose Data Models & Database (Step P10)', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyCategoryId = new mongoose.Types.ObjectId();
  const dummyGroupId = new mongoose.Types.ObjectId();
  const dummyMemberId = new mongoose.Types.ObjectId();

  describe('1. Database Connection Module & URI Sanitization', () => {
    it('sanitizes credentials in mongodb:// connection strings', () => {
      const raw = 'mongodb://app_user:secret_pass123@cluster0.example.com:27017/splitstack-dev';
      const clean = sanitizeMongoUri(raw);
      assert.ok(!clean.includes('secret_pass123'), 'Password must be masked');
      assert.ok(!clean.includes('app_user'), 'Username must be masked');
      assert.ok(clean.includes('***:***@cluster0.example.com:27017/splitstack-dev'));
    });

    it('sanitizes credentials in mongodb+srv:// connection strings', () => {
      const raw = 'mongodb+srv://admin:P%40ssw0rd!@cluster0.mongodb.net/splitstack-dev?retryWrites=true';
      const clean = sanitizeMongoUri(raw);
      assert.ok(!clean.includes('P%40ssw0rd!'), 'Password must be masked');
      assert.ok(clean.includes('mongodb+srv://***:***@cluster0.mongodb.net/splitstack-dev'));
    });

    it('throws actionable error when connecting without MONGODB_URI', async () => {
      await assert.rejects(
        async () => {
          await connectDb('');
        },
        (err) => {
          assert.ok(err.message.includes('MONGODB_URI is not configured'));
          return true;
        }
      );
    });

    it('reports initial disconnected state correctly', () => {
      assert.equal(typeof getConnectionState(), 'string');
      assert.equal(isDbConnected(), false);
    });
  });

  describe('2. User Model Validation', () => {
    it('validates a complete, valid user', async () => {
      const user = new User({
        name: 'Priya Raman',
        email: 'priya@example.com',
        passwordHash: 'dummy_hash_for_testing',
        preferences: { theme: 'dark', currency: 'INR' },
      });

      const err = await user.validate();
      assert.equal(err, undefined);
      assert.equal(user.email, 'priya@example.com');
      assert.equal(user.preferences.theme, 'dark');
    });

    it('rejects missing required user fields', async () => {
      const user = new User({});
      await assert.rejects(
        async () => user.validate(),
        (err) => {
          assert.ok(err.errors.name, 'name should be required');
          assert.ok(err.errors.email, 'email should be required');
          assert.ok(err.errors.passwordHash, 'passwordHash should be required');
          return true;
        }
      );
    });

    it('rejects invalid email formats', async () => {
      const user = new User({
        name: 'Priya Raman',
        email: 'invalid-email-string',
        passwordHash: 'hash',
      });

      await assert.rejects(
        async () => user.validate(),
        (err) => {
          assert.ok(err.errors.email, 'should fail email regex');
          return true;
        }
      );
    });

    it('strips passwordHash and salt from toJSON output', () => {
      const user = new User({
        name: 'Priya Raman',
        email: 'priya@example.com',
        passwordHash: 'secret_hash_value',
        salt: 'demo_salt',
      });

      const json = user.toJSON();
      assert.equal(json.passwordHash, undefined);
      assert.equal(json.salt, undefined);
      assert.equal(json.__v, undefined);
      assert.equal(json.name, 'Priya Raman');
    });
  });

  describe('3. Category Model Validation', () => {
    it('validates a system default category with user=null', async () => {
      const cat = new Category({
        user: null,
        name: 'Food & Dining',
        type: 'expense',
        icon: 'mug-hot',
        color: '#f59e0b',
      });

      const err = await cat.validate();
      assert.equal(err, undefined);
      assert.equal(cat.user, null);
    });

    it('rejects invalid category types', async () => {
      const cat = new Category({
        name: 'Bonus',
        type: 'invalid_type',
      });

      await assert.rejects(
        async () => cat.validate(),
        (err) => {
          assert.ok(err.errors.type, 'type must match enum');
          return true;
        }
      );
    });
  });

  describe('4. Expense Model & Monetary Validation', () => {
    it('validates an expense with integer paise amount', async () => {
      const exp = new Expense({
        user: dummyUserId,
        category: dummyCategoryId,
        amount: 84000, // ₹840.00
        description: 'Swiggy dinner',
        paymentMethod: 'UPI',
        date: new Date('2026-10-24'),
      });

      const err = await exp.validate();
      assert.equal(err, undefined);
      assert.equal(exp.amount, 84000);
    });

    it('rejects floating-point rupee amounts (requires integer paise)', async () => {
      const exp = new Expense({
        user: dummyUserId,
        category: dummyCategoryId,
        amount: 150.75, // Invalid: floating point
        description: 'Test expense',
      });

      await assert.rejects(
        async () => exp.validate(),
        (err) => {
          assert.ok(err.errors.amount, 'amount should reject float');
          return true;
        }
      );
    });

    it('rejects negative or zero amounts', async () => {
      const exp = new Expense({
        user: dummyUserId,
        category: dummyCategoryId,
        amount: -500,
        description: 'Negative',
      });

      await assert.rejects(
        async () => exp.validate(),
        (err) => {
          assert.ok(err.errors.amount, 'amount should reject negative');
          return true;
        }
      );
    });
  });

  describe('5. Income Model Validation', () => {
    it('validates income with positive integer paise', async () => {
      const inc = new Income({
        user: dummyUserId,
        category: dummyCategoryId,
        amount: 6500000, // ₹65,000.00
        source: 'Monthly salary',
        paymentMethod: 'Net banking',
      });

      const err = await inc.validate();
      assert.equal(err, undefined);
    });

    it('rejects missing source or invalid amount', async () => {
      const inc = new Income({
        user: dummyUserId,
        category: dummyCategoryId,
        amount: 0,
      });

      await assert.rejects(
        async () => inc.validate(),
        (err) => {
          assert.ok(err.errors.source);
          assert.ok(err.errors.amount);
          return true;
        }
      );
    });
  });

  describe('6. Budget Model Validation', () => {
    it('validates budget with valid month (1-12) and positive limit', async () => {
      const budget = new Budget({
        user: dummyUserId,
        category: dummyCategoryId,
        month: 10,
        year: 2026,
        limit: 1000000, // ₹10,000.00
      });

      const err = await budget.validate();
      assert.equal(err, undefined);
    });

    it('rejects invalid month numbers', async () => {
      const budget = new Budget({
        user: dummyUserId,
        month: 13, // Out of bounds
        year: 2026,
        limit: 500000,
      });

      await assert.rejects(
        async () => budget.validate(),
        (err) => {
          assert.ok(err.errors.month);
          return true;
        }
      );
    });
  });

  describe('7. Recurring Payment Model Validation', () => {
    it('validates recurring payment with valid frequency enum', async () => {
      const rec = new Recurring({
        user: dummyUserId,
        category: dummyCategoryId,
        name: 'Broadband',
        amount: 117900,
        frequency: 'monthly',
        startDate: new Date('2026-01-01'),
        nextDueDate: new Date('2026-11-01'),
        active: true,
      });

      const err = await rec.validate();
      assert.equal(err, undefined);
    });

    it('rejects unsupported frequencies', async () => {
      const rec = new Recurring({
        user: dummyUserId,
        category: dummyCategoryId,
        name: 'Gym',
        amount: 250000,
        frequency: 'bi-weekly', // Not in enum
        startDate: new Date(),
        nextDueDate: new Date(),
      });

      await assert.rejects(
        async () => rec.validate(),
        (err) => {
          assert.ok(err.errors.frequency);
          return true;
        }
      );
    });
  });

  describe('8. Group & Embedded Member Model Validation', () => {
    it('validates group with at least one member', async () => {
      const group = new Group({
        name: 'Goa Trip 2026',
        description: 'Vacation',
        createdBy: dummyUserId,
        members: [
          { user: dummyUserId, role: 'admin' },
          { user: dummyMemberId, role: 'member' },
        ],
      });

      const err = await group.validate();
      assert.equal(err, undefined);
      assert.equal(group.members.length, 2);
    });

    it('rejects group without members', async () => {
      const group = new Group({
        name: 'Empty Group',
        createdBy: dummyUserId,
        members: [],
      });

      await assert.rejects(
        async () => group.validate(),
        (err) => {
          assert.ok(err.errors.members);
          return true;
        }
      );
    });
  });

  describe('9. SharedExpense & Share Conservation Validation', () => {
    it('validates when participant shares sum exactly to total amount', async () => {
      const sexp = new SharedExpense({
        group: dummyGroupId,
        title: 'Dinner',
        amount: 30000, // ₹300.00
        paidBy: dummyUserId,
        category: dummyCategoryId,
        splitType: 'equal',
        shares: [
          { user: dummyUserId, amount: 15000 },
          { user: dummyMemberId, amount: 15000 },
        ],
      });

      const err = await sexp.validate();
      assert.equal(err, undefined);
    });

    it('rejects when participant shares do not sum to total amount', async () => {
      const sexp = new SharedExpense({
        group: dummyGroupId,
        title: 'Lunch',
        amount: 30000, // ₹300.00
        paidBy: dummyUserId,
        category: dummyCategoryId,
        splitType: 'custom',
        shares: [
          { user: dummyUserId, amount: 10000 },
          { user: dummyMemberId, amount: 10000 }, // Sum: 20000 !== 30000
        ],
      });

      await assert.rejects(
        async () => sexp.validate(),
        (err) => {
          assert.ok(err.errors.shares, 'should reject mismatched share sum');
          return true;
        }
      );
    });
  });

  describe('10. Settlement Model Validation', () => {
    it('validates settlement between two distinct members', async () => {
      const stl = new Settlement({
        group: dummyGroupId,
        payer: dummyUserId,
        payee: dummyMemberId,
        amount: 170000, // ₹1,700.00
        status: 'completed',
      });

      const err = await stl.validate();
      assert.equal(err, undefined);
    });

    it('rejects self-settlement where payer and payee are identical', async () => {
      const stl = new Settlement({
        group: dummyGroupId,
        payer: dummyUserId,
        payee: dummyUserId, // Same user
        amount: 50000,
      });

      await assert.rejects(
        async () => stl.validate(),
        (err) => {
          assert.ok(err.errors.payee, 'should reject self-settlement');
          return true;
        }
      );
    });
  });

  describe('11. ShoppingList & Embedded Item Validation', () => {
    it('validates shopping list with embedded checklist items', async () => {
      const list = new ShoppingList({
        owner: dummyUserId,
        name: 'Weekly Groceries',
        budget: 350000,
        items: [
          { name: 'Basmati Rice', quantity: 1, estimatedPrice: 65000, purchased: false },
          { name: 'Milk 1L', quantity: 6, estimatedPrice: 33600, actualPrice: 33600, purchased: true },
        ],
      });

      const err = await list.validate();
      assert.equal(err, undefined);
      assert.equal(list.items.length, 2);
    });

    it('rejects shopping item with zero or negative quantity', async () => {
      const list = new ShoppingList({
        owner: dummyUserId,
        name: 'Invalid Item List',
        items: [
          { name: 'Apples', quantity: 0 },
        ],
      });

      await assert.rejects(
        async () => list.validate(),
        (err) => {
          assert.ok(err.errors['items.0.quantity']);
          return true;
        }
      );
    });
  });

  describe('12. Receipt & Insight Models Validation', () => {
    it('validates receipt with merchant and confidence within [0, 1]', async () => {
      const receipt = new Receipt({
        user: dummyUserId,
        merchant: 'Organic Harvest',
        amount: 84000,
        confidence: 0.94,
        status: 'confirmed',
      });

      const err = await receipt.validate();
      assert.equal(err, undefined);
    });

    it('rejects receipt with out-of-bounds confidence', async () => {
      const receipt = new Receipt({
        user: dummyUserId,
        merchant: 'Store',
        confidence: 1.5, // > 1
      });

      await assert.rejects(
        async () => receipt.validate(),
        (err) => {
          assert.ok(err.errors.confidence);
          return true;
        }
      );
    });

    it('validates insight with valid kind enum', async () => {
      const insight = new Insight({
        user: dummyUserId,
        kind: 'warning',
        message: 'Shopping is over budget by ₹1,280.',
      });

      const err = await insight.validate();
      assert.equal(err, undefined);
    });

    it('rejects insight with invalid kind', async () => {
      const insight = new Insight({
        user: dummyUserId,
        kind: 'unsupported_kind',
        message: 'Notice',
      });

      await assert.rejects(
        async () => insight.validate(),
        (err) => {
          assert.ok(err.errors.kind);
          return true;
        }
      );
    });
  });
});
