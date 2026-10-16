/**
 * SplitStack client data store backed by localStorage.
 * Versioned storage key: "splitstack:v1".
 * Resilient against private windows, corrupted JSON, and storage quota errors.
 */

import { getInitialSeedData } from './seed.js';

export const STORE_KEY = 'splitstack:v1';
export const SESSION_KEY = 'splitstack:session';
export const STORE_VERSION = 1;

// In-memory fallback if localStorage is disabled/inaccessible
let memoryStore = null;
let memorySession = null;

/**
 * Safely check if localStorage is operational.
 * @returns {boolean}
 */
function isLocalStorageAvailable() {
  try {
    const testKey = '__ss_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch (_) {
    return false;
  }
}

const hasStorage = isLocalStorageAvailable();

/**
 * Generate a unique ID (UUID v4).
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate that an object has the required collection arrays.
 * @param {any} data
 * @returns {boolean}
 */
function isValidStore(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.version !== STORE_VERSION) return false;

  const collections = [
    'users',
    'categories',
    'expenses',
    'income',
    'budgets',
    'recurring',
    'groups',
    'sharedExpenses',
    'settlements',
    'shoppingLists',
    'receipts',
    'insights'
  ];

  return collections.every((c) => Array.isArray(data[c]));
}

/**
 * Load the entire database from localStorage, or reseed if missing/corrupt.
 * @returns {Object} Complete data store
 */
export function loadStore() {
  if (!hasStorage) {
    if (!memoryStore) {
      memoryStore = { version: STORE_VERSION, ...getInitialSeedData() };
    }
    return memoryStore;
  }

  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      return reseed();
    }

    const parsed = JSON.parse(raw);
    if (!isValidStore(parsed)) {
      console.warn('[SplitStack] Detected invalid or legacy store schema; reseeding with initial demo data.');
      return reseed();
    }

    return parsed;
  } catch (err) {
    console.error('[SplitStack] Error reading store from localStorage, reseeding:', err);
    return reseed();
  }
}

/**
 * Save the entire database back to localStorage.
 * @param {Object} data
 */
export function saveStore(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('saveStore: data must be an object');
  }

  data.version = STORE_VERSION;

  if (!hasStorage) {
    memoryStore = data;
    return;
  }

  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('[SplitStack] localStorage save failed (quota or disabled):', err);
    memoryStore = data;
  }
}

/**
 * Reseed the store with the default sample data and default session.
 * @returns {Object} Fresh data store
 */
export function reseed() {
  const seed = {
    version: STORE_VERSION,
    ...getInitialSeedData()
  };
  saveStore(seed);

  // Set default logged-in session to Priya Raman (demo user)
  setSessionUserId('u_priya');

  return seed;
}

/**
 * Reset the store and session (used by "Reset demo data" button).
 * @returns {Object}
 */
export function reset() {
  return reseed();
}

/**
 * Get current session user ID.
 * @returns {string|null}
 */
export function getSessionUserId() {
  if (!hasStorage) {
    return memorySession || 'u_priya';
  }
  try {
    return localStorage.getItem(SESSION_KEY) || 'u_priya';
  } catch (_) {
    return memorySession || 'u_priya';
  }
}

/**
 * Set current session user ID.
 * @param {string|null} userId
 */
export function setSessionUserId(userId) {
  if (!hasStorage) {
    memorySession = userId;
    return;
  }
  try {
    if (userId) {
      localStorage.setItem(SESSION_KEY, userId);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (_) {
    memorySession = userId;
  }
}
