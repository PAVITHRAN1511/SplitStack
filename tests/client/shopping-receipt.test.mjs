/**
 * Automated tests for SplitStack Step P7: Shopping Checklist & Receipt Scanning Preview.
 * Covers:
 * 1. Shopping-list CRUD and user isolation boundaries
 * 2. Item CRUD, validation, and checked/unchecked transitions
 * 3. Progress calculations, variance, and empty-list edge cases
 * 4. Duplicate-protected conversion of shopping lists to expenses
 * 5. Receipt file validation (MIME types, extensions, 5 MB limit, sanitization)
 * 6. Honest OCR boundary, extraction status, and candidate receipt parsing
 * 7. Receipt data-layer CRUD and user boundaries
 *
 * Run with: node --test tests/client/shopping-receipt.test.mjs
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock localStorage
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

// Imports
const api = await import('../../client/js/data/api.js');
const {
  validateReceiptFile,
  formatFileSize,
  sanitizeReceiptFilename,
  isOcrAvailable,
  getExtractionStatus,
  parseCandidateReceipt,
  MAX_RECEIPT_SIZE_BYTES
} = await import('../../client/js/domain/receipt.js');

describe('Step P7: Shopping Checklist & Receipt Scanning Preview', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  // ===========================================================================
  // 1. SHOPPING LIST CRUD & ACCESS BOUNDARIES
  // ===========================================================================
  describe('1. Shopping List CRUD & Access Boundaries', () => {
    test('creates personal and group shopping lists with integer paise budget', async () => {
      const personalList = await api.createShoppingList({
        name: 'Weekly Essentials',
        budget: 250000 // ₹2,500
      });

      assert.ok(personalList.id);
      assert.strictEqual(personalList.name, 'Weekly Essentials');
      assert.strictEqual(personalList.budget, 250000);
      assert.strictEqual(personalList.groupId, null);
      assert.strictEqual(personalList.convertedExpenseId, null);
      assert.ok(Array.isArray(personalList.items));
      assert.strictEqual(personalList.items.length, 0);

      const groupList = await api.createShoppingList({
        name: 'Goa Snacks & Drinks',
        budget: 400000,
        groupId: 'grp_goa'
      });

      assert.strictEqual(groupList.name, 'Goa Snacks & Drinks');
      assert.strictEqual(groupList.groupId, 'grp_goa');
    });

    test('rejects shopping list creation with missing or empty name', async () => {
      await assert.rejects(
        () => api.createShoppingList({ name: '' }),
        (err) => err.field === 'name' && /required/i.test(err.message)
      );

      await assert.rejects(
        () => api.createShoppingList({ name: '   ' }),
        (err) => err.field === 'name' && /required/i.test(err.message)
      );
    });

    test('lists shopping lists respecting user and group accessibility', async () => {
      const allLists = await api.listShoppingLists();
      assert.ok(Array.isArray(allLists));
      assert.ok(allLists.length >= 3);

      const goaLists = await api.listShoppingLists('grp_goa');
      assert.ok(goaLists.length >= 1);
      assert.ok(goaLists.every((l) => l.groupId === 'grp_goa'));
    });

    test('updates shopping list metadata (name, budget, group association)', async () => {
      const updated = await api.updateShoppingList('shop_1', {
        name: 'Monthly Groceries & Household',
        budget: 600000
      });

      assert.strictEqual(updated.name, 'Monthly Groceries & Household');
      assert.strictEqual(updated.budget, 600000);

      // Verify persistence
      const fetched = await api.getShoppingList('shop_1');
      assert.strictEqual(fetched.name, 'Monthly Groceries & Household');
      assert.strictEqual(fetched.budget, 600000);
    });

    test('rejects update with empty name or negative budget', async () => {
      await assert.rejects(
        () => api.updateShoppingList('shop_1', { name: '   ' }),
        (err) => /required/i.test(err.message)
      );

      await assert.rejects(
        () => api.updateShoppingList('shop_1', { budget: -500 }),
        (err) => /non-negative/i.test(err.message)
      );
    });

    test('removes shopping list and subsequent fetch returns 404', async () => {
      const res = await api.removeShoppingList('shop_3');
      assert.strictEqual(res.ok, true);

      await assert.rejects(
        () => api.getShoppingList('shop_3'),
        (err) => err.status === 404
      );
    });

    test('prevents access to non-existent shopping list', async () => {
      await assert.rejects(
        () => api.getShoppingList('shop_non_existent'),
        (err) => err.status === 404
      );
    });
  });

  // ===========================================================================
  // 2. ITEM CRUD & STATUS TRANSITIONS
  // ===========================================================================
  describe('2. Item CRUD & Status Transitions', () => {
    test('adds an item with required fields, quantity, and unit price in integer paise', async () => {
      const item = await api.addShoppingItem('shop_1', {
        name: 'Fresh Paneer 400g',
        quantity: 2,
        estimatedPrice: 18000 // ₹180
      });

      assert.ok(item.id);
      assert.strictEqual(item.name, 'Fresh Paneer 400g');
      assert.strictEqual(item.quantity, 2);
      assert.strictEqual(item.estimatedPrice, 18000);
      assert.strictEqual(item.actualPrice, null);
      assert.strictEqual(item.purchased, false);

      const list = await api.getShoppingList('shop_1');
      const found = list.items.find((i) => i.id === item.id);
      assert.ok(found);
    });

    test('rejects adding an item without a name', async () => {
      await assert.rejects(
        () => api.addShoppingItem('shop_1', { name: '', quantity: 1 }),
        (err) => err.field === 'name' && /required/i.test(err.message)
      );
    });

    test('toggles item purchased status and defaults actualPrice to estimatedPrice', async () => {
      const item = await api.addShoppingItem('shop_1', {
        name: 'Organic Honey',
        quantity: 1,
        estimatedPrice: 35000
      });

      assert.strictEqual(item.purchased, false);
      assert.strictEqual(item.actualPrice, null);

      // Toggle to purchased
      const toggledOn = await api.toggleShoppingItem('shop_1', item.id);
      assert.strictEqual(toggledOn.purchased, true);
      assert.strictEqual(toggledOn.actualPrice, 35000); // Defaults to estimated price

      // Toggle back to unpurchased
      const toggledOff = await api.toggleShoppingItem('shop_1', item.id);
      assert.strictEqual(toggledOff.purchased, false);
    });

    test('updates item details including actual price and quantity', async () => {
      const list = await api.getShoppingList('shop_1');
      const item = list.items[0];

      const updated = await api.updateShoppingItem('shop_1', item.id, {
        name: 'Premium Basmati Rice, 5 kg',
        quantity: 2,
        estimatedPrice: 70000,
        actualPrice: 72000
      });

      assert.strictEqual(updated.name, 'Premium Basmati Rice, 5 kg');
      assert.strictEqual(updated.quantity, 2);
      assert.strictEqual(updated.estimatedPrice, 70000);
      assert.strictEqual(updated.actualPrice, 72000);
    });

    test('rejects item update with invalid quantity or negative price', async () => {
      const list = await api.getShoppingList('shop_1');
      const item = list.items[0];

      await assert.rejects(
        () => api.updateShoppingItem('shop_1', item.id, { quantity: 0 }),
        (err) => /at least 1/i.test(err.message)
      );

      await assert.rejects(
        () => api.updateShoppingItem('shop_1', item.id, { estimatedPrice: -100 }),
        (err) => /non-negative/i.test(err.message)
      );

      await assert.rejects(
        () => api.updateShoppingItem('shop_1', item.id, { actualPrice: -50 }),
        (err) => /non-negative/i.test(err.message)
      );
    });

    test('removes item from shopping list', async () => {
      const listBefore = await api.getShoppingList('shop_1');
      const countBefore = listBefore.items.length;
      const targetItem = listBefore.items[0];

      const res = await api.removeShoppingItem('shop_1', targetItem.id);
      assert.strictEqual(res.ok, true);

      const listAfter = await api.getShoppingList('shop_1');
      assert.strictEqual(listAfter.items.length, countBefore - 1);
      assert.ok(!listAfter.items.some((i) => i.id === targetItem.id));
    });

    test('rejects removing a nonexistent item', async () => {
      await assert.rejects(
        () => api.removeShoppingItem('shop_1', 'nonexistent_item_id'),
        (err) => err.status === 404
      );
    });
  });

  // ===========================================================================
  // 3. PROGRESS, VARIANCE & EMPTY STATE
  // ===========================================================================
  describe('3. Progress, Variance & Empty State', () => {
    test('calculates estimated total, estimate for bought, and actual paid variance correctly', async () => {
      const list = await api.getShoppingList('shop_2'); // Goa packing list (3 items: 2 bought, 1 pending)
      const items = list.items;

      let estTotal = 0;
      let estBought = 0;
      let actualPaid = 0;
      let boughtCount = 0;

      for (const item of items) {
        const qty = item.quantity || 1;
        const est = item.estimatedPrice * qty;
        estTotal += est;
        if (item.purchased) {
          boughtCount++;
          estBought += est;
          actualPaid += (item.actualPrice !== null ? item.actualPrice : item.estimatedPrice) * qty;
        }
      }

      assert.strictEqual(items.length, 3);
      assert.strictEqual(boughtCount, 2);
      assert.strictEqual(estTotal, 2 * 90000 + 4 * 120000 + 1 * 50000); // 710000 paise (₹7,100)
      assert.strictEqual(estBought, 2 * 90000 + 4 * 120000); // 660000 paise (₹6,600)
      assert.strictEqual(actualPaid, 2 * 85000 + 4 * 120000); // 650000 paise (₹6,500)

      const variancePaise = actualPaid - estBought;
      assert.strictEqual(variancePaise, -10000); // ₹100 under estimate
    });

    test('handles empty shopping list progress and edge cases safely', async () => {
      const emptyList = await api.createShoppingList({ name: 'Empty Test List' });
      assert.strictEqual(emptyList.items.length, 0);

      const items = emptyList.items;
      const boughtCount = items.filter((i) => i.purchased).length;
      const percent = items.length > 0 ? Math.round((boughtCount / items.length) * 100) : 0;

      assert.strictEqual(boughtCount, 0);
      assert.strictEqual(percent, 0);
    });
  });

  // ===========================================================================
  // 4. DUPLICATE-PROTECTED EXPENSE CONVERSION
  // ===========================================================================
  describe('4. Duplicate-Protected Expense Conversion', () => {
    test('converts shopping list into personal expense and prevents duplicate conversion', async () => {
      const createdExpense = await api.convertShoppingListToExpense('shop_1', {
        categoryId: 'cat_shopping',
        paymentMethod: 'UPI'
      });

      assert.ok(createdExpense.id);
      assert.strictEqual(createdExpense.categoryId, 'cat_shopping');
      assert.strictEqual(createdExpense.paymentMethod, 'UPI');
      assert.ok(createdExpense.amount > 0);

      // Verify list now records convertedExpenseId
      const list = await api.getShoppingList('shop_1');
      assert.strictEqual(list.convertedExpenseId, createdExpense.id);

      // Attempting to convert again must fail with 409 Conflict
      await assert.rejects(
        () => api.convertShoppingListToExpense('shop_1', { categoryId: 'cat_shopping' }),
        (err) => err.status === 409 && /already been converted/i.test(err.message)
      );
    });

    test('rejects converting an empty shopping list', async () => {
      const emptyList = await api.createShoppingList({ name: 'Empty Convert Test' });

      await assert.rejects(
        () => api.convertShoppingListToExpense(emptyList.id, 'cat_food'),
        (err) => err.status === 400 && /empty or zero-amount/i.test(err.message)
      );
    });
  });

  // ===========================================================================
  // 5. RECEIPT FILE VALIDATION & FORMATTING
  // ===========================================================================
  describe('5. Receipt File Validation & Formatting', () => {
    test('accepts valid PNG, JPG, JPEG, and WEBP files under 5 MB', () => {
      const validPng = { name: 'grocery-receipt.png', size: 1024 * 500, type: 'image/png' };
      const validJpg = { name: 'cafe-bill.jpg', size: 1024 * 1024 * 2, type: 'image/jpeg' };
      const validWebp = { name: 'supermarket.webp', size: 1024 * 1024 * 4.5, type: 'image/webp' };

      assert.strictEqual(validateReceiptFile(validPng).valid, true);
      assert.strictEqual(validateReceiptFile(validJpg).valid, true);
      assert.strictEqual(validateReceiptFile(validWebp).valid, true);
    });

    test('rejects null, undefined, or empty files', () => {
      assert.strictEqual(validateReceiptFile(null).valid, false);
      assert.strictEqual(validateReceiptFile(undefined).valid, false);
      assert.strictEqual(validateReceiptFile({ name: 'empty.png', size: 0, type: 'image/png' }).valid, false);
    });

    test('rejects files exceeding the 5 MB size limit', () => {
      const oversized = {
        name: 'huge-scan.png',
        size: MAX_RECEIPT_SIZE_BYTES + 100,
        type: 'image/png'
      };

      const result = validateReceiptFile(oversized);
      assert.strictEqual(result.valid, false);
      assert.match(result.error, /exceeds the 5 MB limit/i);
    });

    test('rejects unsupported file formats and MIME types', () => {
      const pdfFile = { name: 'invoice.pdf', size: 200000, type: 'application/pdf' };
      const textFile = { name: 'bill.txt', size: 5000, type: 'text/plain' };
      const gifFile = { name: 'animation.gif', size: 50000, type: 'image/gif' };

      assert.strictEqual(validateReceiptFile(pdfFile).valid, false);
      assert.strictEqual(validateReceiptFile(textFile).valid, false);
      assert.strictEqual(validateReceiptFile(gifFile).valid, false);
    });

    test('formats file size accurately into human-readable B, KB, and MB', () => {
      assert.strictEqual(formatFileSize(500), '500 B');
      assert.strictEqual(formatFileSize(1536), '1.5 KB');
      assert.strictEqual(formatFileSize(2.5 * 1024 * 1024), '2.5 MB');
      assert.strictEqual(formatFileSize(0), '0 B');
    });

    test('sanitizes receipt filenames against path traversal and XSS characters', () => {
      assert.strictEqual(sanitizeReceiptFilename('../../etc/passwd.jpg'), '.._.._etc_passwd.jpg');
      assert.strictEqual(sanitizeReceiptFilename('<script>alert("xss")</script>.png'), 'scriptalert(xss)/script.png'.replace(/[/\\]/g, '_'));
      assert.strictEqual(sanitizeReceiptFilename('normal_receipt.jpg'), 'normal_receipt.jpg');
      assert.strictEqual(sanitizeReceiptFilename(''), 'receipt-image');
    });
  });

  // ===========================================================================
  // 6. HONEST OCR BOUNDARY & CANDIDATE EXTRACTION
  // ===========================================================================
  describe('6. Honest OCR Boundary & Candidate Extraction', () => {
    test('isOcrAvailable honestly reports false in client-side preview mode', () => {
      assert.strictEqual(isOcrAvailable(), false);
    });

    test('getExtractionStatus indicates unavailable when automated OCR is not active', () => {
      const status = getExtractionStatus();
      assert.strictEqual(status.available, false);
      assert.strictEqual(status.status, 'unavailable');
      assert.strictEqual(status.confidence, null);
      assert.match(status.message, /Review 3/i);
    });

    test('parseCandidateReceipt accurately extracts merchant, date, and amount from receipt text', () => {
      const rawText = `Blue Leaf Cafe & Roastery
Koramangala 4th Block, Bengaluru
Dated: 2026-08-25
------------------------------
Item            Qty   Amount
Artisan Cappuccino    2   450.00
Almond Croissant      1   295.00
------------------------------
TOTAL: Rs 745.00
Thank You!`;

      const candidate = parseCandidateReceipt(rawText);
      assert.ok(candidate);
      assert.strictEqual(candidate.merchant, 'Blue Leaf Cafe & Roastery');
      assert.strictEqual(candidate.date, '2026-08-25');
      assert.strictEqual(candidate.amountPaise, 74500); // ₹745.00 -> 74500 paise
      assert.ok(candidate.confidence >= 0.8);

      const candidateStatus = getExtractionStatus(candidate);
      assert.strictEqual(candidateStatus.available, true);
      assert.strictEqual(candidateStatus.status, 'candidate');
    });

    test('parseCandidateReceipt safely handles missing or empty raw text', () => {
      assert.strictEqual(parseCandidateReceipt(''), null);
      assert.strictEqual(parseCandidateReceipt(null), null);
      assert.strictEqual(parseCandidateReceipt('   \n  \n'), null);
    });
  });

  // ===========================================================================
  // 7. RECEIPT DATA LAYER CRUD & USER BOUNDARIES
  // ===========================================================================
  describe('7. Receipt Data Layer CRUD & User Boundaries', () => {
    test('creates and retrieves receipt records for the active user', async () => {
      const receipt = await api.createReceipt({
        merchant: 'Organic Harvest Market',
        amount: 84000,
        date: '2026-10-24',
        rawText: 'ORGANIC HARVEST MARKET TOTAL: INR 840.00',
        confidence: 0.94,
        status: 'confirmed'
      });

      assert.ok(receipt.id);
      assert.strictEqual(receipt.merchant, 'Organic Harvest Market');
      assert.strictEqual(receipt.amount, 84000);
      assert.strictEqual(receipt.userId, 'u_priya');

      const fetched = await api.getReceipt(receipt.id);
      assert.strictEqual(fetched.id, receipt.id);
      assert.strictEqual(fetched.merchant, 'Organic Harvest Market');

      const userReceipts = await api.listReceipts();
      assert.ok(userReceipts.some((r) => r.id === receipt.id));
    });

    test('rejects receipt creation without merchant name', async () => {
      await assert.rejects(
        () => api.createReceipt({ merchant: '' }),
        (err) => err.field === 'merchant' && /required/i.test(err.message)
      );
    });

    test('throws 404 for nonexistent receipt ID', async () => {
      await assert.rejects(
        () => api.getReceipt('nonexistent_receipt'),
        (err) => err.status === 404
      );
    });
  });
});
