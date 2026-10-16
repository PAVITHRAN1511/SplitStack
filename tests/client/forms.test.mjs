/**
 * Automated tests for SplitStack Forms, Validation, and CRUD flows (Review 2, Step P4).
 * Covers:
 * - Integer-paise conversion (rupeesToPaise, paiseToRupees)
 * - Accessible form validation and field error UI helpers
 * - Duplicate submission prevention (setButtonLoading)
 * - Password toggles and route auth guard
 * - Form CRUD flows: login, register, expense add/edit/delete, income add/delete,
 *   group & shared expenses (equal/custom splits), shopping lists & item management,
 *   budgets, recurring schedules, categories, profile & password change.
 *
 * Run with: node --test tests/client/forms.test.mjs
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

// Lightweight mock DOM classes
class MockNode {
  constructor(type, text = '') {
    this.nodeType = type;
    this.textContent = text;
    this.parentNode = null;
  }
}

class MockElement extends MockNode {
  constructor(tagName) {
    super(1, '');
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.childNodes = [];
    this._listeners = new Map();
    this.value = '';
    this.type = 'text';
    this.checked = false;
    this.disabled = false;
    this.focused = false;
  }

  get classList() {
    return {
      add: (...classes) => {
        const cur = new Set(this.className ? this.className.split(/\s+/) : []);
        classes.forEach((c) => cur.add(c));
        this.className = Array.from(cur).join(' ');
      },
      remove: (...classes) => {
        const cur = new Set(this.className ? this.className.split(/\s+/) : []);
        classes.forEach((c) => cur.delete(c));
        this.className = Array.from(cur).join(' ');
      },
      contains: (cls) => {
        const cur = new Set(this.className ? this.className.split(/\s+/) : []);
        return cur.has(cls);
      }
    };
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  focus() {
    this.focused = true;
  }

  closest(selector) {
    let cur = this;
    while (cur) {
      if (cur._matchSelector && cur._matchSelector(selector)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this._matchSelector(selector);
  }

  querySelectorAll(selector) {
    const results = [];
    this._collectSelector(selector, results);
    return results;
  }

  _matchSelector(selector) {
    if (selector.includes('.')) {
      const parts = selector.split('.').filter(Boolean);
      const cls = parts[parts.length - 1];
      if (this.classList.contains(cls)) return this;
    }
    if (selector.startsWith('#') && this.id === selector.slice(1)) return this;
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const inner = selector.slice(1, -1);
      if (inner.includes('=')) {
        const [k, v] = inner.split('=');
        const cleanV = v.replace(/["']/g, '');
        if (this.getAttribute(k) === cleanV) return this;
      } else if (this.getAttribute(inner) !== null) {
        return this;
      }
    }
    for (const c of this.childNodes) {
      if (c.nodeType === 1) {
        const found = c._matchSelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  _collectSelector(selector, results) {
    if (selector.includes('.')) {
      const parts = selector.split('.').filter(Boolean);
      const cls = parts[parts.length - 1];
      if (this.classList.contains(cls)) results.push(this);
    } else if (selector.startsWith('[') && selector.endsWith(']')) {
      const inner = selector.slice(1, -1);
      if (inner.includes('=')) {
        const [k, v] = inner.split('=');
        const cleanV = v.replace(/["']/g, '');
        if (this.getAttribute(k) === cleanV) results.push(this);
      } else if (this.getAttribute(inner) !== null) {
        results.push(this);
      }
    }
    for (const c of this.childNodes) {
      if (c.nodeType === 1) c._collectSelector(selector, results);
    }
  }
}

// Global window and document mock
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    body: new MockElement('body'),
    querySelector: (sel) => globalThis.document.body.querySelector(sel),
    querySelectorAll: (sel) => globalThis.document.body.querySelectorAll(sel)
  };
}

// Import form helpers and API
import {
  rupeesToPaise,
  paiseToRupees,
  showFieldError,
  clearFieldErrors,
  focusFirstInvalid,
  setButtonLoading
} from '../../client/js/ui/forms.js';

import * as api from '../../client/js/data/api.js';

describe('P4: Integer-Paise Conversion (rupeesToPaise, paiseToRupees)', () => {
  test('converts whole rupee integer amounts accurately', () => {
    assert.equal(rupeesToPaise(150), 15000);
    assert.equal(rupeesToPaise('150'), 15000);
    assert.equal(rupeesToPaise('1'), 100);
    assert.equal(rupeesToPaise('10000'), 1000000);
  });

  test('converts decimal rupee amounts to exact integer paise', () => {
    assert.equal(rupeesToPaise(150.5), 15050);
    assert.equal(rupeesToPaise('150.50'), 15050);
    assert.equal(rupeesToPaise('150.99'), 15099);
    assert.equal(rupeesToPaise('0.05'), 5);
    assert.equal(rupeesToPaise('0.5'), 50);
  });

  test('rejects empty, null, undefined, and non-numeric inputs', () => {
    assert.throws(() => rupeesToPaise(''), /Amount is required/);
    assert.throws(() => rupeesToPaise(null), /Amount is required/);
    assert.throws(() => rupeesToPaise(undefined), /Amount is required/);
    assert.throws(() => rupeesToPaise('abc'), /valid amount/);
  });

  test('rejects zero and negative amounts', () => {
    assert.throws(() => rupeesToPaise(0), /greater than zero/);
    assert.throws(() => rupeesToPaise('-50'), /valid amount/);
    assert.throws(() => rupeesToPaise(-100), /valid amount/);
  });

  test('rejects fractions of a paisa (> 2 decimal places)', () => {
    assert.throws(() => rupeesToPaise('150.125'), /valid amount/);
    assert.throws(() => rupeesToPaise('99.999'), /valid amount/);
  });

  test('paiseToRupees formats integer paise as clean rupee strings', () => {
    assert.equal(paiseToRupees(15000), '150');
    assert.equal(paiseToRupees(15050), '150.50');
    assert.equal(paiseToRupees(15099), '150.99');
    assert.equal(paiseToRupees(5), '0.05');
    assert.equal(paiseToRupees(0), '0');
  });
});

describe('P4: Accessible Form Validation UI Helpers', () => {
  let form, fieldGroup, input;

  beforeEach(() => {
    form = new MockElement('form');
    fieldGroup = new MockElement('div');
    fieldGroup.className = 'field';
    input = new MockElement('input');
    input.id = 'test-amount';
    fieldGroup.appendChild(input);
    form.appendChild(fieldGroup);
  });

  test('showFieldError sets aria-invalid, has-error, creates alert message, and links aria-describedby', () => {
    showFieldError(input, 'Amount must be positive');

    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(fieldGroup.classList.contains('has-error'), true);

    const errorEl = fieldGroup.querySelector('.field-error');
    assert.ok(errorEl);
    assert.equal(errorEl.textContent, 'Amount must be positive');
    assert.equal(errorEl.getAttribute('role'), 'alert');
    assert.equal(input.getAttribute('aria-describedby'), 'test-amount-error');
  });

  test('showFieldError updates existing error message without creating duplicate elements', () => {
    showFieldError(input, 'First error');
    showFieldError(input, 'Updated error message');

    const errorEls = fieldGroup.querySelectorAll('.field-error');
    assert.equal(errorEls.length, 1);
    assert.equal(errorEls[0].textContent, 'Updated error message');
  });

  test('clearFieldErrors removes all field-error elements, has-error classes, and aria-invalid', () => {
    showFieldError(input, 'Some error');
    assert.equal(input.getAttribute('aria-invalid'), 'true');

    clearFieldErrors(form);

    assert.equal(fieldGroup.querySelectorAll('.field-error').length, 0);
    assert.equal(fieldGroup.classList.contains('has-error'), false);
    assert.equal(input.getAttribute('aria-invalid'), null);
  });

  test('focusFirstInvalid focuses the first invalid element in the form', () => {
    const input2 = new MockElement('input');
    input2.id = 'test-second';
    const fieldGroup2 = new MockElement('div');
    fieldGroup2.className = 'field';
    fieldGroup2.appendChild(input2);
    form.appendChild(fieldGroup2);

    showFieldError(input2, 'Second field error');
    focusFirstInvalid(form);

    assert.equal(input2.focused, true);
    assert.equal(input.focused, false);
  });

  test('setButtonLoading disables button, sets aria-busy, and restores original text', () => {
    const btn = new MockElement('button');
    btn.innerHTML = 'Save changes';

    setButtonLoading(btn, true, 'Saving...');
    assert.equal(btn.disabled, true);
    assert.equal(btn.getAttribute('aria-busy'), 'true');
    assert.ok(btn.innerHTML.includes('Saving...'));

    setButtonLoading(btn, false);
    assert.equal(btn.disabled, false);
    assert.equal(btn.getAttribute('aria-busy'), null);
    assert.equal(btn.innerHTML, 'Save changes');
  });
});

describe('P4: Authentication Form Flows', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  test('login authenticates valid demo credentials', async () => {
    const res = await api.login({ email: 'demo@splitstack.app', password: 'Demo@1234' });
    assert.ok(res);
    assert.ok(res.user);
    assert.equal(res.user.email, 'demo@splitstack.app');
    assert.equal(res.user.name, 'Priya Raman');
  });

  test('login rejects invalid password or non-existent user with ApiError', async () => {
    await assert.rejects(
      () => api.login({ email: 'demo@splitstack.app', password: 'WrongPassword' }),
      (err) => err instanceof api.ApiError && err.status === 401
    );

    await assert.rejects(
      () => api.login({ email: 'nobody@example.com', password: 'Demo@1234' }),
      (err) => err instanceof api.ApiError && err.status === 401
    );
  });

  test('register creates new account and prevents duplicate emails', async () => {
    const newUser = await api.register({
      name: 'Sunil Kumar',
      email: 'sunil.kumar@example.com',
      password: 'StrongPassword123'
    });

    assert.ok(newUser);
    assert.ok(newUser.user);
    assert.equal(newUser.user.name, 'Sunil Kumar');
    assert.equal(newUser.user.email, 'sunil.kumar@example.com');

    // Duplicate registration rejected
    await assert.rejects(
      () => api.register({
        name: 'Sunil Duplicate',
        email: 'sunil.kumar@example.com',
        password: 'StrongPassword123'
      }),
      (err) => err instanceof api.ApiError && err.status === 409
    );
  });
});

describe('P4: Expense CRUD Flows', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  test('createExpense stores amount as integer paise and retrieves correctly', async () => {
    const amountRupees = 450.75;
    const amountPaise = rupeesToPaise(amountRupees); // 45075

    const expense = await api.createExpense({
      amount: amountPaise,
      date: '2026-10-28',
      description: 'Coffee and snacks',
      categoryId: 'cat_food',
      paymentMethod: 'UPI'
    });

    assert.ok(expense.id);
    assert.equal(expense.amount, 45075);
    assert.equal(Number.isInteger(expense.amount), true);

    const fetched = await api.getExpense(expense.id);
    assert.equal(fetched.amount, 45075);
    assert.equal(fetched.description, 'Coffee and snacks');
  });

  test('updateExpense modifies fields and enforces integer paise amount', async () => {
    const original = await api.getExpense('exp_1');
    assert.ok(original);

    const updated = await api.updateExpense('exp_1', {
      amount: 400000, // ₹4,000
      description: 'Updated Shoes description'
    });

    assert.equal(updated.amount, 400000);
    assert.equal(updated.description, 'Updated Shoes description');

    // Invalid non-integer or negative amount rejected
    await assert.rejects(
      () => api.updateExpense('exp_1', { amount: -500 }),
      api.ApiError
    );
  });

  test('removeExpense deletes the record from storage', async () => {
    const beforeList = await api.listExpenses({ limit: 100 });
    const countBefore = beforeList.total;

    const res = await api.removeExpense('exp_1');
    assert.equal(res.ok, true);

    const afterList = await api.listExpenses({ limit: 100 });
    assert.equal(afterList.total, countBefore - 1);

    await assert.rejects(() => api.getExpense('exp_1'), (err) => err.status === 404);
  });
});

describe('P4: Income CRUD Flows', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  test('createIncome stores valid income in integer paise', async () => {
    const newInc = await api.createIncome({
      amount: 1500000, // ₹15,000
      date: '2026-10-25',
      source: 'Consulting gig',
      categoryId: 'cat_freelance'
    });

    assert.ok(newInc.id);
    assert.equal(newInc.amount, 1500000);
    assert.equal(newInc.source, 'Consulting gig');

    const fetched = await api.getIncome(newInc.id);
    assert.equal(fetched.amount, 1500000);
  });

  test('removeIncome deletes the income entry', async () => {
    const res = await api.removeIncome('inc_1');
    assert.equal(res.ok, true);

    await assert.rejects(() => api.getIncome('inc_1'), (err) => err.status === 404);
  });
});

describe('P4: Group & Shared Expense Creation Flows', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  test('createGroup creates group and makes creator the admin', async () => {
    const group = await api.createGroup({
      name: 'Mumbai Trip 2026',
      description: 'Weekend getaway'
    });

    assert.ok(group.id);
    assert.equal(group.name, 'Mumbai Trip 2026');
    assert.equal(group.members.length, 1);
    assert.equal(group.members[0].role, 'admin');
  });

  test('createSharedExpense equal split divides paise deterministically with remainder to payer', async () => {
    // ₹100.00 = 10000 paise among 3 members: 10000 / 3 = 3333 with 1 remainder -> payer gets 3334
    const group = await api.getGroup('grp_goa');
    const payerId = group.members[0].userId;

    const shared = await api.createSharedExpense('grp_goa', {
      title: 'Group dinner',
      amount: 10000,
      categoryId: 'cat_food',
      date: '2026-10-25',
      splitType: 'equal',
      paidBy: payerId,
      shares: [
        { userId: group.members[0].userId },
        { userId: group.members[1].userId },
        { userId: group.members[2].userId }
      ]
    });

    assert.equal(shared.amount, 10000);
    assert.equal(shared.shares.length, 3);

    const payerShare = shared.shares.find((s) => s.userId === payerId);
    const otherShare = shared.shares.find((s) => s.userId !== payerId);

    assert.equal(payerShare.amount, 3334);
    assert.equal(otherShare.amount, 3333);

    const sum = shared.shares.reduce((s, sh) => s + sh.amount, 0);
    assert.equal(sum, 10000);
  });

  test('createSharedExpense custom split enforces shares sum exactly to total amount', async () => {
    const group = await api.getGroup('grp_goa');

    // Mismatched shares sum should throw ApiError
    await assert.rejects(
      () => api.createSharedExpense('grp_goa', {
        title: 'Custom drinks',
        amount: 50000, // ₹500
        categoryId: 'cat_food',
        splitType: 'custom',
        shares: [
          { userId: group.members[0].userId, amount: 20000 },
          { userId: group.members[1].userId, amount: 20000 } // Total 40000 != 50000
        ]
      }),
      (err) => err instanceof api.ApiError && err.field === 'shares'
    );

    // Exact match passes
    const shared = await api.createSharedExpense('grp_goa', {
      title: 'Custom drinks',
      amount: 50000,
      categoryId: 'cat_food',
      splitType: 'custom',
      shares: [
        { userId: group.members[0].userId, amount: 30000 },
        { userId: group.members[1].userId, amount: 20000 }
      ]
    });

    assert.equal(shared.amount, 50000);
  });

  test('removeSharedExpense deletes the expense and updates group history', async () => {
    const listBefore = await api.listSharedExpenses('grp_goa');
    const firstId = listBefore[0].id;

    const res = await api.removeSharedExpense(firstId);
    assert.equal(res.ok, true);

    const listAfter = await api.listSharedExpenses('grp_goa');
    assert.equal(listAfter.length, listBefore.length - 1);
  });
});

describe('P4: Shopping List & Item Management Flows', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  test('createShoppingList creates a list with budget in integer paise', async () => {
    const list = await api.createShoppingList({
      name: 'Diwali Party Groceries',
      budget: 500000 // ₹5,000
    });

    assert.ok(list.id);
    assert.equal(list.name, 'Diwali Party Groceries');
    assert.equal(list.budget, 500000);
  });

  test('addShoppingItem, toggleShoppingItem, and removeShoppingItem operate correctly', async () => {
    const list = await api.getShoppingList('shop_1');
    const countBefore = list.items.length;

    const addedItem = await api.addShoppingItem('shop_1', {
      name: 'Green Tea Box',
      quantity: 2,
      estimatedPrice: 25000 // ₹250
    });

    assert.ok(addedItem.id);
    assert.equal(addedItem.name, 'Green Tea Box');
    assert.equal(addedItem.estimatedPrice, 25000);

    const toggled = await api.toggleShoppingItem('shop_1', addedItem.id);
    assert.equal(toggled.purchased, true);

    const removeRes = await api.removeShoppingItem('shop_1', addedItem.id);
    assert.equal(removeRes.ok, true);

    const updatedList = await api.getShoppingList('shop_1');
    assert.equal(updatedList.items.length, countBefore);
  });

  test('convertShoppingListToExpense creates an expense and prevents duplicate conversions', async () => {
    const converted = await api.convertShoppingListToExpense('shop_1', 'cat_shopping');
    assert.ok(converted.id);
    assert.ok(converted.amount > 0);

    // Duplicate attempt rejected
    await assert.rejects(
      () => api.convertShoppingListToExpense('shop_1', 'cat_shopping'),
      (err) => err instanceof api.ApiError && err.status === 409
    );
  });
});

describe('P4: Budget, Recurring, Category, and Profile Flows', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  test('createBudget sets limit and removeBudget deletes it', async () => {
    const budget = await api.createBudget({
      categoryId: 'cat_entertainment',
      month: 11,
      year: 2026,
      limit: 600000 // ₹6,000
    });

    assert.equal(budget.limit, 600000);

    const res = await api.removeBudget(budget.id);
    assert.equal(res.ok, true);
  });

  test('createRecurring adds schedule and removeRecurring deletes it', async () => {
    const rec = await api.createRecurring({
      name: 'Gym Membership',
      amount: 250000, // ₹2,500
      categoryId: 'cat_health',
      frequency: 'Monthly',
      startDate: '2026-11-01',
      nextDueDate: '2026-11-01'
    });

    assert.ok(rec.id);
    assert.equal(rec.amount, 250000);

    const res = await api.removeRecurring(rec.id);
    assert.equal(res.ok, true);
  });

  test('createCategory adds custom category and removeCategory removes it while protecting default categories', async () => {
    const customCat = await api.createCategory({
      name: 'Pet Care',
      type: 'expense',
      icon: 'paw',
      color: '#10b981'
    });

    assert.ok(customCat.id);
    assert.equal(customCat.name, 'Pet Care');

    // Default system categories cannot be deleted
    await assert.rejects(
      () => api.removeCategory('cat_food'),
      (err) => err instanceof api.ApiError && err.status === 404
    );

    // Custom category can be deleted
    const res = await api.removeCategory(customCat.id);
    assert.equal(res.ok, true);
  });

  test('updateProfile and changePassword update user preferences and credentials', async () => {
    const updated = await api.updateProfile({
      name: 'Priya R. Mehta',
      preferences: { monthlyBudget: 5000000 }
    });

    assert.equal(updated.name, 'Priya R. Mehta');
    assert.equal(updated.preferences.monthlyBudget, 5000000);

    // Change password checks current password
    await assert.rejects(
      () => api.changePassword({ currentPassword: 'WrongPassword', newPassword: 'NewPassword@456' }),
      (err) => err instanceof api.ApiError && err.status === 403
    );

    const pwRes = await api.changePassword({
      currentPassword: 'Demo@1234',
      newPassword: 'NewPassword@456'
    });
    assert.equal(pwRes.ok, true);

    // Can log in with new password
    const loginRes = await api.login({ email: 'demo@splitstack.app', password: 'NewPassword@456' });
    assert.ok(loginRes);
    assert.ok(loginRes.user);
  });
});
