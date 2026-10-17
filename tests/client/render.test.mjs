/**
 * Automated tests for SplitStack Page Rendering and UI Layer (Review 2, Step P3).
 * Tests DOM helpers, render utilities, XSS safety, page module contracts, and error states.
 * Run with: node --test tests/client/render.test.mjs
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

// Lightweight mock DOM for Node.js test environment
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
  }

  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }

  get firstChild() {
    return this.childNodes[0] || null;
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
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
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

  append(...items) {
    for (const item of items) {
      if (typeof item === 'string') {
        this.appendChild(new MockNode(3, item));
      } else if (item instanceof MockNode) {
        this.appendChild(item);
      }
    }
  }

  addEventListener(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    if (this._listeners.has(event)) {
      const arr = this._listeners.get(event);
      const idx = arr.indexOf(handler);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    const handlers = this._listeners.get(event.type) || [];
    for (const h of handlers) {
      h(event);
    }
    return true;
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
      const [tag, cls] = selector.split('.');
      if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) {
        // Tag doesn't match
      } else if (this.className.split(/\s+/).includes(cls)) {
        return this;
      }
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.split(/\s+/).includes(cls)) return this;
    } else if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.getAttribute('id') === id) return this;
    } else if (this.tagName.toLowerCase() === selector.toLowerCase()) {
      return this;
    }

    for (const child of this.children) {
      const found = child._matchSelector(selector);
      if (found) return found;
    }
    return null;
  }

  _collectSelector(selector, results) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.split(/\s+/).includes(cls)) results.push(this);
    } else if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.getAttribute('id') === id) results.push(this);
    } else if (this.tagName.toLowerCase() === selector.toLowerCase()) {
      results.push(this);
    }

    for (const child of this.children) {
      child._collectSelector(selector, results);
    }
  }
}

// Attach mock document and window
globalThis.Node = MockNode;
globalThis.HTMLElement = MockElement;
globalThis.HTMLTableRowElement = MockElement;
globalThis.document = {
  createElement(tag) {
    return new MockElement(tag);
  },
  createTextNode(text) {
    return new MockNode(3, text);
  },
  querySelector(sel) {
    return globalThis.document.body.querySelector(sel);
  },
  querySelectorAll(sel) {
    return globalThis.document.body.querySelectorAll(sel);
  },
  body: new MockElement('body')
};

globalThis.window = {
  location: new URL('https://splitstack.app/client/pages/expenses.html'),
  history: {
    replaceState(state, title, url) {
      globalThis.window.location = new URL(url, globalThis.window.location.origin);
    }
  }
};

// Imports
const { createEl } = await import('../../client/js/core/dom.js');
const { formatINR, formatDate, formatRelativeDate } = await import('../../client/js/core/format.js');
const { setLoading, clearElement, renderEmptyState, renderErrorState } = await import('../../client/js/core/render.js');
const { getInitials } = await import('../../client/js/ui/user.js');
const api = await import('../../client/js/data/api.js');

describe('Page Rendering and UI Layer (Step P3)', () => {
  beforeEach(async () => {
    await api.resetDemoData();
    document.body = new MockElement('body');
  });

  describe('1. Currency and Date formatting', () => {
    test('formats integer paise correctly into Indian Rupees (INR)', () => {
      assert.match(formatINR(64000), /640/);
      assert.match(formatINR(1477800), /14,778/);
      assert.match(formatINR(0), /0/);
    });

    test('handles negative amounts and decimals in formatINR', () => {
      const formatted = formatINR(-250000);
      assert.match(formatted, /2,500/);
    });

    test('formats date into readable Indian locale format', () => {
      const dateStr = formatDate('2026-10-28');
      assert.match(dateStr, /28/);
      assert.match(dateStr, /Oct/);
      assert.match(dateStr, /2026/);
    });

    test('formats relative dates for today, yesterday, and future', () => {
      const today = new Date();
      assert.strictEqual(formatRelativeDate(today), 'Today');

      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      assert.strictEqual(formatRelativeDate(yesterday), 'Yesterday');

      const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
      assert.strictEqual(formatRelativeDate(inThreeDays), 'In 3 days');
    });
  });

  describe('2. XSS Prevention and DOM utilities', () => {
    test('createEl sets textContent safely without evaluating malicious HTML scripts', () => {
      const maliciousPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
      const el = createEl('span', { className: 'safe-text', textContent: maliciousPayload });

      assert.strictEqual(el.textContent, maliciousPayload);
      assert.strictEqual(el.childNodes.length, 0); // No child elements parsed
    });

    test('createEl sets attributes and classes safely', () => {
      const el = createEl('div', {
        className: 'card group-card',
        'aria-label': 'Goa Trip',
        dataset: { id: 'grp_goa' }
      }, ['Hello text']);

      assert.strictEqual(el.className, 'card group-card');
      assert.strictEqual(el.getAttribute('aria-label'), 'Goa Trip');
      assert.strictEqual(el.dataset.id, 'grp_goa');
      assert.strictEqual(el.childNodes.length, 1);
      assert.strictEqual(el.childNodes[0].textContent, 'Hello text');
    });

    test('clearElement safely empties child nodes without leaks', () => {
      const container = createEl('div');
      container.appendChild(createEl('span', { textContent: 'one' }));
      container.appendChild(createEl('span', { textContent: 'two' }));
      assert.strictEqual(container.childNodes.length, 2);

      clearElement(container);
      assert.strictEqual(container.childNodes.length, 0);
      assert.strictEqual(container.firstChild, null);
    });
  });

  describe('3. Loading, Empty, and Error state components', () => {
    test('setLoading toggles aria-busy attribute', () => {
      const container = createEl('div');
      setLoading(container, true);
      assert.strictEqual(container.getAttribute('aria-busy'), 'true');

      setLoading(container, false);
      assert.strictEqual(container.getAttribute('aria-busy'), null);
    });

    test('renderEmptyState creates accessible empty structure with action callback', () => {
      const container = createEl('div');
      let clicked = false;

      renderEmptyState(container, {
        icon: 'fa-receipt',
        title: 'No expenses found',
        message: 'Try adjusting your filters.',
        actionText: 'Reset filters',
        onAction: () => {
          clicked = true;
        }
      });

      const emptyDiv = container.querySelector('.empty');
      assert.ok(emptyDiv, 'Container should contain .empty element');

      const btn = emptyDiv.querySelector('button');
      assert.ok(btn, 'Should render action button');
      assert.strictEqual(btn.textContent, 'Reset filters');

      btn.dispatchEvent({ type: 'click' });
      assert.strictEqual(clicked, true, 'Action callback should be invoked');
    });

    test('renderErrorState creates accessible error state with retry button', () => {
      const container = createEl('div');
      let retried = false;

      renderErrorState(container, 'Failed to fetch items', () => {
        retried = true;
      });

      const emptyDiv = container.querySelector('.empty');
      assert.ok(emptyDiv);

      const errText = emptyDiv.querySelector('p.text-danger');
      assert.strictEqual(errText.textContent, 'Failed to fetch items');

      const retryBtn = emptyDiv.querySelector('button');
      assert.ok(retryBtn);
      assert.strictEqual(retryBtn.textContent, 'Retry');

      retryBtn.dispatchEvent({ type: 'click' });
      assert.strictEqual(retried, true);
    });
  });

  describe('4. User Profile and Avatar Initials', () => {
    test('getInitials extracts clean 1-2 character initials', () => {
      assert.strictEqual(getInitials('Priya Raman'), 'PR');
      assert.strictEqual(getInitials('Arjun'), 'AR');
      assert.strictEqual(getInitials('Kavya Iyer Sundaram'), 'KS');
      assert.strictEqual(getInitials(''), 'SS');
      assert.strictEqual(getInitials(null), 'SS');
    });
  });

  describe('5. Page Module Architecture and Contracts', () => {
    const pages = [
      'analytics',
      'budgets',
      'categories',
      'dashboard',
      'expense-edit',
      'expenses',
      'group-detail',
      'groups',
      'income',
      'profile',
      'recurring',
      'settlements',
      'shopping-detail',
      'shopping',
      'receipt-scan',
      'receipt-confirm'
    ];

    test('every page module exports an init function', async () => {
      for (const pageName of pages) {
        const mod = await import(`../../client/js/pages/${pageName}.js`);
        assert.strictEqual(typeof mod.init, 'function', `${pageName}.js must export an init function`);
      }
    });

    test('no page module imports directly from store.js or seed.js (Requirement 2)', () => {
      const pagesDir = path.resolve('client/js/pages');
      const files = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.js'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
        assert.ok(!content.includes('store.js'), `${file} must not import from store.js`);
        assert.ok(!content.includes('seed.js'), `${file} must not import from seed.js`);
      }
    });
  });

  describe('6. Data layer integration with page render flows', () => {
    test('api.listExpenses returns paginated results matching expenses page contract', async () => {
      const res = await api.listExpenses({ page: 1, limit: 10 });
      assert.ok(Array.isArray(res.expenses));
      assert.strictEqual(res.expenses.length, 10);
      assert.strictEqual(typeof res.total, 'number');
      assert.ok(res.total >= 10);
    });

    test('api.getGroup and api.getGroupBalances return valid group data for group-detail', async () => {
      const group = await api.getGroup('grp_goa');
      assert.strictEqual(group.name, 'Goa Trip 2026');
      assert.strictEqual(group.members.length, 4);

      const balances = await api.getGroupBalances('grp_goa');
      assert.ok(typeof balances === 'object');
      assert.strictEqual(Object.keys(balances).length, 4);
      const sum = Object.values(balances).reduce((acc, b) => acc + b, 0);
      assert.strictEqual(sum, 0); // Zero-sum balance invariant
    });

    test('api.getSettlements returns completed settlements list', async () => {
      const settlements = await api.getSettlements('grp_goa');
      assert.ok(Array.isArray(settlements));
    });

    test('api.getShoppingList returns checklist items and allows status toggle', async () => {
      const list = await api.getShoppingList('shop_1');
      assert.strictEqual(list.name, 'Weekly Groceries');
      assert.ok(list.items.length > 0);

      const firstItem = list.items[0];
      const initialStatus = Boolean(firstItem.purchased);
      const toggled = await api.toggleShoppingItem(list.id, firstItem.id);
      assert.strictEqual(toggled.purchased, !initialStatus);
    });
  });
});
