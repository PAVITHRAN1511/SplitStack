/**
 * SplitStack Server Configuration (Review 3, Step P9).
 * Centralizes environment variable loading, default values, and environment detection.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Look for .env in server/ first, then workspace root
const serverEnvPath = path.resolve(__dirname, '../.env');
const rootEnvPath = path.resolve(__dirname, '../../.env');

dotenv.config({ path: serverEnvPath });
dotenv.config({ path: rootEnvPath });

/**
 * Parse and validate port number.
 * @param {string|number|undefined} val
 * @param {number} defaultPort
 * @returns {number}
 */
function parsePort(val, defaultPort = 3000) {
  if (val === undefined || val === null || val === '') {
    return defaultPort;
  }
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT configuration: "${val}". Must be an integer between 1 and 65535.`);
  }
  return parsed;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const isDevelopment = !isProduction && !isTest;

export const config = {
  nodeEnv,
  isProduction,
  isTest,
  isDevelopment,
  port: parsePort(process.env.PORT, 3000),
  host: process.env.HOST || 'localhost',
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || (isProduction ? (() => { throw new Error('JWT_SECRET must be set in production'); })() : 'splitstack-dev-jwt-secret-do-not-use-in-prod-12345'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieSecret: process.env.COOKIE_SECRET || 'splitstack-cookie-secret-dev',
  bcryptRounds: 12,
  clientDir: path.resolve(__dirname, '../../client'),
  maxReceiptSizeBytes: parseInt(process.env.MAX_RECEIPT_SIZE_BYTES, 10) || 5 * 1024 * 1024,
  ocrEnabled: process.env.OCR_ENABLED !== 'false',
  ocrLanguage: process.env.OCR_LANGUAGE || 'eng',
  uploadTempDir: path.resolve(__dirname, '../uploads/temp'),
};

export default config;
