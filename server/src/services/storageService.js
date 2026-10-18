/**
 * SplitStack Receipt Image Storage Service (Review 3, Step P12).
 * Manages persistent image storage in MongoDB GridFS with memory/fallback support for tests.
 * Enforces server-controlled unique identifiers, streams binaries, and provides compensating cleanup.
 */

import crypto from 'crypto';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { isDbConnected } from '../db.js';

// In-memory buffer store for offline testing and fast mock fallback
const inMemoryStore = new Map();

/**
 * Generate a server-controlled unique storage filename.
 * Never uses or trusts client-supplied paths or original filenames.
 * @param {string} ext - Verified file extension (e.g. '.png', '.jpg', '.webp')
 * @returns {string}
 */
export function generateStorageKey(ext = '.jpg') {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  const timestamp = Date.now();
  const random = crypto.randomUUID();
  return `receipt_${timestamp}_${random}${safeExt}`;
}

/**
 * Save receipt image binary into storage (MongoDB GridFS when connected, in-memory store in tests).
 * @param {Object} params
 * @param {Buffer} params.buffer - Raw image bytes
 * @param {string} params.mimeType - Verified MIME type
 * @param {string} params.userId - Authenticated user ID
 * @param {string} [params.ext='.jpg'] - Verified extension
 * @returns {Promise<{ fileReference: string, storageType: 'gridfs'|'memory' }>}
 */
export async function storeReceiptImage({ buffer, mimeType, userId, ext = '.jpg' }) {
  const fileKey = generateStorageKey(ext);

  if (isDbConnected() && mongoose.connection.db) {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'receipts',
    });

    await new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(fileKey, {
        contentType: mimeType,
        metadata: {
          userId,
          mimeType,
          storedAt: new Date(),
        },
      });

      uploadStream.on('error', reject);
      uploadStream.on('finish', resolve);

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });

    return { fileReference: fileKey, storageType: 'gridfs' };
  }

  // Fallback to in-memory store (e.g. during database-independent automated tests)
  inMemoryStore.set(fileKey, {
    buffer,
    mimeType,
    userId,
    storedAt: new Date(),
  });

  return { fileReference: fileKey, storageType: 'memory' };
}

/**
 * Retrieve a readable stream of the receipt image.
 * @param {string} fileReference - Server storage key
 * @returns {Promise<{ stream: import('stream').Readable, mimeType: string }|null>}
 */
export async function getReceiptImageStream(fileReference) {
  if (!fileReference) return null;

  if (isDbConnected() && mongoose.connection.db) {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'receipts',
    });

    const files = await bucket.find({ filename: fileReference }).limit(1).toArray();
    if (!files || files.length === 0) {
      return null;
    }

    const fileDoc = files[0];
    const stream = bucket.openDownloadStreamByName(fileReference);
    return {
      stream,
      mimeType: fileDoc.metadata?.mimeType || fileDoc.contentType || 'image/jpeg',
      length: fileDoc.length,
    };
  }

  // Fallback memory retrieval
  const entry = inMemoryStore.get(fileReference);
  if (!entry) {
    return null;
  }

  const stream = new Readable();
  stream.push(entry.buffer);
  stream.push(null);

  return {
    stream,
    mimeType: entry.mimeType,
    length: entry.buffer.length,
  };
}

/**
 * Compensating cleanup: delete an uploaded receipt file from storage.
 * Invoked on OCR or database persistence failures to prevent orphan files.
 * @param {string} fileReference - Server storage key
 * @returns {Promise<boolean>}
 */
export async function deleteReceiptImage(fileReference) {
  if (!fileReference) return false;

  let deleted = false;

  if (isDbConnected() && mongoose.connection.db) {
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'receipts',
      });
      const files = await bucket.find({ filename: fileReference }).limit(1).toArray();
      if (files && files.length > 0) {
        await bucket.delete(files[0]._id);
        deleted = true;
      }
    } catch (err) {
      console.error(`[Storage] Failed to delete GridFS file "${fileReference}":`, err.message);
    }
  }

  if (inMemoryStore.has(fileReference)) {
    inMemoryStore.delete(fileReference);
    deleted = true;
  }

  return deleted;
}

/**
 * Helper to clear memory store during tests.
 */
export function resetMemoryStore() {
  inMemoryStore.clear();
}
