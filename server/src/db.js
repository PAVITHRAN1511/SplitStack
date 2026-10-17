/**
 * SplitStack MongoDB Connection Manager (Review 3, Step P10).
 * Handles Mongoose connection lifecycle, safe URI sanitization, connection events,
 * and graceful disconnection without exposing credentials.
 */

import mongoose from 'mongoose';
import { config } from './config.js';

/**
 * Sanitize a MongoDB connection string for safe logging.
 * Masks credentials while preserving protocol, hosts, database, and options.
 * @param {string} uri
 * @returns {string} Sanitized URI
 */
export function sanitizeMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i, '$1***:***@');
}

/**
 * Ready state string mappings for mongoose.connection.readyState.
 */
export const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Connect to MongoDB using Mongoose.
 * @param {string} [uri] Connection string (defaults to config.mongodbUri)
 * @param {import('mongoose').ConnectOptions} [options]
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDb(uri = config.mongodbUri, options = {}) {
  const connectionUri = uri || config.mongodbUri;

  if (!connectionUri || typeof connectionUri !== 'string' || connectionUri.trim() === '') {
    throw new Error(
      'MongoDB connection failed: MONGODB_URI is not configured. ' +
      'Please set MONGODB_URI in server/.env (e.g. mongodb://127.0.0.1:27017/splitstack-dev).'
    );
  }

  const sanitized = sanitizeMongoUri(connectionUri);

  // Default connection options
  const defaultOptions = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    ...options,
  };

  try {
    if (config.isDevelopment && !config.isTest) {
      console.log(`[MongoDB] Connecting to ${sanitized}...`);
    }

    const conn = await mongoose.connect(connectionUri, defaultOptions);

    if (config.isDevelopment && !config.isTest) {
      const dbName = conn.connection.name || 'default';
      console.log(`[MongoDB] Successfully connected to database "${dbName}"`);
    }

    return conn;
  } catch (err) {
    const sanitizedError = new Error(
      `MongoDB connection failed (${sanitized}): ${err.message}`
    );
    sanitizedError.original = err;
    throw sanitizedError;
  }
}

/**
 * Disconnect from MongoDB cleanly.
 * @returns {Promise<void>}
 */
export async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Get current human-readable MongoDB connection state.
 * @returns {string} One of 'disconnected', 'connected', 'connecting', 'disconnecting'
 */
export function getConnectionState() {
  return READY_STATES[mongoose.connection.readyState] || 'unknown';
}

/**
 * Check if the database connection is currently active.
 * @returns {boolean}
 */
export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// Global connection event logging
mongoose.connection.on('error', (err) => {
  console.error('[MongoDB] Runtime connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  if (config.isDevelopment && !config.isTest) {
    console.log('[MongoDB] Connection disconnected.');
  }
});

export default {
  connectDb,
  disconnectDb,
  getConnectionState,
  isDbConnected,
  sanitizeMongoUri,
  READY_STATES,
};
