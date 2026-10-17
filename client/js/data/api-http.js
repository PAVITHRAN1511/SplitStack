/**
 * SplitStack HTTP REST API Client (Review 3, Step P13).
 * Communicates directly with the Express + MongoDB backend over /api.
 *
 * Supports:
 * - Centralized base URL configuration and credentials transport (HttpOnly cookies + Bearer token)
 * - JSON requests, query string serialization, and multipart receipt uploads
 * - Standardized error mapping to ApiError { field, message, status }
 * - Network failure, offline detection, and session invalidation
 * - Integer-paise monetary representation
 * - Explicit user data migration and export utilities
 */

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

let apiBaseUrl = '/api';
let inMemoryToken = null;

// Initialize in-memory token from sessionStorage if available (tab-scoped, never localStorage)
try {
  if (typeof sessionStorage !== 'undefined') {
    inMemoryToken = sessionStorage.getItem('splitstack_session_token');
  }
} catch (_) {}

/**
 * Get current configured API base URL.
 * @returns {string}
 */
export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.__SPLITSTACK_API_BASE_URL__) {
    return window.__SPLITSTACK_API_BASE_URL__;
  }
  return apiBaseUrl;
}

/**
 * Set custom API base URL (useful for testing or cross-origin configurations).
 * @param {string} url
 */
export function setApiBaseUrl(url) {
  apiBaseUrl = (url || '/api').replace(/\/+$/, '');
}

/**
 * Get the active authentication token from memory.
 * @returns {string|null}
 */
export function getAuthToken() {
  return inMemoryToken;
}

/**
 * Set the active authentication token in memory and tab session storage.
 * @param {string|null} token
 */
export function setAuthToken(token) {
  inMemoryToken = token || null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (token) {
        sessionStorage.setItem('splitstack_session_token', token);
      } else {
        sessionStorage.removeItem('splitstack_session_token');
      }
    }
  } catch (_) {}
}

/**
 * Centralized HTTP request dispatcher with error mapping and credential transport.
 * @param {string} endpoint - Relative path (e.g. '/expenses')
 * @param {Object} [options]
 * @param {string} [options.method='GET']
 * @param {Object} [options.params] - Query parameters
 * @param {any} [options.body] - Request payload (JSON object or FormData)
 * @param {Object} [options.headers] - Additional headers
 * @returns {Promise<any>}
 */
export async function request(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // 1. Build URL with query parameters
  let url = `${base}${cleanEndpoint}`;
  if (options.params && typeof options.params === 'object') {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  // 2. Prepare headers
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  // 3. Prepare fetch options
  const fetchOptions = {
    method,
    headers,
    credentials: options.credentials || 'include', // Transports HttpOnly auth cookie
  };

  if (options.body !== undefined) {
    fetchOptions.body = isFormData ? options.body : JSON.stringify(options.body);
  }

  // 4. Execute fetch with network error and offline detection
  let res;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const msg = isOffline
      ? 'You are currently offline. Please check your network connection.'
      : (err.message || 'Network connection failed. Unable to reach server.');
    throw new ApiError(msg, { status: 0 });
  }

  // 5. Handle empty responses (204 No Content)
  if (res.status === 204) {
    return {};
  }

  // 6. Parse response payload
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
  } else {
    data = await res.text();
  }

  // 7. Handle HTTP errors
  if (!res.ok) {
    let errorMsg = 'An error occurred while processing your request.';
    let errorField = null;

    if (data && typeof data === 'object') {
      errorMsg = data.message || data.error || errorMsg;
      if (data.fields && typeof data.fields === 'object') {
        const keys = Object.keys(data.fields);
        if (keys.length > 0) {
          errorField = keys[0];
          errorMsg = data.fields[errorField] || errorMsg;
        }
      }
    } else if (typeof data === 'string' && data.trim()) {
      errorMsg = data.slice(0, 150);
    }

    // Handle session expiration
    if (res.status === 401) {
      setAuthToken(null);
    }

    throw new ApiError(errorMsg, { field: errorField, status: res.status });
  }

  return data;
}

// =============================================================================
// AUTHENTICATION & SESSION
// =============================================================================

export async function httpRegister({ name, email, password }) {
  const data = await request('/auth/register', {
    method: 'POST',
    body: { name, email, password },
  });

  if (data?.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function httpLogin({ email, password }) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (data?.token) {
    setAuthToken(data.token);
  }

  // Return user object with token attached for compatibility
  const user = data?.user || data;
  return { ...user, token: data?.token };
}

export async function httpLogout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    setAuthToken(null);
  }
  return { ok: true };
}

export async function httpCurrentUser() {
  try {
    const data = await request('/auth/me');
    return data?.user || data || null;
  } catch (err) {
    if (err.status === 401) {
      setAuthToken(null);
      return null;
    }
    throw err;
  }
}

export async function httpUpdateProfile(updates = {}) {
  const { name, email, preferences } = updates;
  const payload = {
    name,
    email,
    currency: preferences?.currency,
    theme: preferences?.theme,
    monthlyBudget: preferences?.monthlyBudget,
  };

  const data = await request('/auth/profile', {
    method: 'PATCH',
    body: payload,
  });
  return data?.user || data;
}

export async function httpChangePassword({ currentPassword, newPassword }) {
  return request('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

// =============================================================================
// EXPENSES
// =============================================================================

export async function httpListExpenses(filters = {}) {
  const params = {
    page: filters.page,
    limit: filters.limit,
    search: filters.search || filters.q,
    categoryId: filters.categoryId || filters.category,
    paymentMethod: filters.paymentMethod || filters.method,
    startDate: filters.startDate || filters.from,
    endDate: filters.endDate || filters.to,
    minPaise: filters.minAmount ?? filters.minPaise,
    maxPaise: filters.maxAmount ?? filters.maxPaise,
    sort: filters.sort,
  };

  const data = await request('/expenses', { params });
  const items = (data?.items || []).map((e) => ({
    ...e,
    id: e.id || e._id,
    categoryId: e.categoryId || (e.category?._id ? e.category._id.toString() : e.category),
  }));

  return {
    items,
    expenses: items,
    total: data?.total ?? items.length,
    page: data?.page ?? 1,
    limit: data?.limit ?? items.length,
    totalPages: data?.totalPages ?? 1,
  };
}

export async function httpGetExpense(id) {
  const data = await request(`/expenses/${id}`);
  return {
    ...data,
    id: data.id || data._id,
    categoryId: data.categoryId || (data.category?._id ? data.category._id.toString() : data.category),
  };
}

export async function httpCreateExpense(expenseData) {
  const data = await request('/expenses', {
    method: 'POST',
    body: expenseData,
  });
  return {
    ...data,
    id: data.id || data._id,
    categoryId: data.categoryId || (data.category?._id ? data.category._id.toString() : data.category),
  };
}

export async function httpUpdateExpense(id, updates) {
  const data = await request(`/expenses/${id}`, {
    method: 'PATCH',
    body: updates,
  });
  return {
    ...data,
    id: data.id || data._id,
    categoryId: data.categoryId || (data.category?._id ? data.category._id.toString() : data.category),
  };
}

export async function httpRemoveExpense(id) {
  return request(`/expenses/${id}`, { method: 'DELETE' });
}

// =============================================================================
// INCOME
// =============================================================================

export async function httpListIncome(filters = {}) {
  const params = {
    page: filters.page,
    limit: filters.limit,
    search: filters.search || filters.q,
    source: filters.source,
    startDate: filters.startDate || filters.from,
    endDate: filters.endDate || filters.to,
    minPaise: filters.minAmount ?? filters.minPaise,
    maxPaise: filters.maxAmount ?? filters.maxPaise,
    sort: filters.sort,
  };

  const data = await request('/income', { params });
  const items = (data?.items || []).map((i) => ({
    ...i,
    id: i.id || i._id,
    categoryId: i.categoryId || (i.category?._id ? i.category._id.toString() : i.category),
  }));

  return {
    items,
    income: items,
    total: data?.total ?? items.length,
    page: data?.page ?? 1,
    limit: data?.limit ?? items.length,
    totalPages: data?.totalPages ?? 1,
  };
}

export async function httpGetIncome(id) {
  const data = await request(`/income/${id}`);
  return {
    ...data,
    id: data.id || data._id,
    categoryId: data.categoryId || (data.category?._id ? data.category._id.toString() : data.category),
  };
}

export async function httpCreateIncome(incomeData) {
  const data = await request('/income', {
    method: 'POST',
    body: incomeData,
  });
  return {
    ...data,
    id: data.id || data._id,
    categoryId: data.categoryId || (data.category?._id ? data.category._id.toString() : data.category),
  };
}

export async function httpUpdateIncome(id, updates) {
  const data = await request(`/income/${id}`, {
    method: 'PATCH',
    body: updates,
  });
  return {
    ...data,
    id: data.id || data._id,
    categoryId: data.categoryId || (data.category?._id ? data.category._id.toString() : data.category),
  };
}

export async function httpRemoveIncome(id) {
  return request(`/income/${id}`, { method: 'DELETE' });
}

// =============================================================================
// CATEGORIES
// =============================================================================

export async function httpListCategories(filter = {}) {
  const params = filter.type ? { type: filter.type } : undefined;
  const list = await request('/categories', { params });
  return (list || []).map((c) => ({
    ...c,
    id: c.id || c._id,
  }));
}

export async function httpGetCategory(id) {
  const data = await request(`/categories/${id}`);
  return { ...data, id: data.id || data._id };
}

export async function httpCreateCategory(categoryData) {
  const data = await request('/categories', {
    method: 'POST',
    body: categoryData,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpUpdateCategory(id, updates) {
  const data = await request(`/categories/${id}`, {
    method: 'PATCH',
    body: updates,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpRemoveCategory(id) {
  return request(`/categories/${id}`, { method: 'DELETE' });
}

// =============================================================================
// BUDGETS
// =============================================================================

export async function httpListBudgets(arg1 = 10, arg2 = 2026) {
  const month = typeof arg1 === 'number' ? arg1 : (arg1?.month ?? 10);
  const year = typeof arg2 === 'number' ? arg2 : (arg1?.year ?? 2026);

  const data = await request('/budgets', { params: { month, year } });
  const rawList = Array.isArray(data) ? data : data?.categories || [];

  return rawList.map((b) => ({
    ...b,
    id: b.id || b._id,
    categoryId: b.categoryId || (b.category?._id ? b.category._id.toString() : b.category) || null,
    spentPercentage: b.percentage ?? b.spentPercentage ?? 0,
    percentage: b.percentage ?? b.spentPercentage ?? 0,
  }));
}

export async function httpCreateBudget(budgetData) {
  const data = await request('/budgets', {
    method: 'POST',
    body: budgetData,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpUpdateBudget(id, updates) {
  const data = await request(`/budgets/${id}`, {
    method: 'PATCH',
    body: updates,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpRemoveBudget(id) {
  return request(`/budgets/${id}`, { method: 'DELETE' });
}

// =============================================================================
// RECURRING PAYMENTS
// =============================================================================

export async function httpListRecurring(filter = {}) {
  const params = filter.active !== undefined ? { active: filter.active } : undefined;
  const list = await request('/recurring', { params });
  return (list || []).map((r) => ({
    ...r,
    id: r.id || r._id,
    categoryId: r.categoryId || (r.category?._id ? r.category._id.toString() : r.category),
  }));
}

export async function httpCreateRecurring(recurringData) {
  const data = await request('/recurring', {
    method: 'POST',
    body: recurringData,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpToggleRecurring(id) {
  const data = await request(`/recurring/${id}/toggle`, { method: 'PATCH' });
  return { ...data, id: data.id || data._id };
}

export async function httpUpdateRecurring(id, updates) {
  const data = await request(`/recurring/${id}`, {
    method: 'PATCH',
    body: updates,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpRemoveRecurring(id) {
  return request(`/recurring/${id}`, { method: 'DELETE' });
}

// =============================================================================
// GROUPS & GROUP EXPENSES
// =============================================================================

export async function httpListGroups() {
  const list = await request('/groups');
  return (list || []).map((g) => ({
    ...g,
    id: g.id || g._id,
    members: (g.members || []).map((m) => ({
      ...m,
      id: m.id || m._id || m.userId,
      userId: m.userId || m.id || m._id,
    })),
  }));
}

export async function httpGetGroup(id) {
  const data = await request(`/groups/${id}`);
  return {
    ...data,
    id: data.id || data._id,
    members: (data.members || []).map((m) => ({
      ...m,
      id: m.id || m._id || m.userId,
      userId: m.userId || m.id || m._id,
    })),
  };
}

export async function httpCreateGroup({ name, description = '', memberEmails = [], currency = 'INR' }) {
  const members = memberEmails.map((item) => {
    if (typeof item === 'string') return { email: item.trim() };
    return item;
  });

  const data = await request('/groups', {
    method: 'POST',
    body: { name, description, currency, members },
  });
  return { ...data, id: data.id || data._id };
}

export async function httpUpdateGroup(id, updates) {
  const data = await request(`/groups/${id}`, {
    method: 'PATCH',
    body: updates,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpRemoveGroup(id) {
  return request(`/groups/${id}`, { method: 'DELETE' });
}

export async function httpAddMember(groupId, member) {
  const body = typeof member === 'string'
    ? { email: member }
    : { email: member.email, name: member.name, role: member.role || 'member' };

  const data = await request(`/groups/${groupId}/members`, {
    method: 'POST',
    body,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpRemoveMember(groupId, userId) {
  const data = await request(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
  return { ...data, id: data.id || data._id };
}

export async function httpLeaveGroup(groupId) {
  return request(`/groups/${groupId}/leave`, { method: 'POST' });
}

export async function httpListSharedExpenses(groupId) {
  const list = await request(`/groups/${groupId}/expenses`);
  return (list || []).map((e) => ({
    ...e,
    id: e.id || e._id,
    title: e.description || e.title,
  }));
}

export async function httpCreateSharedExpense(groupId, expenseData) {
  const { title, description, amount, categoryId, date, splitType = 'equal', shares = [], paidBy } = expenseData;

  const payload = {
    description: title || description,
    amount,
    categoryId,
    date,
    splitType,
    payerId: paidBy,
    participants: shares.map((s) => ({
      memberId: s.userId || s.memberId,
      sharePaise: s.amount ?? s.sharePaise,
    })),
  };

  const data = await request(`/groups/${groupId}/expenses`, {
    method: 'POST',
    body: payload,
  });
  return {
    ...data,
    id: data.id || data._id,
    title: data.description || data.title,
  };
}

export async function httpRemoveSharedExpense(groupId, expenseId) {
  return request(`/groups/${groupId}/expenses/${expenseId}`, { method: 'DELETE' });
}

export async function httpGetGroupBalances(groupId) {
  const data = await request(`/groups/${groupId}/balances`);
  // Return net balances object indexable by userId
  return data?.netBalances || data?.balances || data;
}

export async function httpGetGroupMemberStats(groupId) {
  const data = await request(`/groups/${groupId}/member-stats`);
  return data?.members || data;
}

export async function httpGetSuggestedSettlements(groupId) {
  const data = await request(`/groups/${groupId}/suggested-settlements`);
  return data?.settlements || data;
}

export async function httpListSettlements(groupId) {
  const list = await request(`/groups/${groupId}/settlements`);
  return (list || []).map((s) => ({
    ...s,
    id: s.id || s._id,
  }));
}

export async function httpRecordSettlement(groupId, { payerId, payeeId, amount, date, notes = '' }) {
  const data = await request(`/groups/${groupId}/settlements`, {
    method: 'POST',
    body: { payerId, payeeId, amount, date, notes },
  });
  return { ...data, id: data.id || data._id };
}

export async function httpRemoveSettlement(groupIdOrId, maybeSettlementId) {
  if (maybeSettlementId) {
    return request(`/groups/${groupIdOrId}/settlements/${maybeSettlementId}`, { method: 'DELETE' });
  }
  return request(`/groups/settlements/${groupIdOrId}`, { method: 'DELETE' });
}

// =============================================================================
// SHOPPING LISTS
// =============================================================================

export async function httpListShoppingLists(groupId = null) {
  const params = groupId ? { groupId } : undefined;
  const list = await request('/shopping', { params });
  return (list || []).map((sl) => ({
    ...sl,
    id: sl.id || sl._id,
    budget: sl.estimatedBudget ?? sl.budget ?? 0,
    items: (sl.items || []).map((it) => ({
      ...it,
      id: it.id || it._id,
    })),
  }));
}

export async function httpGetShoppingList(id) {
  const data = await request(`/shopping/${id}`);
  return {
    ...data,
    id: data.id || data._id,
    budget: data.estimatedBudget ?? data.budget ?? 0,
    items: (data.items || []).map((it) => ({
      ...it,
      id: it.id || it._id,
    })),
  };
}

export async function httpCreateShoppingList(listData) {
  const payload = {
    name: listData.name,
    description: listData.description || '',
    estimatedBudget: listData.budget ?? listData.estimatedBudget ?? 0,
    groupId: listData.groupId || null,
    items: listData.items || [],
  };

  const data = await request('/shopping', {
    method: 'POST',
    body: payload,
  });
  return {
    ...data,
    id: data.id || data._id,
    budget: data.estimatedBudget ?? data.budget ?? 0,
  };
}

export async function httpUpdateShoppingList(id, updates) {
  const payload = { ...updates };
  if (payload.budget !== undefined) {
    payload.estimatedBudget = payload.budget;
  }

  const data = await request(`/shopping/${id}`, {
    method: 'PATCH',
    body: payload,
  });
  return {
    ...data,
    id: data.id || data._id,
    budget: data.estimatedBudget ?? data.budget ?? 0,
  };
}

export async function httpRemoveShoppingList(id) {
  return request(`/shopping/${id}`, { method: 'DELETE' });
}

export async function httpAddShoppingItem(listId, itemData) {
  const data = await request(`/shopping/${listId}/items`, {
    method: 'POST',
    body: itemData,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpToggleShoppingItem(listId, itemId, actualPrice = null) {
  const body = actualPrice !== null ? { actualPrice } : {};
  const data = await request(`/shopping/${listId}/items/${itemId}/toggle`, {
    method: 'PATCH',
    body,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpUpdateShoppingItem(listId, itemId, updates) {
  const data = await request(`/shopping/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: updates,
  });
  return { ...data, id: data.id || data._id };
}

export async function httpRemoveShoppingItem(listId, itemId) {
  return request(`/shopping/${listId}/items/${itemId}`, { method: 'DELETE' });
}

export async function httpConvertShoppingListToExpense(listId, options = {}) {
  const opts = typeof options === 'string' ? { categoryId: options } : options || {};
  const data = await request(`/shopping/${listId}/convert-expense`, {
    method: 'POST',
    body: opts,
  });
  return { ...data, id: data.id || data._id };
}

// =============================================================================
// ANALYTICS, FORECAST, INSIGHTS & NOTIFICATIONS
// =============================================================================

export async function httpMonthlySummary(arg = {}) {
  let monthsBack = 6;
  let month;
  let year;
  if (typeof arg === 'number') {
    monthsBack = Math.max(1, arg);
  } else if (typeof arg === 'object' && arg !== null) {
    if (typeof arg.monthsBack === 'number') monthsBack = Math.max(1, arg.monthsBack);
    if (arg.month) month = arg.month;
    if (arg.year) year = arg.year;
  }

  return request('/analytics/monthly', { params: { month, year, monthsBack } });
}

export async function httpByCategory(arg1 = 10, arg2 = 2026, arg3 = 'expense') {
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

  return request('/analytics/categories', { params: { month, year, type } });
}

export async function httpForecast(arg1 = 10, arg2 = 2026) {
  let month = 10;
  let year = 2026;

  if (typeof arg1 === 'object' && arg1 !== null) {
    month = arg1.month ?? 10;
    year = arg1.year ?? 2026;
  } else {
    if (typeof arg1 === 'number') month = arg1;
    if (typeof arg2 === 'number') year = arg2;
  }

  const data = await request('/analytics/forecast', { params: { month, year } });
  return {
    ...data,
    totalSoFar: data.currentSpent,
    projectedSpend: data.projectedSpent,
    monthlyBudget: data.budgetLimit,
  };
}

export async function httpInsights() {
  const data = await request('/analytics/insights');
  return data?.insights || data || [];
}

export async function httpGetNotifications() {
  const data = await request('/notifications');
  return {
    notifications: data?.notifications || [],
    unreadCount: data?.unreadCount ?? (data?.notifications || []).filter((n) => !n.read).length,
  };
}

export async function httpMarkNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'PATCH' });
}

export async function httpMarkAllNotificationsRead() {
  return request('/notifications/mark-all-read', { method: 'POST' });
}

export async function httpSearch(query) {
  if (!query || !query.trim()) {
    return { expenses: [], income: [], groups: [], shopping: [], shoppingLists: [], total: 0 };
  }

  const data = await request('/search', { params: { q: query.trim() } });
  return {
    expenses: data.expenses || [],
    income: data.income || [],
    groups: data.groups || [],
    shopping: data.shopping || [],
    shoppingLists: data.shopping || [],
    total: data.total || 0,
  };
}

// =============================================================================
// RECEIPTS & MULTIPART UPLOADS
// =============================================================================

export async function httpListReceipts() {
  const list = await request('/receipts');
  return (list || []).map((r) => ({
    ...r,
    id: r.id || r._id,
  }));
}

export async function httpGetReceipt(id) {
  const data = await request(`/receipts/${id}`);
  return { ...data, id: data.id || data._id };
}

export function httpGetReceiptImageUrl(id) {
  const base = getApiBaseUrl();
  return `${base}/receipts/${id}/image`;
}

/**
 * Upload receipt image using multipart/form-data.
 * Do NOT set manual multipart headers; fetch auto-populates boundary.
 * @param {File|Blob} file
 * @param {Object} [options={}]
 * @returns {Promise<{ receipt: Object, candidate: Object }>}
 */
export async function httpUploadReceipt(file, options = {}) {
  if (!file) {
    throw new ApiError('Please select a receipt image to upload.', { field: 'receipt', status: 400 });
  }

  const formData = new FormData();
  formData.append('receipt', file, file.name || 'receipt.png');

  if (options.mockOcrText) {
    formData.append('mockOcrText', options.mockOcrText);
  }
  if (options.bypassOcr) {
    formData.append('bypassOcr', 'true');
  }

  const data = await request('/receipts/upload', {
    method: 'POST',
    body: formData,
  });

  return {
    receipt: {
      ...data.receipt,
      id: data.receipt?.id || data.receipt?._id,
    },
    candidate: data.candidate,
  };
}

/**
 * Confirm draft receipt and record an expense.
 * Rejects duplicate confirmation with 409 Conflict.
 * @param {string} id - Receipt ObjectId
 * @param {Object} expenseData
 * @returns {Promise<{ receipt: Object, expense: Object }>}
 */
export async function httpConfirmReceipt(id, expenseData) {
  const data = await request(`/receipts/${id}/confirm`, {
    method: 'POST',
    body: expenseData,
  });

  return {
    receipt: {
      ...data.receipt,
      id: data.receipt?.id || data.receipt?._id,
    },
    expense: {
      ...data.expense,
      id: data.expense?.id || data.expense?._id,
    },
  };
}

export async function httpRemoveReceipt(id) {
  return request(`/receipts/${id}`, { method: 'DELETE' });
}

// =============================================================================
// DATA MIGRATION & RECOVERY UTILITIES
// =============================================================================

/**
 * Export all local data stored in browser localStorage.
 * Does not modify or delete any records.
 * @returns {Object} Full snapshot of local data
 */
export function exportLocalData() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem('splitstack:v1');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('[SplitStack] Error exporting local data:', err);
    return {};
  }
}

/**
 * Deliberate, user-initiated migration helper.
 * Validates local financial records and safely imports them to the server
 * via REST API endpoints with authenticated session verification.
 * @returns {Promise<{ categoriesCount: number, expensesCount: number, incomeCount: number, groupsCount: number, shoppingCount: number }>}
 */
export async function importLocalDataToServer() {
  const localData = exportLocalData();
  const summary = {
    categoriesCount: 0,
    expensesCount: 0,
    incomeCount: 0,
    groupsCount: 0,
    shoppingCount: 0,
  };

  // 1. Verify authenticated user
  const user = await httpCurrentUser();
  if (!user) {
    throw new ApiError('Authentication required before migrating local data to server.', { status: 401 });
  }

  // 2. Migrate custom categories
  if (Array.isArray(localData.categories)) {
    const customCats = localData.categories.filter((c) => c.userId);
    for (const cat of customCats) {
      try {
        await httpCreateCategory({
          name: cat.name,
          type: cat.type || 'expense',
          icon: cat.icon || 'tag',
          color: cat.color || '#6366f1',
        });
        summary.categoriesCount++;
      } catch (_) {}
    }
  }

  // 3. Migrate expenses
  if (Array.isArray(localData.expenses)) {
    for (const exp of localData.expenses) {
      try {
        await httpCreateExpense({
          description: exp.description,
          amount: exp.amount,
          date: exp.date,
          categoryId: exp.categoryId,
          paymentMethod: exp.paymentMethod || 'UPI',
          notes: exp.notes || '',
        });
        summary.expensesCount++;
      } catch (_) {}
    }
  }

  // 4. Migrate income
  if (Array.isArray(localData.income)) {
    for (const inc of localData.income) {
      try {
        await httpCreateIncome({
          source: inc.source || inc.description,
          amount: inc.amount,
          date: inc.date,
          categoryId: inc.categoryId,
          paymentMethod: inc.paymentMethod || 'Net banking',
          notes: inc.notes || '',
        });
        summary.incomeCount++;
      } catch (_) {}
    }
  }

  // 5. Migrate groups
  if (Array.isArray(localData.groups)) {
    for (const grp of localData.groups) {
      try {
        await httpCreateGroup({
          name: grp.name,
          description: grp.description || '',
          memberEmails: (grp.members || []).map((m) => m.email).filter(Boolean),
        });
        summary.groupsCount++;
      } catch (_) {}
    }
  }

  // 6. Migrate shopping lists
  if (Array.isArray(localData.shoppingLists)) {
    for (const sl of localData.shoppingLists) {
      try {
        await httpCreateShoppingList({
          name: sl.name,
          budget: sl.budget || 0,
          items: sl.items || [],
        });
        summary.shoppingCount++;
      } catch (_) {}
    }
  }

  return summary;
}
