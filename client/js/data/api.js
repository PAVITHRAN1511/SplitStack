/**
 * SplitStack Client Data Layer (Review 2).
 * Exposes async functions that match the exact contract of the future Review 3 REST API.
 * In Review 2, this is backed by localStorage via store.js.
 * In Review 3, this file or api-http.js will simply swap the implementation to fetch().
 *
 * All monetary amounts are handled as integer paise (1 Rupee = 100 paise).
 */

import { loadStore, saveStore, generateId, reset as resetStore, getSessionUserId, setSessionUserId } from './store.js';

/**
 * Standard API error structure matching the backend response.
 */
export class ApiError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [options]
   * @param {string|null} [options.field=null] - Form field name associated with the error
   * @param {number} [options.status=400] - HTTP status code equivalent
   */
  constructor(message, { field = null, status = 400 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.field = field;
    this.status = status;
  }
}

/**
 * Hash a password using SHA-256 + salt via Web Crypto API.
 * NOTE: This client-side hashing is for demo/localStorage mode only.
 * The production Review 3 Node.js + Express server will use bcrypt (cost 12).
 * @param {string} password - Raw password
 * @param {string} salt - Random or unique salt
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(buffer));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Require an authenticated user session.
 * @returns {Object} Active user record
 * @throws {ApiError} 401 if unauthenticated
 */
function requireAuth(store) {
  const userId = getSessionUserId();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    throw new ApiError('Authentication required. Please sign in.', { status: 401 });
  }
  return user;
}

// =============================================================================
// AUTHENTICATION & USER PROFILE
// =============================================================================

/**
 * Register a new user account.
 * @param {Object} params
 * @param {string} params.name - Full name
 * @param {string} params.email - Email address
 * @param {string} params.password - Plaintext password (min 8 chars)
 * @returns {Promise<{ user: Object, token: string }>}
 */
export async function register({ name, email, password }) {
  if (!name || !name.trim()) {
    throw new ApiError('Full name is required', { field: 'name', status: 400 });
  }
  if (!email || !email.includes('@')) {
    throw new ApiError('Valid email address is required', { field: 'email', status: 400 });
  }
  if (!password || password.length < 8) {
    throw new ApiError('Password must be at least 8 characters long', { field: 'password', status: 400 });
  }

  const store = loadStore();
  const normalizedEmail = email.trim().toLowerCase();

  if (store.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    throw new ApiError('An account with this email already exists', { field: 'email', status: 409 });
  }

  const salt = generateId();
  const passwordHash = await hashPassword(password, salt);

  const newUser = {
    id: generateId(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    salt,
    preferences: { theme: 'system', currency: 'INR' },
    createdAt: new Date().toISOString()
  };

  store.users.push(newUser);
  saveStore(store);
  setSessionUserId(newUser.id);

  const { passwordHash: _, salt: __, ...safeUser } = newUser;
  return { user: safeUser, token: `demo-token-${newUser.id}` };
}

/**
 * Authenticate user with email and password.
 * @param {Object} params
 * @param {string} params.email - User email
 * @param {string} params.password - User password
 * @returns {Promise<{ user: Object, token: string }>}
 */
export async function login({ email, password }) {
  if (!email) throw new ApiError('Email is required', { field: 'email', status: 400 });
  if (!password) throw new ApiError('Password is required', { field: 'password', status: 400 });

  const store = loadStore();
  const normalizedEmail = email.trim().toLowerCase();
  const user = store.users.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (!user || !user.passwordHash) {
    throw new ApiError('Invalid email or password', { status: 401 });
  }

  const computedHash = await hashPassword(password, user.salt || 'splitstack_demo_salt');
  if (computedHash !== user.passwordHash) {
    throw new ApiError('Invalid email or password', { status: 401 });
  }

  setSessionUserId(user.id);

  const { passwordHash: _, salt: __, ...safeUser } = user;
  return { user: safeUser, token: `demo-token-${user.id}` };
}

/**
 * End the current user session.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function logout() {
  setSessionUserId(null);
  return { ok: true };
}

/**
 * Get the currently authenticated user.
 * @returns {Promise<Object|null>} Safe user object or null
 */
export async function currentUser() {
  const store = loadStore();
  const userId = getSessionUserId();
  if (!userId) return null;

  const user = store.users.find((u) => u.id === userId);
  if (!user) return null;

  const { passwordHash: _, salt: __, ...safeUser } = user;
  return safeUser;
}

/**
 * Update the signed-in user's profile and preferences.
 * @param {Object} params
 * @param {string} [params.name]
 * @param {string} [params.email]
 * @param {Object} [params.preferences]
 * @returns {Promise<Object>} Updated safe user
 */
export async function updateProfile({ name, email, preferences } = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  if (name !== undefined) {
    if (!name.trim()) throw new ApiError('Name cannot be empty', { field: 'name' });
    user.name = name.trim();
  }

  if (email !== undefined) {
    const norm = email.trim().toLowerCase();
    if (!norm.includes('@')) throw new ApiError('Invalid email', { field: 'email' });
    const conflict = store.users.find((u) => u.email.toLowerCase() === norm && u.id !== user.id);
    if (conflict) throw new ApiError('Email already in use', { field: 'email', status: 409 });
    user.email = norm;
  }

  if (preferences && typeof preferences === 'object') {
    user.preferences = { ...user.preferences, ...preferences };
  }

  saveStore(store);
  const { passwordHash: _, salt: __, ...safeUser } = user;
  return safeUser;
}

/**
 * Change the signed-in user's password.
 * @param {Object} params
 * @param {string} params.currentPassword
 * @param {string} params.newPassword
 * @returns {Promise<{ ok: boolean }>}
 */
export async function changePassword({ currentPassword, newPassword }) {
  if (!currentPassword) throw new ApiError('Current password required', { field: 'currentPassword' });
  if (!newPassword || newPassword.length < 8) {
    throw new ApiError('New password must be at least 8 characters', { field: 'newPassword' });
  }

  const store = loadStore();
  const user = requireAuth(store);

  const currentComputed = await hashPassword(currentPassword, user.salt || 'splitstack_demo_salt');
  if (currentComputed !== user.passwordHash) {
    throw new ApiError('Current password is incorrect', { field: 'currentPassword', status: 403 });
  }

  user.salt = generateId();
  user.passwordHash = await hashPassword(newPassword, user.salt);
  saveStore(store);

  return { ok: true };
}

// =============================================================================
// EXPENSES
// =============================================================================

/**
 * List personal expenses with filter, search, sort, and pagination.
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search='']
 * @param {string} [params.categoryId='']
 * @param {string} [params.paymentMethod='']
 * @param {string} [params.startDate='']
 * @param {string} [params.endDate='']
 * @param {string} [params.sort='date_desc']
 * @returns {Promise<{ items: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
export async function listExpenses({
  page = 1,
  limit = 10,
  search = '',
  categoryId = '',
  paymentMethod = '',
  startDate = '',
  endDate = '',
  sort = 'date_desc'
} = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  let list = store.expenses.filter((e) => e.userId === user.id);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((e) => (e.description || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q));
  }

  if (categoryId) {
    list = list.filter((e) => e.categoryId === categoryId);
  }

  if (paymentMethod) {
    list = list.filter((e) => (e.paymentMethod || '').toLowerCase() === paymentMethod.toLowerCase());
  }

  if (startDate) {
    list = list.filter((e) => e.date >= startDate);
  }

  if (endDate) {
    list = list.filter((e) => e.date <= endDate);
  }

  // Sorting
  list.sort((a, b) => {
    if (sort === 'date_asc') return a.date.localeCompare(b.date);
    if (sort === 'amount_desc') return b.amount - a.amount;
    if (sort === 'amount_asc') return a.amount - b.amount;
    return b.date.localeCompare(a.date); // default 'date_desc'
  });

  const total = list.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * limit;
  const items = list.slice(startIndex, startIndex + limit);

  return { items, expenses: items, total, page: safePage, limit, totalPages };
}

/**
 * Get an expense by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getExpense(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const item = store.expenses.find((e) => e.id === id && e.userId === user.id);
  if (!item) throw new ApiError('Expense not found', { status: 404 });
  return item;
}

/**
 * Create a new personal expense.
 * @param {Object} params
 * @param {string} params.categoryId
 * @param {number} params.amount - Integer paise (amount > 0)
 * @param {string} params.date - YYYY-MM-DD
 * @param {string} params.description
 * @param {string} [params.paymentMethod='UPI']
 * @param {string} [params.notes='']
 * @returns {Promise<Object>}
 */
export async function createExpense({ categoryId, amount, date, description, paymentMethod = 'UPI', notes = '' }) {
  if (!categoryId) throw new ApiError('Category is required', { field: 'categoryId' });
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    throw new ApiError('Amount must be a positive integer in paise', { field: 'amount' });
  }
  if (!date) throw new ApiError('Date is required', { field: 'date' });
  if (!description || !description.trim()) {
    throw new ApiError('Description is required', { field: 'description' });
  }

  const store = loadStore();
  const user = requireAuth(store);

  const newExpense = {
    id: generateId(),
    userId: user.id,
    categoryId,
    amount,
    date,
    description: description.trim(),
    paymentMethod,
    notes: (notes || '').trim(),
    createdAt: new Date().toISOString()
  };

  store.expenses.unshift(newExpense);
  saveStore(store);
  return newExpense;
}

/**
 * Update an existing expense.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateExpense(id, data) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.expenses.findIndex((e) => e.id === id && e.userId === user.id);
  if (index === -1) throw new ApiError('Expense not found', { status: 404 });

  if (data.amount !== undefined && (data.amount <= 0 || !Number.isInteger(data.amount))) {
    throw new ApiError('Amount must be positive integer paise', { field: 'amount' });
  }

  store.expenses[index] = { ...store.expenses[index], ...data, id, userId: user.id };
  saveStore(store);
  return store.expenses[index];
}

/**
 * Remove an expense.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeExpense(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.expenses.findIndex((e) => e.id === id && e.userId === user.id);
  if (index === -1) throw new ApiError('Expense not found', { status: 404 });

  store.expenses.splice(index, 1);
  saveStore(store);
  return { ok: true, id };
}

// =============================================================================
// INCOME
// =============================================================================

/**
 * List income records.
 * @param {Object} [params]
 * @returns {Promise<{ items: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
export async function listIncome({
  page = 1,
  limit = 10,
  search = '',
  categoryId = '',
  startDate = '',
  endDate = '',
  sort = 'date_desc'
} = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  let list = store.income.filter((i) => i.userId === user.id);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((i) => (i.source || '').toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q));
  }

  if (categoryId) list = list.filter((i) => i.categoryId === categoryId);
  if (startDate) list = list.filter((i) => i.date >= startDate);
  if (endDate) list = list.filter((i) => i.date <= endDate);

  list.sort((a, b) => {
    if (sort === 'date_asc') return a.date.localeCompare(b.date);
    if (sort === 'amount_desc') return b.amount - a.amount;
    if (sort === 'amount_asc') return a.amount - b.amount;
    return b.date.localeCompare(a.date);
  });

  const total = list.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * limit;
  const items = list.slice(startIndex, startIndex + limit);

  return { items, income: items, total, page: safePage, limit, totalPages };
}

/**
 * Get income by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getIncome(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const item = store.income.find((i) => i.id === id && i.userId === user.id);
  if (!item) throw new ApiError('Income record not found', { status: 404 });
  return item;
}

/**
 * Create an income record.
 * @param {Object} params
 * @param {string} params.categoryId
 * @param {number} params.amount - Integer paise
 * @param {string} params.date - YYYY-MM-DD
 * @param {string} params.source
 * @param {string} [params.paymentMethod='Net banking']
 * @param {string} [params.notes='']
 * @returns {Promise<Object>}
 */
export async function createIncome({ categoryId, amount, date, source, paymentMethod = 'Net banking', notes = '' }) {
  if (!categoryId) throw new ApiError('Category is required', { field: 'categoryId' });
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    throw new ApiError('Amount must be positive integer paise', { field: 'amount' });
  }
  if (!date) throw new ApiError('Date is required', { field: 'date' });
  if (!source || !source.trim()) throw new ApiError('Source is required', { field: 'source' });

  const store = loadStore();
  const user = requireAuth(store);

  const newIncome = {
    id: generateId(),
    userId: user.id,
    categoryId,
    amount,
    date,
    source: source.trim(),
    paymentMethod,
    notes: (notes || '').trim(),
    createdAt: new Date().toISOString()
  };

  store.income.unshift(newIncome);
  saveStore(store);
  return newIncome;
}

/**
 * Update an income record.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateIncome(id, data) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.income.findIndex((i) => i.id === id && i.userId === user.id);
  if (index === -1) throw new ApiError('Income record not found', { status: 404 });

  if (data.amount !== undefined && (data.amount <= 0 || !Number.isInteger(data.amount))) {
    throw new ApiError('Amount must be positive integer paise', { field: 'amount' });
  }

  store.income[index] = { ...store.income[index], ...data, id, userId: user.id };
  saveStore(store);
  return store.income[index];
}

/**
 * Remove an income record.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeIncome(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.income.findIndex((i) => i.id === id && i.userId === user.id);
  if (index === -1) throw new ApiError('Income record not found', { status: 404 });

  store.income.splice(index, 1);
  saveStore(store);
  return { ok: true, id };
}

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * List available categories (global defaults + user custom categories).
 * @param {Object} [params]
 * @param {'expense'|'income'} [params.type]
 * @returns {Promise<Object[]>}
 */
export async function listCategories(filter = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  const type = typeof filter === 'string' ? filter : filter?.type || null;
  let list = store.categories.filter((c) => c.userId === null || c.userId === user.id);
  if (type) {
    list = list.filter((c) => c.type === type);
  }
  return list;
}

/**
 * Get category by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getCategory(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const cat = store.categories.find((c) => c.id === id && (c.userId === null || c.userId === user.id));
  if (!cat) throw new ApiError('Category not found', { status: 404 });
  return cat;
}

/**
 * Create a new user-custom category.
 * @param {Object} params
 * @param {string} params.name
 * @param {'expense'|'income'} params.type
 * @param {string} [params.icon='tag']
 * @param {string} [params.color='#6366f1']
 * @returns {Promise<Object>}
 */
export async function createCategory({ name, type, icon = 'tag', color = '#6366f1' }) {
  if (!name || !name.trim()) throw new ApiError('Category name required', { field: 'name' });
  if (type !== 'expense' && type !== 'income') throw new ApiError('Invalid category type', { field: 'type' });

  const store = loadStore();
  const user = requireAuth(store);

  const newCat = {
    id: generateId(),
    userId: user.id,
    name: name.trim(),
    type,
    icon,
    color
  };

  store.categories.push(newCat);
  saveStore(store);
  return newCat;
}

/**
 * Update a user category.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateCategory(id, data) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.categories.findIndex((c) => c.id === id && c.userId === user.id);
  if (index === -1) throw new ApiError('Category not found or is a built-in default', { status: 404 });

  store.categories[index] = { ...store.categories[index], ...data, id, userId: user.id };
  saveStore(store);
  return store.categories[index];
}

/**
 * Remove a user category.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeCategory(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.categories.findIndex((c) => c.id === id && c.userId === user.id);
  if (index === -1) throw new ApiError('Category not found or is a built-in default', { status: 404 });

  store.categories.splice(index, 1);
  saveStore(store);
  return { ok: true };
}

// =============================================================================
// BUDGETS
// =============================================================================

/**
 * List budgets with live computed spending progress and statuses.
 * @param {Object} [params]
 * @param {number} [params.month=10]
 * @param {number} [params.year=2026]
 * @returns {Promise<Object[]>}
 */
export async function listBudgets({ month = 10, year = 2026 } = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  const userBudgets = store.budgets.filter((b) => b.userId === user.id && b.month === month && b.year === year);

  // Month date prefix for matching expenses (e.g. "2026-10")
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthExpenses = store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(prefix));

  return userBudgets.map((b) => {
    let spent = 0;
    if (b.categoryId === null) {
      // Overall budget
      spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    } else {
      spent = monthExpenses.filter((e) => e.categoryId === b.categoryId).reduce((sum, e) => sum + e.amount, 0);
    }

    const percentage = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
    let status = 'ok';
    if (percentage > 100) status = 'danger';
    else if (percentage >= 90) status = 'warning';
    else if (percentage >= 75) status = 'caution';

    return {
      ...b,
      spent,
      remaining: Math.max(0, b.limit - spent),
      percentage,
      status
    };
  });
}

/**
 * Create or set a budget limit.
 * @param {Object} params
 * @param {string|null} params.categoryId
 * @param {number} params.month
 * @param {number} params.year
 * @param {number} params.limit - Integer paise
 * @returns {Promise<Object>}
 */
export async function createBudget({ categoryId = null, month, year, limit }) {
  if (!month || month < 1 || month > 12) throw new ApiError('Invalid month', { field: 'month' });
  if (!year || year < 2000) throw new ApiError('Invalid year', { field: 'year' });
  if (!limit || limit <= 0 || !Number.isInteger(limit)) throw new ApiError('Limit must be positive integer paise', { field: 'limit' });

  const store = loadStore();
  const user = requireAuth(store);

  const existingIndex = store.budgets.findIndex(
    (b) => b.userId === user.id && b.categoryId === categoryId && b.month === month && b.year === year
  );

  if (existingIndex !== -1) {
    store.budgets[existingIndex].limit = limit;
    saveStore(store);
    return store.budgets[existingIndex];
  }

  const newBudget = {
    id: generateId(),
    userId: user.id,
    categoryId,
    month,
    year,
    limit
  };

  store.budgets.push(newBudget);
  saveStore(store);
  return newBudget;
}

/**
 * Update budget limit.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateBudget(id, data) {
  const store = loadStore();
  const user = requireAuth(store);

  const b = store.budgets.find((item) => item.id === id && item.userId === user.id);
  if (!b) throw new ApiError('Budget not found', { status: 404 });

  if (data.limit !== undefined) {
    if (!data.limit || data.limit <= 0 || !Number.isInteger(data.limit)) {
      throw new ApiError('Limit must be positive integer paise', { field: 'limit' });
    }
    b.limit = data.limit;
  }

  saveStore(store);
  return b;
}

/**
 * Remove budget.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeBudget(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.budgets.findIndex((b) => b.id === id && b.userId === user.id);
  if (index === -1) throw new ApiError('Budget not found', { status: 404 });

  store.budgets.splice(index, 1);
  saveStore(store);
  return { ok: true };
}

// =============================================================================
// RECURRING PAYMENTS
// =============================================================================

/**
 * List all recurring payment schedules.
 * @returns {Promise<Object[]>}
 */
export async function listRecurring() {
  const store = loadStore();
  const user = requireAuth(store);
  return store.recurring.filter((r) => r.userId === user.id);
}

/**
 * Create a new recurring payment schedule.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function createRecurring({ name, amount, categoryId, frequency, startDate, nextDueDate, active = true }) {
  if (!name || !name.trim()) throw new ApiError('Name is required', { field: 'name' });
  if (!amount || amount <= 0 || !Number.isInteger(amount)) throw new ApiError('Amount must be positive integer paise', { field: 'amount' });
  if (!frequency) throw new ApiError('Frequency is required', { field: 'frequency' });

  const store = loadStore();
  const user = requireAuth(store);

  const item = {
    id: generateId(),
    userId: user.id,
    name: name.trim(),
    amount,
    categoryId,
    frequency,
    startDate: startDate || new Date().toISOString().slice(0, 10),
    nextDueDate: nextDueDate || startDate,
    active: Boolean(active)
  };

  store.recurring.push(item);
  saveStore(store);
  return item;
}

/**
 * Toggle the active state of a recurring payment.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function toggleRecurring(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const item = store.recurring.find((r) => r.id === id && r.userId === user.id);
  if (!item) throw new ApiError('Recurring item not found', { status: 404 });

  item.active = !item.active;
  saveStore(store);
  return item;
}

/**
 * Remove a recurring payment schedule.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeRecurring(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const index = store.recurring.findIndex((r) => r.id === id && r.userId === user.id);
  if (index === -1) throw new ApiError('Recurring item not found', { status: 404 });

  store.recurring.splice(index, 1);
  saveStore(store);
  return { ok: true };
}

// =============================================================================
// GROUPS & SHARED EXPENSES
// =============================================================================

/**
 * List groups where current user is a member.
 * @returns {Promise<Object[]>}
 */
export async function listGroups() {
  const store = loadStore();
  const user = requireAuth(store);

  return store.groups.filter((g) => g.members.some((m) => m.userId === user.id));
}

/**
 * Get group detail by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getGroup(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === id && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found or you are not a member', { status: 404 });
  return group;
}

/**
 * Create a new group.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.description='']
 * @param {string[]} [params.memberEmails=[]]
 * @returns {Promise<Object>}
 */
export async function createGroup({ name, description = '', memberEmails = [] }) {
  if (!name || !name.trim()) throw new ApiError('Group name is required', { field: 'name' });

  const store = loadStore();
  const user = requireAuth(store);

  const members = [
    {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: 'admin',
      joinedAt: new Date().toISOString()
    }
  ];

  // Add additional members by email if they exist in store
  for (const rawEmail of memberEmails) {
    const email = rawEmail.trim().toLowerCase();
    if (email === user.email.toLowerCase()) continue;
    const foundUser = store.users.find((u) => u.email.toLowerCase() === email);
    members.push({
      userId: foundUser ? foundUser.id : generateId(),
      name: foundUser ? foundUser.name : email.split('@')[0],
      email,
      role: 'member',
      joinedAt: new Date().toISOString()
    });
  }

  const newGroup = {
    id: generateId(),
    name: name.trim(),
    description: description.trim(),
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    members
  };

  store.groups.push(newGroup);
  saveStore(store);
  return newGroup;
}

/**
 * Add a member to an existing group.
 * @param {string} groupId
 * @param {string} email
 * @returns {Promise<Object>}
 */
export async function addMember(groupId, email) {
  if (!email || !email.includes('@')) throw new ApiError('Valid email is required', { field: 'email' });

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const norm = email.trim().toLowerCase();
  if (group.members.some((m) => m.email.toLowerCase() === norm)) {
    throw new ApiError('User is already a member of this group', { field: 'email', status: 409 });
  }

  const existingUser = store.users.find((u) => u.email.toLowerCase() === norm);
  const newMember = {
    userId: existingUser ? existingUser.id : generateId(),
    name: existingUser ? existingUser.name : norm.split('@')[0],
    email: norm,
    role: 'member',
    joinedAt: new Date().toISOString()
  };

  group.members.push(newMember);
  saveStore(store);
  return group;
}

/**
 * Remove a member from a group (admin only).
 * @param {string} groupId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function removeMember(groupId, userId) {
  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId);
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const currentMember = group.members.find((m) => m.userId === user.id);
  if (!currentMember || currentMember.role !== 'admin') {
    throw new ApiError('Admin permissions required to remove members', { status: 403 });
  }

  group.members = group.members.filter((m) => m.userId !== userId);
  saveStore(store);
  return group;
}

/**
 * Leave a group.
 * @param {string} groupId
 * @returns {Promise<{ ok: boolean }>}
 */
export async function leaveGroup(groupId) {
  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId);
  if (!group) throw new ApiError('Group not found', { status: 404 });

  group.members = group.members.filter((m) => m.userId !== user.id);
  saveStore(store);
  return { ok: true };
}

/**
 * List shared expenses for a group.
 * @param {string} groupId
 * @returns {Promise<Object[]>}
 */
export async function listSharedExpenses(groupId) {
  const store = loadStore();
  const user = requireAuth(store);

  const isMember = store.groups.some((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!isMember) throw new ApiError('Group not found or access denied', { status: 404 });

  return store.sharedExpenses.filter((se) => se.groupId === groupId);
}

/**
 * Create a shared expense within a group.
 * @param {string} groupId
 * @param {Object} params
 * @param {string} params.title
 * @param {number} params.amount - Integer paise
 * @param {string} params.categoryId
 * @param {string} params.date
 * @param {'equal'|'custom'} params.splitType
 * @param {Object[]} params.shares - [{ userId, amount }]
 * @param {string} [params.paidBy]
 * @returns {Promise<Object>}
 */
export async function createSharedExpense(groupId, { title, amount, categoryId, date, splitType = 'equal', shares = [], paidBy }) {
  if (!title || !title.trim()) throw new ApiError('Title is required', { field: 'title' });
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    throw new ApiError('Amount must be positive integer paise', { field: 'amount' });
  }

  const store = loadStore();
  const user = requireAuth(store);
  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const payerId = paidBy || user.id;

  // Validate shares
  let computedShares = shares;
  if (splitType === 'equal') {
    const memberCount = group.members.length;
    const baseShare = Math.floor(amount / memberCount);
    const remainder = amount % memberCount;

    computedShares = group.members.map((m, idx) => ({
      userId: m.userId,
      amount: m.userId === payerId ? baseShare + remainder : baseShare
    }));
  } else {
    const totalShares = shares.reduce((sum, s) => sum + s.amount, 0);
    if (totalShares !== amount) {
      throw new ApiError(`Custom shares must sum exactly to total amount (${amount} paise)`, { field: 'shares' });
    }
  }

  const newShared = {
    id: generateId(),
    groupId,
    title: title.trim(),
    amount,
    categoryId,
    date: date || new Date().toISOString().slice(0, 10),
    splitType,
    paidBy: payerId,
    shares: computedShares,
    createdAt: new Date().toISOString()
  };

  store.sharedExpenses.unshift(newShared);
  saveStore(store);
  return newShared;
}

/**
 * Get net member balances for a group.
 * Balance = amount paid - amount owed.
 * Positive = is owed money (creditor); Negative = owes money (debtor).
 * @param {string} groupId
 * @returns {Promise<Record<string, number>>} Map of userId -> balance in paise
 */
export async function getGroupBalances(groupId) {
  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const balances = {};
  group.members.forEach((m) => {
    balances[m.userId] = 0;
  });

  const shared = store.sharedExpenses.filter((se) => se.groupId === groupId);
  for (const se of shared) {
    balances[se.paidBy] = (balances[se.paidBy] || 0) + se.amount;
    for (const share of se.shares) {
      balances[share.userId] = (balances[share.userId] || 0) - share.amount;
    }
  }

  // Adjust for completed settlements
  const completed = store.settlements.filter((s) => s.groupId === groupId && s.status === 'completed');
  for (const stl of completed) {
    balances[stl.payerId] = (balances[stl.payerId] || 0) + stl.amount;
    balances[stl.payeeId] = (balances[stl.payeeId] || 0) - stl.amount;
  }

  return balances;
}

/**
 * List settlements for a group.
 * @param {string} groupId
 * @returns {Promise<Object[]>}
 */
export async function getSettlements(groupId) {
  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  return store.settlements.filter((s) => s.groupId === groupId);
}

/**
 * Record a payment / settle up transaction.
 * @param {string} groupId
 * @param {Object} params
 * @param {string} params.payerId
 * @param {string} params.payeeId
 * @param {number} params.amount - Integer paise
 * @returns {Promise<Object>}
 */
export async function recordSettlement(groupId, { payerId, payeeId, amount }) {
  if (!payerId || !payeeId) throw new ApiError('Payer and payee are required');
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    throw new ApiError('Amount must be positive integer paise');
  }

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const settlement = {
    id: generateId(),
    groupId,
    payerId,
    payeeId,
    amount,
    status: 'completed',
    completedAt: new Date().toISOString()
  };

  store.settlements.push(settlement);
  saveStore(store);
  return settlement;
}

// =============================================================================
// SHOPPING LISTS
// =============================================================================

/**
 * List shopping lists owned by the user or their groups.
 * @returns {Promise<Object[]>}
 */
export async function listShoppingLists() {
  const store = loadStore();
  const user = requireAuth(store);

  return store.shoppingLists.filter((sl) => sl.ownerId === user.id);
}

/**
 * Get shopping list by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getShoppingList(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const list = store.shoppingLists.find((sl) => sl.id === id && sl.ownerId === user.id);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });
  return list;
}

/**
 * Create a new shopping list.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function createShoppingList({ name, budget = 0, groupId = null, items = [] }) {
  if (!name || !name.trim()) throw new ApiError('Name is required', { field: 'name' });

  const store = loadStore();
  const user = requireAuth(store);

  const newList = {
    id: generateId(),
    ownerId: user.id,
    groupId,
    name: name.trim(),
    budget: Math.max(0, budget || 0),
    convertedExpenseId: null,
    createdAt: new Date().toISOString(),
    items: (items || []).map((it) => ({
      id: generateId(),
      name: it.name,
      quantity: it.quantity || 1,
      estimatedPrice: it.estimatedPrice || 0,
      actualPrice: it.actualPrice || null,
      purchased: Boolean(it.purchased),
      assignedTo: it.assignedTo || null
    }))
  };

  store.shoppingLists.push(newList);
  saveStore(store);
  return newList;
}

/**
 * Update shopping list metadata.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateShoppingList(id, data) {
  const store = loadStore();
  const user = requireAuth(store);

  const list = store.shoppingLists.find((sl) => sl.id === id && sl.ownerId === user.id);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  Object.assign(list, data, { id, ownerId: user.id });
  saveStore(store);
  return list;
}

/**
 * Remove a shopping list.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeShoppingList(id) {
  const store = loadStore();
  const user = requireAuth(store);

  const idx = store.shoppingLists.findIndex((sl) => sl.id === id && sl.ownerId === user.id);
  if (idx === -1) throw new ApiError('Shopping list not found', { status: 404 });

  store.shoppingLists.splice(idx, 1);
  saveStore(store);
  return { ok: true };
}

/**
 * Add an item to a shopping list.
 * @param {string} listId
 * @param {Object} itemData
 * @returns {Promise<Object>} The added item
 */
export async function addShoppingItem(listId, { name, quantity = 1, estimatedPrice = 0, actualPrice = null, assignedTo = null }) {
  if (!name || !name.trim()) throw new ApiError('Item name is required', { field: 'name' });

  const store = loadStore();
  const user = requireAuth(store);

  const list = store.shoppingLists.find((sl) => sl.id === listId && sl.ownerId === user.id);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  const newItem = {
    id: generateId(),
    name: name.trim(),
    quantity: Math.max(1, quantity),
    estimatedPrice: Math.max(0, estimatedPrice),
    actualPrice: actualPrice !== null ? Math.max(0, actualPrice) : null,
    purchased: false,
    assignedTo
  };

  list.items.push(newItem);
  saveStore(store);
  return newItem;
}

/**
 * Toggle purchased checkbox for a shopping item.
 * @param {string} listId
 * @param {string} itemId
 * @returns {Promise<Object>} The updated item
 */
export async function toggleShoppingItem(listId, itemId) {
  const store = loadStore();
  const user = requireAuth(store);

  const list = store.shoppingLists.find((sl) => sl.id === listId && sl.ownerId === user.id);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  const item = list.items.find((it) => it.id === itemId);
  if (!item) throw new ApiError('Item not found', { status: 404 });

  item.purchased = !item.purchased;
  if (item.purchased && item.actualPrice === null) {
    item.actualPrice = item.estimatedPrice;
  }

  saveStore(store);
  return item;
}

/**
 * Update an individual item in a shopping list.
 * @param {string} listId
 * @param {string} itemId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateShoppingItem(listId, itemId, data) {
  const store = loadStore();
  const user = requireAuth(store);

  const list = store.shoppingLists.find((sl) => sl.id === listId && sl.ownerId === user.id);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  const item = list.items.find((it) => it.id === itemId);
  if (!item) throw new ApiError('Item not found', { status: 404 });

  Object.assign(item, data, { id: itemId });
  saveStore(store);
  return item;
}

/**
 * Remove an item from a shopping list.
 * @param {string} listId
 * @param {string} itemId
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeShoppingItem(listId, itemId) {
  const store = loadStore();
  const user = requireAuth(store);

  const list = store.shoppingLists.find((sl) => sl.id === listId && sl.ownerId === user.id);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  list.items = list.items.filter((it) => it.id !== itemId);
  saveStore(store);
  return { ok: true };
}

/**
 * Convert a completed shopping list into a personal expense.
 * Prevents double conversion.
 * @param {string} listId
 * @param {Object} params
 * @param {string} [params.categoryId='cat_food']
 * @param {string} [params.paymentMethod='Card']
 * @returns {Promise<Object>} The created expense
 */
export async function convertShoppingListToExpense(listId, { categoryId = 'cat_food', paymentMethod = 'Card' } = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  const list = store.shoppingLists.find((sl) => sl.id === listId && sl.ownerId === user.id);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  if (list.convertedExpenseId) {
    throw new ApiError('Shopping list has already been converted to an expense', { status: 409 });
  }

  // Total actual price of purchased items (or estimated price if actual not recorded)
  const totalAmount = list.items.reduce((sum, it) => {
    const price = it.actualPrice !== null ? it.actualPrice : it.estimatedPrice;
    return sum + price;
  }, 0);

  if (totalAmount <= 0) {
    throw new ApiError('Cannot convert an empty or zero-amount shopping list', { status: 400 });
  }

  const createdExpense = await createExpense({
    categoryId,
    amount: totalAmount,
    date: new Date().toISOString().slice(0, 10),
    description: `Shopping: ${list.name}`,
    paymentMethod,
    notes: `Converted from shopping list "${list.name}" (${list.items.length} items)`
  });

  // Re-load store to update shopping list reference
  const updatedStore = loadStore();
  const targetList = updatedStore.shoppingLists.find((sl) => sl.id === listId);
  if (targetList) {
    targetList.convertedExpenseId = createdExpense.id;
    saveStore(updatedStore);
  }

  return createdExpense;
}

// =============================================================================
// ANALYTICS & INSIGHTS
// =============================================================================

/**
 * Get monthly financial summary (income, expenses, savings rate, and 6-month trend).
 * @param {Object} [params]
 * @param {number} [params.month=10]
 * @param {number} [params.year=2026]
 * @returns {Promise<Object>}
 */
export async function monthlySummary({ month = 10, year = 2026 } = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const expenses = store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(prefix));
  const income = store.income.filter((i) => i.userId === user.id && i.date.startsWith(prefix));

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
  const savings = Math.max(0, totalIncome - totalExpenses);
  const savingsRate = totalIncome > 0 ? Number(((savings / totalIncome) * 100).toFixed(1)) : 0;

  // Generate 6 months historical trend
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const p = `${y}-${String(m).padStart(2, '0')}`;

    const mExp = store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(p)).reduce((sum, e) => sum + e.amount, 0);
    const mInc = store.income.filter((inc) => inc.userId === user.id && inc.date.startsWith(p)).reduce((sum, inc) => sum + inc.amount, 0);

    const monthName = d.toLocaleString('en-IN', { month: 'short' });
    trend.push({ month: m, year: y, label: `${monthName} ${y}`, expenses: mExp, income: mInc });
  }

  return { totalIncome, totalExpenses, savings, savingsRate, trend };
}

/**
 * Get spending breakdown by category.
 * @param {Object} [params]
 * @param {number} [params.month=10]
 * @param {number} [params.year=2026]
 * @param {'expense'|'income'} [params.type='expense']
 * @returns {Promise<Object[]>} Array of { category, amount, percentage }
 */
export async function byCategory({ month = 10, year = 2026, type = 'expense' } = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const list =
    type === 'expense'
      ? store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(prefix))
      : store.income.filter((i) => i.userId === user.id && i.date.startsWith(prefix));

  const total = list.reduce((sum, item) => sum + item.amount, 0);
  const byCat = {};

  for (const item of list) {
    byCat[item.categoryId] = (byCat[item.categoryId] || 0) + item.amount;
  }

  const result = [];
  for (const [catId, amount] of Object.entries(byCat)) {
    const category = store.categories.find((c) => c.id === catId) || { name: 'Other', color: '#64748b', icon: 'ellipsis' };
    const percentage = total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0;
    result.push({ category, amount, percentage });
  }

  result.sort((a, b) => b.amount - a.amount);
  return result;
}

/**
 * Calculate month-end spending forecast based on daily run rate.
 * Projected spend = (average daily spend so far) * days in month.
 * @param {Object} [params]
 * @param {number} [params.month=10]
 * @param {number} [params.year=2026]
 * @returns {Promise<Object>}
 */
export async function forecast({ month = 10, year = 2026 } = {}) {
  const store = loadStore();
  const user = requireAuth(store);

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const expenses = store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(prefix));

  const totalSoFar = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Total days in the month
  const daysInMonth = new Date(year, month, 0).getDate();

  // Current day of month (or 28 for demo October 2026)
  const now = new Date();
  const currentDay = (now.getFullYear() === year && now.getMonth() + 1 === month)
    ? Math.max(1, now.getDate())
    : 28;

  const dailyAverage = currentDay > 0 ? Math.round(totalSoFar / currentDay) : 0;
  const projectedTotal = dailyAverage * daysInMonth;

  return {
    totalSoFar,
    currentDay,
    daysInMonth,
    dailyAverage,
    projectedTotal
  };
}

/**
 * List smart notifications and insights for the user.
 * @returns {Promise<Object[]>}
 */
export async function insights() {
  const store = loadStore();
  const user = requireAuth(store);

  return store.insights.filter((ins) => ins.userId === user.id);
}

// =============================================================================
// GLOBAL SEARCH
// =============================================================================

/**
 * Search across expenses, income, groups, and shopping lists.
 * @param {string} query
 * @returns {Promise<{ expenses: Object[], income: Object[], groups: Object[], shoppingLists: Object[] }>}
 */
export async function search(query) {
  if (!query || !query.trim()) {
    return { expenses: [], income: [], groups: [], shoppingLists: [] };
  }

  const q = query.trim().toLowerCase();
  const store = loadStore();
  const user = requireAuth(store);

  const matchedExpenses = store.expenses
    .filter((e) => e.userId === user.id && ((e.description || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q)))
    .slice(0, 5);

  const matchedIncome = store.income
    .filter((i) => i.userId === user.id && ((i.source || '').toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q)))
    .slice(0, 5);

  const matchedGroups = store.groups
    .filter((g) => g.members.some((m) => m.userId === user.id) && (g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q)))
    .slice(0, 5);

  const matchedShopping = store.shoppingLists
    .filter((sl) => sl.ownerId === user.id && sl.name.toLowerCase().includes(q))
    .slice(0, 5);

  return {
    expenses: matchedExpenses,
    income: matchedIncome,
    groups: matchedGroups,
    shoppingLists: matchedShopping
  };
}

// =============================================================================
// DEMO RESET
// =============================================================================

/**
 * Reset data store back to the Review 1 initial sample seed state.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function resetDemoData() {
  resetStore();
  return { ok: true };
}
