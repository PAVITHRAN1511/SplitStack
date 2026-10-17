/**
 * SplitStack Client Data Layer (Review 2).
 * Exposes async functions that match the exact contract of the future Review 3 REST API.
 * In Review 2, this is backed by localStorage via store.js.
 * In Review 3, this file or api-http.js will simply swap the implementation to fetch().
 *
 * All monetary amounts are handled as integer paise (1 Rupee = 100 paise).
 */

import { loadStore, saveStore, generateId, reset as resetStore, getSessionUserId, setSessionUserId } from './store.js';
import { calculateEqualSplit, validateCustomShares } from '../domain/splits.js';
import { calculateNetBalances, simplifyDebts } from '../domain/settle.js';
import { calculateForecast, assessBudgetRisk } from '../domain/forecast.js';
import { generateInsights } from '../domain/insights.js';

import {
  ApiError,
  getApiBaseUrl,
  setApiBaseUrl,
  getAuthToken,
  setAuthToken,
  request,
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
  httpGetIncome,
  httpCreateIncome,
  httpUpdateIncome,
  httpRemoveIncome,
  httpListCategories,
  httpGetCategory,
  httpCreateCategory,
  httpUpdateCategory,
  httpRemoveCategory,
  httpListBudgets,
  httpCreateBudget,
  httpUpdateBudget,
  httpRemoveBudget,
  httpListRecurring,
  httpCreateRecurring,
  httpToggleRecurring,
  httpUpdateRecurring,
  httpRemoveRecurring,
  httpListGroups,
  httpGetGroup,
  httpCreateGroup,
  httpUpdateGroup,
  httpRemoveGroup,
  httpAddMember,
  httpRemoveMember,
  httpLeaveGroup,
  httpListSharedExpenses,
  httpCreateSharedExpense,
  httpRemoveSharedExpense,
  httpGetGroupBalances,
  httpGetGroupMemberStats,
  httpGetSuggestedSettlements,
  httpListSettlements,
  httpRecordSettlement,
  httpRemoveSettlement,
  httpListShoppingLists,
  httpGetShoppingList,
  httpCreateShoppingList,
  httpUpdateShoppingList,
  httpRemoveShoppingList,
  httpAddShoppingItem,
  httpToggleShoppingItem,
  httpUpdateShoppingItem,
  httpRemoveShoppingItem,
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
} from './api-http.js';

// Re-export domain logic and API helpers for page modules and callers
export {
  calculateEqualSplit,
  validateCustomShares,
  calculateNetBalances,
  simplifyDebts,
  calculateForecast,
  assessBudgetRisk,
  generateInsights,
  ApiError,
  getApiBaseUrl,
  setApiBaseUrl,
  getAuthToken,
  setAuthToken,
  request,
  exportLocalData,
  importLocalDataToServer
};

let currentApiMode = null;

/**
 * Get current API operating mode ('api' or 'local').
 * In browser under http/https, defaults to 'api'.
 * In test or local file environments, defaults to 'local'.
 * @returns {'api'|'local'}
 */
export function getApiMode() {
  if (currentApiMode !== null) return currentApiMode;
  if (typeof window !== 'undefined') {
    try {
      const explicit = localStorage.getItem('splitstack_mode');
      if (explicit === 'api' || explicit === 'local') return explicit;
    } catch (_) {}
    const isNode = typeof process !== 'undefined' && process.versions && Boolean(process.versions.node);
    if (!isNode && window.location && typeof window.location.protocol === 'string' && window.location.protocol.startsWith('http')) {
      return 'api';
    }
  }
  return 'local';
}

/**
 * Explicitly switch operating mode.
 * @param {'api'|'local'} mode
 */
export function setApiMode(mode) {
  if (mode !== 'api' && mode !== 'local') {
    throw new Error('Invalid API mode: must be "api" or "local"');
  }
  currentApiMode = mode;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('splitstack_mode', mode);
    }
  } catch (_) {}
}

/**
 * Hash a password using SHA-256 + salt via Web Crypto API.
 * NOTE: This client-side hashing is for demo/localStorage mode only.
 * The production Review 3 Node.js + Express backend must replace this with
 * server-side bcrypt hashing (cost factor 12) over HTTPS.
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
  if (getApiMode() === 'api') return httpRegister({ name, email, password });

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
  if (getApiMode() === 'api') return httpLogin({ email, password });

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
  if (getApiMode() === 'api') return httpLogout();

  setSessionUserId(null);
  return { ok: true };
}

/**
 * Get the currently authenticated user.
 * @returns {Promise<Object|null>} Safe user object or null
 */
export async function currentUser() {
  if (getApiMode() === 'api') return httpCurrentUser();

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
  if (getApiMode() === 'api') return httpUpdateProfile({ name, email, preferences });

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
  if (getApiMode() === 'api') return httpChangePassword({ currentPassword, newPassword });

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
export async function listExpenses(filters = {}) {
  if (getApiMode() === 'api') return httpListExpenses(filters);

  const {
    page = 1,
    limit = 10,
    search = filters.q || '',
    categoryId = filters.category || '',
    paymentMethod = filters.method || '',
    startDate = filters.from || '',
    endDate = filters.to || '',
    minAmount = filters.minPaise ?? null,
    maxAmount = filters.maxPaise ?? null,
    sort = 'date_desc'
  } = filters;
  const store = loadStore();
  const user = requireAuth(store);

  let list = store.expenses.filter((e) => e.userId === user.id);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((e) => (e.description || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q));
  }

  const cat = categoryId;
  if (cat) {
    list = list.filter((e) => e.categoryId === cat);
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

  if (minAmount !== null && !isNaN(minAmount)) {
    list = list.filter((e) => e.amount >= minAmount);
  }

  if (maxAmount !== null && !isNaN(maxAmount)) {
    list = list.filter((e) => e.amount <= maxAmount);
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
  if (getApiMode() === 'api') return httpGetExpense(id);

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
  if (getApiMode() === 'api') return httpCreateExpense({ categoryId, amount, date, description, paymentMethod, notes });

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
  if (getApiMode() === 'api') return httpUpdateExpense(id, data);

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
  if (getApiMode() === 'api') return httpRemoveExpense(id);

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
export async function listIncome(filters = {}) {
  if (getApiMode() === 'api') return httpListIncome(filters);

  const {
    page = 1,
    limit = 10,
    search = filters.q || '',
    categoryId = filters.category || '',
    startDate = filters.from || '',
    endDate = filters.to || '',
    minAmount = filters.minPaise ?? null,
    maxAmount = filters.maxPaise ?? null,
    sort = 'date_desc'
  } = filters;
  const store = loadStore();
  const user = requireAuth(store);

  let list = store.income.filter((i) => i.userId === user.id);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((i) => (i.source || '').toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q));
  }

  const cat = categoryId;
  if (cat) list = list.filter((i) => i.categoryId === cat);
  if (startDate) list = list.filter((i) => i.date >= startDate);
  if (endDate) list = list.filter((i) => i.date <= endDate);

  if (minAmount !== null && !isNaN(minAmount)) {
    list = list.filter((i) => i.amount >= minAmount);
  }
  if (maxAmount !== null && !isNaN(maxAmount)) {
    list = list.filter((i) => i.amount <= maxAmount);
  }

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
  if (getApiMode() === 'api') return httpGetIncome(id);

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
  if (getApiMode() === 'api') return httpCreateIncome({ categoryId, amount, date, source, paymentMethod, notes });

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
  if (getApiMode() === 'api') return httpUpdateIncome(id, data);

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
  if (getApiMode() === 'api') return httpRemoveIncome(id);

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
  if (getApiMode() === 'api') return httpListCategories(filter);

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
  if (getApiMode() === 'api') return httpGetCategory(id);

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
  if (getApiMode() === 'api') return httpCreateCategory({ name, type, icon, color });

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
  if (getApiMode() === 'api') return httpUpdateCategory(id, data);

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
  if (getApiMode() === 'api') return httpRemoveCategory(id);

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
export async function listBudgets(arg1 = 10, arg2 = 2026) {
  if (getApiMode() === 'api') return httpListBudgets(arg1, arg2);

  let month = 10;
  let year = 2026;
  if (typeof arg1 === 'object' && arg1 !== null) {
    month = arg1.month ?? 10;
    year = arg1.year ?? 2026;
  } else {
    if (typeof arg1 === 'number') month = arg1;
    if (typeof arg2 === 'number') year = arg2;
  }

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
  if (getApiMode() === 'api') return httpCreateBudget({ categoryId, month, year, limit });

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
  if (getApiMode() === 'api') return httpUpdateBudget(id, data);

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
  if (getApiMode() === 'api') return httpRemoveBudget(id);

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
  if (getApiMode() === 'api') return httpListRecurring();

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
  if (getApiMode() === 'api') return httpCreateRecurring({ name, amount, categoryId, frequency, startDate, nextDueDate, active });

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
  if (getApiMode() === 'api') return httpToggleRecurring(id);

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
  if (getApiMode() === 'api') return httpRemoveRecurring(id);

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
  if (getApiMode() === 'api') return httpListGroups();

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
  if (getApiMode() === 'api') return httpGetGroup(id);

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
  if (getApiMode() === 'api') return httpCreateGroup({ name, description, memberEmails });

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
export async function addMember(groupId, member) {
  if (getApiMode() === 'api') return httpAddMember(groupId, member);

  const rawEmail = typeof member === 'string' ? member : member?.email;
  if (!rawEmail || !rawEmail.includes('@')) throw new ApiError('Valid email is required', { field: 'email' });

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const norm = rawEmail.trim().toLowerCase();
  if (group.members.some((m) => m.email.toLowerCase() === norm)) {
    throw new ApiError('User is already a member of this group', { field: 'email', status: 409 });
  }

  const existingUser = store.users.find((u) => u.email.toLowerCase() === norm);
  const memberName =
    typeof member === 'object' && member?.name
      ? member.name.trim()
      : existingUser
        ? existingUser.name
        : norm.split('@')[0];

  const newMember = {
    userId: existingUser ? existingUser.id : generateId(),
    name: memberName,
    email: norm,
    role: typeof member === 'object' && member?.role === 'admin' ? 'admin' : 'member',
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
  if (getApiMode() === 'api') return httpRemoveMember(groupId, userId);

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
  if (getApiMode() === 'api') return httpLeaveGroup(groupId);

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
  if (getApiMode() === 'api') return httpListSharedExpenses(groupId);

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
 * @param {string} [params.categoryId='cat_food']
 * @param {string} [params.date]
 * @param {'equal'|'custom'} [params.splitType='equal']
 * @param {Object[]} [params.shares=[]] - [{ userId, amount }]
 * @param {string} [params.paidBy]
 * @returns {Promise<Object>}
 */
export async function createSharedExpense(groupId, { title, amount, categoryId, date, splitType = 'equal', shares = [], paidBy }) {
  if (getApiMode() === 'api') return httpCreateSharedExpense(groupId, { title, amount, categoryId, date, splitType, shares, paidBy });

  if (!title || !title.trim()) throw new ApiError('Title is required', { field: 'title' });
  if (amount === null || amount === undefined || !Number.isInteger(amount) || amount <= 0) {
    throw new ApiError('Amount must be positive integer paise', { field: 'amount' });
  }

  const store = loadStore();
  const user = requireAuth(store);
  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const payerId = paidBy || user.id;
  if (!group.members.some((m) => m.userId === payerId)) {
    throw new ApiError('Payer must be a member of the group', { field: 'paidBy', status: 400 });
  }

  const groupMemberIds = group.members.map((m) => m.userId);
  let computedShares;

  if (splitType === 'equal') {
    const participantIds = Array.isArray(shares) && shares.length > 0
      ? shares.map((s) => (typeof s === 'string' ? s.trim() : s.userId?.trim()))
      : groupMemberIds;

    for (const pId of participantIds) {
      if (!pId || !groupMemberIds.includes(pId)) {
        throw new ApiError(`Participant "${pId}" is not a member of this group`, { field: 'shares', status: 400 });
      }
    }

    try {
      computedShares = calculateEqualSplit({
        amount,
        participants: participantIds,
        payerId
      });
    } catch (err) {
      throw new ApiError(err.message, { field: 'shares', status: 400 });
    }
  } else if (splitType === 'custom') {
    const customResult = validateCustomShares({
      amount,
      shares,
      allowedMemberIds: groupMemberIds
    });
    if (!customResult.isValid) {
      throw new ApiError(customResult.error, { field: 'shares', status: 400 });
    }
    computedShares = shares;
  } else {
    throw new ApiError(`Unsupported split type: ${splitType}`, { field: 'splitType', status: 400 });
  }

  const newShared = {
    id: generateId(),
    groupId,
    title: title.trim(),
    amount,
    categoryId: categoryId || 'cat_food',
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
 * Update a shared expense in a group.
 * @param {string} id - Shared expense ID
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
export async function updateSharedExpense(id, updates = {}) {
  if (getApiMode() === 'api') throw new ApiError('Editing shared expenses is not supported by the server. Please remove and re-create the expense.', { status: 501 });

  const store = loadStore();
  const user = requireAuth(store);

  const idx = store.sharedExpenses.findIndex((se) => se.id === id);
  if (idx === -1) throw new ApiError('Shared expense not found', { status: 404 });

  const se = store.sharedExpenses[idx];
  const group = store.groups.find((g) => g.id === se.groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Not authorized to update this shared expense', { status: 403 });

  const title = updates.title !== undefined ? updates.title : se.title;
  const amount = updates.amount !== undefined ? updates.amount : se.amount;
  const categoryId = updates.categoryId !== undefined ? updates.categoryId : se.categoryId;
  const date = updates.date !== undefined ? updates.date : se.date;
  const splitType = updates.splitType !== undefined ? updates.splitType : se.splitType;
  const paidBy = updates.paidBy !== undefined ? updates.paidBy : se.paidBy;

  if (!title || !title.trim()) throw new ApiError('Title is required', { field: 'title' });
  if (amount === null || amount === undefined || !Number.isInteger(amount) || amount <= 0) {
    throw new ApiError('Amount must be positive integer paise', { field: 'amount' });
  }

  if (!group.members.some((m) => m.userId === paidBy)) {
    throw new ApiError('Payer must be a member of the group', { field: 'paidBy', status: 400 });
  }

  const groupMemberIds = group.members.map((m) => m.userId);
  let computedShares;

  if (splitType === 'equal') {
    const rawShares = updates.shares !== undefined ? updates.shares : se.shares;
    const participantIds = Array.isArray(rawShares) && rawShares.length > 0
      ? rawShares.map((s) => (typeof s === 'string' ? s.trim() : s.userId?.trim()))
      : groupMemberIds;

    for (const pId of participantIds) {
      if (!pId || !groupMemberIds.includes(pId)) {
        throw new ApiError(`Participant "${pId}" is not a member of this group`, { field: 'shares', status: 400 });
      }
    }

    try {
      computedShares = calculateEqualSplit({
        amount,
        participants: participantIds,
        payerId: paidBy
      });
    } catch (err) {
      throw new ApiError(err.message, { field: 'shares', status: 400 });
    }
  } else if (splitType === 'custom') {
    const rawShares = updates.shares !== undefined ? updates.shares : se.shares;
    const customResult = validateCustomShares({
      amount,
      shares: rawShares,
      allowedMemberIds: groupMemberIds
    });
    if (!customResult.isValid) {
      throw new ApiError(customResult.error, { field: 'shares', status: 400 });
    }
    computedShares = rawShares;
  } else {
    throw new ApiError(`Unsupported split type: ${splitType}`, { field: 'splitType', status: 400 });
  }

  const updated = {
    ...se,
    title: title.trim(),
    amount,
    categoryId: categoryId || se.categoryId,
    date: date || se.date,
    splitType,
    paidBy,
    shares: computedShares,
    updatedAt: new Date().toISOString()
  };

  store.sharedExpenses[idx] = updated;
  saveStore(store);
  return updated;
}

/**
 * Delete a shared expense from a group.
 * @param {string} id - Shared expense ID
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeSharedExpense(arg1, arg2) {
  if (getApiMode() === 'api') return httpRemoveSharedExpense(arg1, arg2);
  const id = arg1;
  const store = loadStore();
  const user = requireAuth(store);

  const idx = store.sharedExpenses.findIndex((se) => se.id === id);
  if (idx === -1) throw new ApiError('Shared expense not found', { status: 404 });

  const se = store.sharedExpenses[idx];
  const group = store.groups.find((g) => g.id === se.groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Not authorized to delete this shared expense', { status: 403 });

  store.sharedExpenses.splice(idx, 1);
  saveStore(store);
  return { ok: true };
}

/**
 * Get net member balances for a group using the canonical domain calculation.
 * Balance = amount paid - allocated share (+ received settlements - paid settlements).
 * Positive = is owed money (creditor); Negative = owes money (debtor); Zero = settled.
 * @param {string} groupId
 * @returns {Promise<Record<string, number>>} Map of userId -> balance in integer paise
 */
export async function getGroupBalances(groupId) {
  if (getApiMode() === 'api') return httpGetGroupBalances(groupId);

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const shared = store.sharedExpenses.filter((se) => se.groupId === groupId);
  const completed = store.settlements.filter((s) => s.groupId === groupId && s.status === 'completed');

  const { balances } = calculateNetBalances({
    members: group.members,
    expenses: shared,
    settlements: completed
  });

  return balances;
}

/**
 * Get comprehensive member statistics (amount paid, share owed, net balance) for a group.
 * @param {string} groupId
 * @returns {Promise<{
 *   balances: Record<string, number>,
 *   memberStats: Record<string, { paid: number, share: number, net: number }>,
 *   netSum: number
 * }>}
 */
export async function getGroupMemberStats(groupId) {
  if (getApiMode() === 'api') return httpGetGroupMemberStats(groupId);

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const shared = store.sharedExpenses.filter((se) => se.groupId === groupId);
  const completed = store.settlements.filter((s) => s.groupId === groupId && s.status === 'completed');

  return calculateNetBalances({
    members: group.members,
    expenses: shared,
    settlements: completed
  });
}

/**
 * Get suggested settlement payment plan using the greedy minimum-cash-flow algorithm.
 * @param {string} groupId
 * @returns {Promise<{
 *   transfers: Array<{ from: string, fromName: string, to: string, toName: string, amount: number }>,
 *   pairwiseDebtsCount: number,
 *   optimizedCount: number,
 *   savedPercent: number
 * }>}
 */
export async function getSuggestedSettlements(groupId) {
  if (getApiMode() === 'api') return httpGetSuggestedSettlements(groupId);

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const shared = store.sharedExpenses.filter((se) => se.groupId === groupId);
  const completed = store.settlements.filter((s) => s.groupId === groupId && s.status === 'completed');

  const { balances } = calculateNetBalances({
    members: group.members,
    expenses: shared,
    settlements: completed
  });

  return simplifyDebts(group.members, balances);
}

/**
 * List settlements for a group.
 * @param {string} groupId
 * @returns {Promise<Object[]>}
 */
export async function getSettlements(groupId) {
  if (getApiMode() === 'api') return httpListSettlements(groupId);

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  return store.settlements.filter((s) => s.groupId === groupId);
}

/**
 * Record a payment / settle up transaction with debt limit validation.
 * @param {string} groupId
 * @param {Object} params
 * @param {string} params.payerId - Debtor paying money
 * @param {string} params.payeeId - Creditor receiving money
 * @param {number} params.amount - Integer paise
 * @returns {Promise<Object>} Recorded settlement record
 */
export async function recordSettlement(groupId, { payerId, payeeId, amount }) {
  if (getApiMode() === 'api') return httpRecordSettlement(groupId, { payerId, payeeId, amount });

  if (!payerId || !payeeId) throw new ApiError('Payer and payee are required', { status: 400 });
  if (payerId === payeeId) {
    throw new ApiError('Payer and payee cannot be the same member', { status: 400 });
  }
  if (amount === null || amount === undefined || !Number.isInteger(amount) || amount <= 0) {
    throw new ApiError('Amount must be positive integer paise', { status: 400 });
  }

  const store = loadStore();
  const user = requireAuth(store);

  const group = store.groups.find((g) => g.id === groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Group not found', { status: 404 });

  const isPayerMember = group.members.some((m) => m.userId === payerId);
  const isPayeeMember = group.members.some((m) => m.userId === payeeId);
  if (!isPayerMember || !isPayeeMember) {
    throw new ApiError('Payer and payee must be members of the group', { status: 400 });
  }

  // Calculate current net balances before recording this settlement
  const shared = store.sharedExpenses.filter((se) => se.groupId === groupId);
  const completed = store.settlements.filter((s) => s.groupId === groupId && s.status === 'completed');

  const { balances } = calculateNetBalances({
    members: group.members,
    expenses: shared,
    settlements: completed
  });

  const payerNet = balances[payerId] ?? 0;
  const payeeNet = balances[payeeId] ?? 0;

  if (payerNet >= 0) {
    throw new ApiError('Payer does not have an outstanding debt in this group', { status: 400 });
  }
  if (payeeNet <= 0) {
    throw new ApiError('Payee is not owed money in this group', { status: 400 });
  }

  const maxAllowableTransfer = Math.min(-payerNet, payeeNet);
  if (amount > maxAllowableTransfer) {
    throw new ApiError(
      `Settlement amount (${amount} paise) exceeds maximum allowable debt transfer (${maxAllowableTransfer} paise)`,
      { status: 400 }
    );
  }

  // Prevent duplicate submissions within a short window (2000ms)
  const now = Date.now();
  const recentDuplicate = completed.find(
    (s) =>
      s.payerId === payerId &&
      s.payeeId === payeeId &&
      s.amount === amount &&
      s.completedAt &&
      now - new Date(s.completedAt).getTime() < 2000
  );
  if (recentDuplicate) {
    throw new ApiError('Duplicate settlement detected. Please wait before submitting again.', { status: 409 });
  }

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

/**
 * Remove a settlement record from a group (recalculating balances).
 * @param {string} id - Settlement ID
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeSettlement(arg1, arg2) {
  if (getApiMode() === 'api') return httpRemoveSettlement(arg1, arg2);
  const id = arg1;
  const store = loadStore();
  const user = requireAuth(store);

  const idx = store.settlements.findIndex((s) => s.id === id);
  if (idx === -1) throw new ApiError('Settlement not found', { status: 404 });

  const settlement = store.settlements[idx];
  const group = store.groups.find((g) => g.id === settlement.groupId && g.members.some((m) => m.userId === user.id));
  if (!group) throw new ApiError('Not authorized to delete this settlement', { status: 403 });

  store.settlements.splice(idx, 1);
  saveStore(store);
  return { ok: true };
}

// =============================================================================
// SHOPPING LISTS
// =============================================================================

/**
 * Helper to find a shopping list accessible by the user (owned or through group membership).
 * @param {Object} store
 * @param {string} listId
 * @param {Object} user
 * @returns {Object|undefined}
 */
function findAccessibleShoppingList(store, listId, user) {
  const userGroupIds = new Set(
    store.groups.filter((g) => g.members.some((m) => m.userId === user.id)).map((g) => g.id)
  );
  return store.shoppingLists.find((sl) => {
    if (sl.id !== listId) return false;
    return sl.ownerId === user.id || (sl.groupId && userGroupIds.has(sl.groupId));
  });
}

/**
 * List shopping lists owned by the user or their groups.
 * @param {string|null} [groupId=null]
 * @returns {Promise<Object[]>}
 */
export async function listShoppingLists(groupId = null) {
  if (getApiMode() === 'api') return httpListShoppingLists(groupId);

  const store = loadStore();
  const user = requireAuth(store);

  const userGroupIds = new Set(
    store.groups.filter((g) => g.members.some((m) => m.userId === user.id)).map((g) => g.id)
  );

  return store.shoppingLists.filter((sl) => {
    const hasAccess = sl.ownerId === user.id || (sl.groupId && userGroupIds.has(sl.groupId));
    if (!hasAccess) return false;
    if (groupId !== null && groupId !== undefined) {
      return sl.groupId === groupId;
    }
    return true;
  });
}

/**
 * Get shopping list by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getShoppingList(id) {
  if (getApiMode() === 'api') return httpGetShoppingList(id);

  const store = loadStore();
  const user = requireAuth(store);

  const list = findAccessibleShoppingList(store, id, user);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });
  return list;
}

/**
 * Create a new shopping list.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function createShoppingList({ name, budget = 0, groupId = null, items = [] }) {
  if (getApiMode() === 'api') return httpCreateShoppingList({ name, budget, groupId, items });

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
  if (getApiMode() === 'api') return httpUpdateShoppingList(id, data);

  const store = loadStore();
  const user = requireAuth(store);

  const list = findAccessibleShoppingList(store, id, user);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  if (data.name !== undefined) {
    if (!data.name || !data.name.trim()) throw new ApiError('Name is required', { field: 'name' });
    list.name = data.name.trim();
  }
  if (data.budget !== undefined) {
    const b = Number(data.budget);
    if (!Number.isFinite(b) || b < 0) throw new ApiError('Budget must be a non-negative number', { field: 'budget' });
    list.budget = Math.round(b);
  }
  if (data.groupId !== undefined) {
    list.groupId = data.groupId || null;
  }
  saveStore(store);
  return list;
}

/**
 * Remove a shopping list.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeShoppingList(id) {
  if (getApiMode() === 'api') return httpRemoveShoppingList(id);

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
  if (getApiMode() === 'api') return httpAddShoppingItem(listId, { name, quantity, estimatedPrice, actualPrice, assignedTo });

  if (!name || !name.trim()) throw new ApiError('Item name is required', { field: 'name' });

  const store = loadStore();
  const user = requireAuth(store);

  const list = findAccessibleShoppingList(store, listId, user);
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
  if (getApiMode() === 'api') return httpToggleShoppingItem(listId, itemId);

  const store = loadStore();
  const user = requireAuth(store);

  const list = findAccessibleShoppingList(store, listId, user);
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
  if (getApiMode() === 'api') return httpUpdateShoppingItem(listId, itemId, data);

  const store = loadStore();
  const user = requireAuth(store);

  const list = findAccessibleShoppingList(store, listId, user);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  const item = list.items.find((it) => it.id === itemId);
  if (!item) throw new ApiError('Item not found', { status: 404 });

  if (data.name !== undefined) {
    if (!data.name || !data.name.trim()) throw new ApiError('Item name is required', { field: 'name' });
    item.name = data.name.trim();
  }
  if (data.quantity !== undefined) {
    const q = parseInt(data.quantity, 10);
    if (!Number.isFinite(q) || q < 1) throw new ApiError('Quantity must be at least 1', { field: 'quantity' });
    item.quantity = q;
  }
  if (data.estimatedPrice !== undefined) {
    const p = Number(data.estimatedPrice);
    if (!Number.isFinite(p) || p < 0) throw new ApiError('Estimated price must be a non-negative amount', { field: 'estimatedPrice' });
    item.estimatedPrice = Math.round(p);
  }
  if (data.actualPrice !== undefined) {
    if (data.actualPrice === null) {
      item.actualPrice = null;
    } else {
      const a = Number(data.actualPrice);
      if (!Number.isFinite(a) || a < 0) throw new ApiError('Actual price must be a non-negative amount', { field: 'actualPrice' });
      item.actualPrice = Math.round(a);
    }
  }
  if (data.purchased !== undefined) {
    item.purchased = Boolean(data.purchased);
  }
  if (data.assignedTo !== undefined) {
    item.assignedTo = data.assignedTo || null;
  }

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
  if (getApiMode() === 'api') return httpRemoveShoppingItem(listId, itemId);

  const store = loadStore();
  const user = requireAuth(store);

  const list = findAccessibleShoppingList(store, listId, user);
  if (!list) throw new ApiError('Shopping list not found', { status: 404 });

  const idx = list.items.findIndex((it) => it.id === itemId);
  if (idx === -1) throw new ApiError('Item not found', { status: 404 });

  list.items.splice(idx, 1);
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
export async function convertShoppingListToExpense(listId, options = {}) {
  if (getApiMode() === 'api') return httpConvertShoppingListToExpense(listId, options);

  const opts = typeof options === 'string' ? { categoryId: options } : options || {};
  const { categoryId = 'cat_food', paymentMethod = 'Card' } = opts;

  const store = loadStore();
  const user = requireAuth(store);

  const list = findAccessibleShoppingList(store, listId, user);
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
// RECEIPTS
// =============================================================================

/**
 * List receipts for the current user.
 * @returns {Promise<Object[]>}
 */
export async function listReceipts() {
  if (getApiMode() === 'api') return httpListReceipts();

  const store = loadStore();
  const user = requireAuth(store);

  return (store.receipts || []).filter((r) => r.userId === user.id);
}

/**
 * Get a receipt by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getReceipt(id) {
  if (getApiMode() === 'api') return httpGetReceipt(id);

  const store = loadStore();
  const user = requireAuth(store);

  const receipt = (store.receipts || []).find((r) => r.id === id && r.userId === user.id);
  if (!receipt) throw new ApiError('Receipt not found', { status: 404 });
  return receipt;
}

/**
 * Create a receipt record.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function createReceipt({
  merchant,
  amount = 0,
  date,
  rawText = '',
  confidence = null,
  status = 'pending',
  imageUrl = ''
}) {
  const store = loadStore();
  const user = requireAuth(store);

  if (!merchant || !merchant.trim()) throw new ApiError('Merchant is required', { field: 'merchant' });

  const newReceipt = {
    id: generateId(),
    userId: user.id,
    merchant: merchant.trim(),
    date: date || new Date().toISOString().slice(0, 10),
    amount: Math.max(0, Math.round(Number(amount) || 0)),
    rawText: rawText || '',
    confidence: typeof confidence === 'number' ? confidence : null,
    status: status || 'pending',
    imageUrl: imageUrl || ''
  };

  if (!Array.isArray(store.receipts)) {
    store.receipts = [];
  }
  store.receipts.push(newReceipt);
  saveStore(store);
  return newReceipt;
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
export async function monthlySummary(arg = {}) {
  if (getApiMode() === 'api') return httpMonthlySummary(arg);

  let month = 10;
  let year = 2026;
  let monthsBack = 6;

  if (typeof arg === 'number') {
    monthsBack = Math.max(1, arg);
  } else if (typeof arg === 'object' && arg !== null) {
    month = arg.month ?? 10;
    year = arg.year ?? 2026;
    if (typeof arg.monthsBack === 'number') monthsBack = Math.max(1, arg.monthsBack);
  }

  const store = loadStore();
  const user = requireAuth(store);

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const expenses = store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(prefix));
  const income = store.income.filter((i) => i.userId === user.id && i.date.startsWith(prefix));

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
  const savings = Math.max(0, totalIncome - totalExpenses);
  const savingsRate = totalIncome > 0 ? Number(((savings / totalIncome) * 100).toFixed(1)) : 0;

  // Generate historical trend
  const trend = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
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
 * Supports both positional (month, year, type) and options object ({ month, year, type }).
 * @param {number|Object} [arg1=10]
 * @param {number} [arg2=2026]
 * @param {'expense'|'income'} [arg3='expense']
 * @returns {Promise<Object[]>} Array of { category, amount, percentage }
 */
/**
 * Get category breakdown for a month with month-over-month trend comparison.
 * Supports both positional (month, year) and options object ({ month, year, type }).
 * @param {number|Object} [arg1=10]
 * @param {number} [arg2=2026]
 * @param {'expense'|'income'} [arg3='expense']
 * @returns {Promise<Object[]>} Array of { category, amount, total, percentage, prevAmount, changePercent }
 */
export async function byCategory(arg1 = 10, arg2 = 2026, arg3 = 'expense') {
  if (getApiMode() === 'api') return httpByCategory(arg1, arg2, arg3);

  let month = 10;
  let year = 2026;
  let type = 'expense';

  if (typeof arg1 === 'object' && arg1 !== null) {
    month = arg1.month ?? 10;
    year = arg1.year ?? 2026;
    type = arg1.type ?? 'expense';
  } else {
    if (typeof arg1 === 'number') month = arg1;
    if (typeof arg2 === 'number') year = arg2;
    if (typeof arg3 === 'string') type = arg3;
  }

  const store = loadStore();
  const user = requireAuth(store);

  const currPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const currList =
    type === 'expense'
      ? store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(currPrefix))
      : store.income.filter((i) => i.userId === user.id && i.date.startsWith(currPrefix));

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const prevList =
    type === 'expense'
      ? store.expenses.filter((e) => e.userId === user.id && e.date.startsWith(prevPrefix))
      : store.income.filter((i) => i.userId === user.id && i.date.startsWith(prevPrefix));

  const total = currList.reduce((sum, item) => sum + item.amount, 0);

  const byCat = {};
  for (const item of currList) {
    byCat[item.categoryId] = (byCat[item.categoryId] || 0) + item.amount;
  }

  const prevByCat = {};
  for (const item of prevList) {
    prevByCat[item.categoryId] = (prevByCat[item.categoryId] || 0) + item.amount;
  }

  const result = [];
  for (const [catId, amount] of Object.entries(byCat)) {
    const category = store.categories.find((c) => c.id === catId) || {
      id: catId,
      name: catId.replace(/^cat_/, ''),
      color: '#64748b',
      icon: 'fa-tag'
    };
    const percentage = total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0;
    const prevAmount = prevByCat[catId] || 0;
    let changePercent = null;
    if (prevAmount > 0) {
      changePercent = Number((((amount - prevAmount) / prevAmount) * 100).toFixed(1));
    }

    result.push({
      category,
      categoryId: catId,
      name: category.name,
      amount,
      total: amount,
      percentage,
      prevAmount,
      changePercent
    });
  }

  result.sort((a, b) => b.amount - a.amount);
  return result;
}

/**
 * Calculate month-end spending forecast based on daily velocity model.
 * Projected spend = (average daily spend so far) * days in month.
 * Supports both positional (month, year) and options object ({ month, year, referenceDate }).
 * @param {number|Object} [arg1=10]
 * @param {number} [arg2=2026]
 * @returns {Promise<Object>}
 */
export async function forecast(arg1 = 10, arg2 = 2026) {
  if (getApiMode() === 'api') return httpForecast(arg1, arg2);

  let month = 10;
  let year = 2026;
  let referenceDate = '2026-10-28';

  if (typeof arg1 === 'object' && arg1 !== null) {
    month = arg1.month ?? 10;
    year = arg1.year ?? 2026;
    referenceDate = arg1.referenceDate || '2026-10-28';
  } else {
    if (typeof arg1 === 'number') month = arg1;
    if (typeof arg2 === 'number') year = arg2;
  }

  const store = loadStore();
  const user = requireAuth(store);

  const userExpenses = store.expenses.filter((e) => e.userId === user.id);
  const userBudget = user.preferences?.monthlyBudget || 4000000;

  const fc = calculateForecast({
    expenses: userExpenses,
    month,
    year,
    referenceDate,
    monthlyBudget: userBudget
  });

  // Provide backward-compatible aliases for P2/P3 callers
  return {
    ...fc,
    totalSoFar: fc.currentSpent,
    currentDay: fc.daysPassed,
    projectedSpend: fc.projectedTotal,
    monthlyBudget: userBudget
  };
}

/**
 * List smart, data-driven notifications and insights for the user.
 * @returns {Promise<Object[]>}
 */
export async function insights() {
  if (getApiMode() === 'api') return httpInsights();

  const store = loadStore();
  const user = requireAuth(store);

  const userBudgets = await listBudgets(10, 2026);
  const userGroups = store.groups.filter((g) => g.members.some((m) => m.userId === user.id));

  const groupBalancesMap = {};
  for (const g of userGroups) {
    try {
      const balances = await getGroupBalances(g.id);
      groupBalancesMap[g.id] = balances[user.id] || 0;
    } catch {
      groupBalancesMap[g.id] = 0;
    }
  }

  const generated = generateInsights({
    user,
    expenses: store.expenses,
    income: store.income,
    budgets: userBudgets,
    categories: store.categories,
    recurring: store.recurring,
    groups: userGroups,
    groupBalancesMap,
    referenceDate: '2026-10-28'
  });

  return generated;
}

/**
 * Get in-app notifications with read status and unread badge count.
 * @returns {Promise<{ notifications: Object[], unreadCount: number }>}
 */
export async function getNotifications() {
  if (getApiMode() === 'api') return httpGetNotifications();

  const store = loadStore();
  const user = requireAuth(store);

  const insList = await insights();
  const readList = user.preferences?.readNotifications || [];
  const readSet = new Set(readList);

  const notifications = insList.map((ins) => {
    const isRead = readSet.has(ins.id);
    return {
      ...ins,
      read: isRead,
      isRead: isRead
    };
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  return { notifications, unreadCount };
}

/**
 * Mark a specific notification as read.
 * @param {string} id - Notification ID
 * @returns {Promise<{ ok: boolean }>}
 */
export async function markNotificationRead(id) {
  if (getApiMode() === 'api') return httpMarkNotificationRead(id);

  if (!id) return { ok: false };

  const store = loadStore();
  const user = requireAuth(store);

  const targetUser = store.users.find((u) => u.id === user.id);
  if (!targetUser) throw new ApiError('User not found', { status: 404 });

  if (!targetUser.preferences) targetUser.preferences = {};
  if (!Array.isArray(targetUser.preferences.readNotifications)) {
    targetUser.preferences.readNotifications = [];
  }

  if (!targetUser.preferences.readNotifications.includes(id)) {
    targetUser.preferences.readNotifications.push(id);
    saveStore(store);
  }

  return { ok: true };
}

/**
 * Mark all notifications as read for current user.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function markAllNotificationsRead() {
  if (getApiMode() === 'api') return httpMarkAllNotificationsRead();

  const store = loadStore();
  const user = requireAuth(store);

  const targetUser = store.users.find((u) => u.id === user.id);
  if (!targetUser) throw new ApiError('User not found', { status: 404 });

  const insList = await insights();
  if (!targetUser.preferences) targetUser.preferences = {};
  targetUser.preferences.readNotifications = insList.map((ins) => ins.id);

  saveStore(store);
  return { ok: true };
}

// =============================================================================
// GLOBAL SEARCH
// =============================================================================

/**
 * Search across expenses, income, groups, and shopping lists.
 * @param {string} query
 * @returns {Promise<{ expenses: Object[], income: Object[], groups: Object[], shoppingLists: Object[], shopping: Object[], total: number }>}
 */
export async function search(query) {
  if (getApiMode() === 'api') return httpSearch(query);

  if (!query || !query.trim()) {
    return { expenses: [], income: [], groups: [], shopping: [], shoppingLists: [], total: 0 };
  }

  const q = query.trim().toLowerCase();
  const store = loadStore();
  const user = requireAuth(store);

  const categoryNameMap = new Map((store.categories || []).map((c) => [c.id, (c.name || '').toLowerCase()]));

  const matchedExpenses = store.expenses
    .filter((e) => {
      if (e.userId !== user.id) return false;
      const desc = (e.description || '').toLowerCase();
      const notes = (e.notes || '').toLowerCase();
      const catName = categoryNameMap.get(e.categoryId) || '';
      return desc.includes(q) || notes.includes(q) || catName.includes(q);
    })
    .slice(0, 5);

  const matchedIncome = store.income
    .filter((i) => {
      if (i.userId !== user.id) return false;
      const src = (i.source || '').toLowerCase();
      const notes = (i.notes || '').toLowerCase();
      const catName = categoryNameMap.get(i.categoryId) || '';
      return src.includes(q) || notes.includes(q) || catName.includes(q);
    })
    .slice(0, 5);

  const matchedGroups = store.groups
    .filter((g) => {
      const isMember = g.members?.some((m) => m.userId === user.id);
      if (!isMember) return false;
      const name = (g.name || '').toLowerCase();
      const desc = (g.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    })
    .slice(0, 5);

  const userGroupIds = new Set(
    store.groups.filter((g) => g.members?.some((m) => m.userId === user.id)).map((g) => g.id)
  );

  const matchedShopping = store.shoppingLists
    .filter((sl) => {
      const hasAccess = sl.ownerId === user.id || (sl.groupId && userGroupIds.has(sl.groupId));
      if (!hasAccess) return false;
      const name = (sl.name || '').toLowerCase();
      const itemsMatch = Array.isArray(sl.items) && sl.items.some((it) => (it.name || '').toLowerCase().includes(q));
      return name.includes(q) || itemsMatch;
    })
    .slice(0, 5);

  const total = matchedExpenses.length + matchedIncome.length + matchedGroups.length + matchedShopping.length;

  return {
    expenses: matchedExpenses,
    income: matchedIncome,
    groups: matchedGroups,
    shopping: matchedShopping,
    shoppingLists: matchedShopping,
    total
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

// =============================================================================
// REVIEW 3 RECEIPT INTEGRATION EXPORTS
// =============================================================================

export async function updateGroup(id, data) {
  if (getApiMode() === 'api') return httpUpdateGroup(id, data);
  throw new ApiError('Updating groups is not supported in local mode.', { status: 501 });
}

export async function removeGroup(id) {
  if (getApiMode() === 'api') return httpRemoveGroup(id);
  throw new ApiError('Deleting groups is not supported in local mode.', { status: 501 });
}

export async function updateRecurring(id, data) {
  if (getApiMode() === 'api') return httpUpdateRecurring(id, data);
  throw new ApiError('Updating recurring items is not supported in local mode.', { status: 501 });
}

export async function uploadReceipt(file, options) {
  if (getApiMode() === 'api') {
    return httpUploadReceipt(file, options);
  }
  throw new ApiError('Receipt upload requires server API mode.', { status: 501 });
}

export async function confirmReceipt(receiptId, expenseData) {
  if (getApiMode() === 'api') {
    return httpConfirmReceipt(receiptId, expenseData);
  }
  throw new ApiError('Receipt confirmation requires server API mode.', { status: 501 });
}

export function getReceiptImageUrl(receiptId) {
  return httpGetReceiptImageUrl(receiptId);
}

export async function removeReceipt(id) {
  if (getApiMode() === 'api') {
    return httpRemoveReceipt(id);
  }
  const store = loadStore();
  const user = requireAuth(store);
  const idx = (store.receipts || []).findIndex((r) => r.id === id && r.userId === user.id);
  if (idx === -1) throw new ApiError('Receipt not found', { status: 404 });
  store.receipts.splice(idx, 1);
  saveStore(store);
  return { ok: true };
}
