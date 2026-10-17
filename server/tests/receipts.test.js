/**
 * SplitStack Receipt Upload & Server-Side OCR Tests (Review 3, Step P12).
 * Comprehensive test suite verifying:
 * 1. Image binary magic byte inspection (anti-MIME-spoofing).
 * 2. Unauthenticated request rejection (401 Unauthorized).
 * 3. Upload validations (empty file, unsupported type, misleading MIME type, oversized file).
 * 4. OCR candidate extraction, confidence scoring, and safe error handling.
 * 5. Persistent receipt metadata retrieval and authorized binary streaming.
 * 6. Strict ownership isolation and cross-user access denial (404 Not Found).
 * 7. Receipt confirmation into expenses with duplicate protection (409 Conflict).
 * 8. Deletion lifecycle and compensating storage cleanup.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { generateToken } from '../src/services/authService.js';
import {
  validateImageSignature,
  SUPPORTED_FORMATS,
} from '../src/middleware/upload.js';
import {
  generateStorageKey,
  storeReceiptImage,
  getReceiptImageStream,
  deleteReceiptImage,
  resetMemoryStore,
} from '../src/services/storageService.js';
import { processReceiptOcr } from '../src/services/ocrService.js';
import { resetMockReceipts } from '../src/routes/receipts.js';

// Safe test image fixtures (generated programmatically, no real or private data)
const VALID_PNG_BUFFER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d0b400000000049454e44ae426082',
  'hex'
);

const VALID_JPEG_BUFFER = Buffer.from(
  'ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9',
  'hex'
);

const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x18, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x0c, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
  0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
]);

const MISLEADING_TEXT_BUFFER = Buffer.from('This is a text file maliciously claiming to be an image.');
const EMPTY_BUFFER = Buffer.alloc(0);
const OVERSIZED_BUFFER = Buffer.alloc(5 * 1024 * 1024 + 1024); // > 5 MB

describe('SplitStack Receipt Upload & Server-Side OCR (Step P12)', () => {
  let server;
  let baseUrl;
  let tokenA;
  let tokenB;

  const userA = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    email: 'alice@example.com',
    name: 'Alice Owner',
  };

  const userB = {
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    email: 'bob@example.com',
    name: 'Bob Intruder',
  };

  before(async () => {
    tokenA = generateToken(userA);
    tokenB = generateToken(userB);

    const testApp = createApp({
      nodeEnv: 'test',
      isTest: true,
      isDevelopment: false,
    });

    await new Promise((resolve) => {
      server = http.createServer(testApp);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetMemoryStore();
    resetMockReceipts();
  });

  // ---------------------------------------------------------------------------
  // 1. Binary Magic Byte Validation
  // ---------------------------------------------------------------------------
  describe('1. Binary Image Magic Byte Inspection (Anti-MIME-Spoofing)', () => {
    it('accepts valid PNG magic bytes (89 50 4E 47)', () => {
      const res = validateImageSignature(VALID_PNG_BUFFER);
      assert.equal(res.valid, true);
      assert.equal(res.mimeType, SUPPORTED_FORMATS.PNG.mime);
      assert.equal(res.ext, '.png');
    });

    it('accepts valid JPEG magic bytes (FF D8 FF)', () => {
      const res = validateImageSignature(VALID_JPEG_BUFFER);
      assert.equal(res.valid, true);
      assert.equal(res.mimeType, SUPPORTED_FORMATS.JPEG.mime);
      assert.equal(res.ext, '.jpg');
    });

    it('accepts valid WEBP magic bytes (RIFF ... WEBP)', () => {
      const res = validateImageSignature(VALID_WEBP_BUFFER);
      assert.equal(res.valid, true);
      assert.equal(res.mimeType, SUPPORTED_FORMATS.WEBP.mime);
      assert.equal(res.ext, '.webp');
    });

    it('rejects plain text buffers even if caller claims image format', () => {
      const res = validateImageSignature(MISLEADING_TEXT_BUFFER);
      assert.equal(res.valid, false);
      assert.ok(res.error.includes('Unsupported file format'));
    });

    it('rejects empty or truncated buffers (<12 bytes)', () => {
      const res = validateImageSignature(Buffer.from([0x89, 0x50]));
      assert.equal(res.valid, false);
      assert.ok(res.error.includes('Empty or corrupted image payload'));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Storage Service Lifecycle
  // ---------------------------------------------------------------------------
  describe('2. Storage Service Lifecycle & Server-Controlled Filenames', () => {
    it('generates unique, server-controlled storage keys with safe extensions', () => {
      const key1 = generateStorageKey('.png');
      const key2 = generateStorageKey('.png');
      assert.notEqual(key1, key2);
      assert.ok(key1.startsWith('receipt_'));
      assert.ok(key1.endsWith('.png'));
      assert.ok(!key1.includes('/'));
      assert.ok(!key1.includes('\\'));
    });

    it('stores, retrieves, and cleans up binary image stream', async () => {
      const stored = await storeReceiptImage({
        buffer: VALID_PNG_BUFFER,
        mimeType: 'image/png',
        userId: userA.id,
        ext: '.png',
      });

      assert.ok(stored.fileReference);

      // Retrieve stream
      const streamData = await getReceiptImageStream(stored.fileReference);
      assert.ok(streamData);
      assert.equal(streamData.mimeType, 'image/png');
      assert.equal(streamData.length, VALID_PNG_BUFFER.length);

      // Compensating cleanup
      const deleted = await deleteReceiptImage(stored.fileReference);
      assert.equal(deleted, true);

      // Verify no orphan remains
      const streamAfterDelete = await getReceiptImageStream(stored.fileReference);
      assert.equal(streamAfterDelete, null);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. OCR Extraction & Candidate Parsing
  // ---------------------------------------------------------------------------
  describe('3. OCR Candidate Extraction & Fault-Tolerant Parsing', () => {
    it('extracts merchant, date, amount, and confidence from receipt text', async () => {
      const sampleText = `
        FRESH SUPERMARKET
        Date: 2026-03-15
        Items:
        Milk - Rs. 60.00
        Bread - Rs. 40.00
        TOTAL: Rs. 100.00
        Thank you for visiting!
      `;

      const result = await processReceiptOcr(VALID_PNG_BUFFER, {
        mockText: sampleText,
      });

      assert.equal(result.ocrSuccess, true);
      assert.equal(result.merchant, 'FRESH SUPERMARKET');
      assert.equal(result.date, '2026-03-15');
      assert.equal(result.amountPaise, 10000); // 100.00 INR = 10000 paise
      assert.ok(result.confidence >= 0.8);
      assert.ok(result.rawText.includes('FRESH SUPERMARKET'));
    });

    it('handles unrecognizable receipt text gracefully without throwing', async () => {
      const result = await processReceiptOcr(VALID_PNG_BUFFER, {
        mockText: '---===---',
      });

      assert.equal(result.ocrSuccess, true);
      assert.equal(result.merchant, 'Unknown Merchant');
      assert.equal(result.amountPaise, 0);
    });

    it('handles bypassOcr mode cleanly for fast test cycles', async () => {
      const result = await processReceiptOcr(VALID_PNG_BUFFER, {
        bypassOcr: true,
      });

      assert.equal(result.ocrSuccess, true);
      assert.equal(result.merchant, 'Unknown Merchant');
    });

    it('safely handles real Tesseract OCR processing failure without throwing', async () => {
      const corruptPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d0b400000000049454e44ae426082', 'hex');
      const res = await processReceiptOcr(corruptPng);
      assert.equal(res.ocrSuccess, false);
      assert.ok(res.error.includes('OCR processing failed'));
      assert.equal(res.merchant, 'Unrecognized Receipt');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Unauthenticated Access Protection
  // ---------------------------------------------------------------------------
  describe('4. Unauthenticated Access Protection (401 Unauthorized)', () => {
    it('POST /api/receipts/upload rejects unauthenticated requests with 401', async () => {
      const formData = new FormData();
      formData.append('receipt', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'receipt.png');

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'UnauthorizedError');
    });

    it('GET /api/receipts rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/receipts`);
      assert.equal(res.status, 401);
    });

    it('GET /api/receipts/:id rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/507f1f77bcf86cd799439001`);
      assert.equal(res.status, 401);
    });

    it('GET /api/receipts/:id/image rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/507f1f77bcf86cd799439001/image`);
      assert.equal(res.status, 401);
    });

    it('POST /api/receipts/:id/confirm rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/507f1f77bcf86cd799439001/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Coffee', amount: 15000, categoryId: '507f1f77bcf86cd799439099' }),
      });
      assert.equal(res.status, 401);
    });

    it('DELETE /api/receipts/:id rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/507f1f77bcf86cd799439001`, {
        method: 'DELETE',
      });
      assert.equal(res.status, 401);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Upload Validation & Error Safeguards
  // ---------------------------------------------------------------------------
  describe('5. Upload Validation & File Safeguards (400 Bad Request)', () => {
    it('rejects upload with missing receipt file', async () => {
      const formData = new FormData();
      // No file attached

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('No receipt file'));
    });

    it('rejects unsupported file format (.txt / text/plain)', async () => {
      const formData = new FormData();
      formData.append('receipt', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'note.txt');

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('Unsupported file format'));
    });

    it('rejects misleading MIME type (client specifies image/png but file is plain text)', async () => {
      const formData = new FormData();
      formData.append('receipt', new Blob([MISLEADING_TEXT_BUFFER], { type: 'image/png' }), 'fake.png');

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('corrupted image payload') || data.message.includes('Unsupported file format'));
    });

    it('rejects empty file payload (0 bytes)', async () => {
      const formData = new FormData();
      formData.append('receipt', new Blob([EMPTY_BUFFER], { type: 'image/png' }), 'empty.png');

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('empty'));
    });

    it('rejects oversized file payload (> 5 MB limit)', async () => {
      const formData = new FormData();
      formData.append('receipt', new Blob([OVERSIZED_BUFFER], { type: 'image/png' }), 'huge.png');

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('5 MB limit') || data.message.includes('exceeds'));
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Successful Upload, Candidate Extraction, and Image Streaming
  // ---------------------------------------------------------------------------
  describe('6. Successful Upload, Candidate Extraction, and Image Streaming', () => {
    it('successfully uploads valid PNG receipt with OCR candidate suggestions', async () => {
      const mockText = `
        BLUE CAFE
        Date: 2026-04-01
        2x Cappuccino - Rs. 400.00
        1x Croissant - Rs. 150.00
        TOTAL: Rs. 550.00
      `;

      const formData = new FormData();
      formData.append('receipt', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'blue-cafe.png');
      formData.append('mockOcrText', mockText);

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const data = await res.json();

      assert.ok(data.receipt);
      assert.ok(data.receipt._id);
      assert.equal(data.receipt.user, userA.id);
      assert.equal(data.receipt.merchant, 'BLUE CAFE');
      assert.equal(data.receipt.amount, 55000); // 550.00 INR = 55000 paise
      assert.equal(data.receipt.status, 'pending');
      assert.equal(data.receipt.mimeType, 'image/png');
      assert.ok(data.receipt.imageUrl.includes(data.receipt._id));

      // Candidate suggestions
      assert.ok(data.candidate);
      assert.equal(data.candidate.merchant, 'BLUE CAFE');
      assert.equal(data.candidate.amountPaise, 55000);
      assert.ok(data.candidate.confidence >= 0.8);
    });

    it('streams authorized receipt image binary with secure response headers', async () => {
      // 1. Upload receipt
      const formData = new FormData();
      formData.append('receipt', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'test-stream.png');
      formData.append('bypassOcr', 'true');

      const uploadRes = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      const uploadData = await uploadRes.json();
      const receiptId = uploadData.receipt._id;

      // 2. Stream image
      const imageRes = await fetch(`${baseUrl}/api/receipts/${receiptId}/image`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(imageRes.status, 200);
      assert.equal(imageRes.headers.get('content-type'), 'image/png');
      assert.equal(imageRes.headers.get('x-content-type-options'), 'nosniff');

      const imageBytes = await imageRes.arrayBuffer();
      assert.equal(imageBytes.byteLength, VALID_PNG_BUFFER.length);
    });

    it('GET /api/receipts lists user receipts with proper ownership scoping', async () => {
      // Upload receipt for user A
      const formData = new FormData();
      formData.append('receipt', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'list-test.png');
      formData.append('bypassOcr', 'true');

      await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      // Fetch user A's receipts
      const res = await fetch(`${baseUrl}/api/receipts`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json();
      assert.ok(Array.isArray(list));
      assert.equal(list.length, 1);
      assert.equal(list[0].user, userA.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Strict Ownership Isolation & Cross-User Denial
  // ---------------------------------------------------------------------------
  describe('7. Strict Ownership Isolation & Cross-User Access Denial', () => {
    let userAReceiptId;

    beforeEach(async () => {
      // User A uploads a receipt
      const formData = new FormData();
      formData.append('receipt', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'alice-receipt.png');
      formData.append('bypassOcr', 'true');

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      const data = await res.json();
      userAReceiptId = data.receipt._id;
    });

    it('User B cannot view User A receipt metadata (404 Not Found)', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/${userAReceiptId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error, 'NotFoundError');
    });

    it('User B cannot stream or download User A receipt image (404 Not Found)', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/${userAReceiptId}/image`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error, 'NotFoundError');
    });

    it('User B cannot confirm User A receipt (404 Not Found)', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/${userAReceiptId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Intruder Expense',
          amount: 20000,
          categoryId: '507f1f77bcf86cd799439099',
        }),
      });

      assert.equal(res.status, 404);
    });

    it('User B cannot delete User A receipt (404 Not Found)', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/${userAReceiptId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.status, 404);
    });

    it('User B receipt list does not expose User A receipts', async () => {
      const res = await fetch(`${baseUrl}/api/receipts`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json();
      assert.equal(list.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Receipt Confirmation & Expense Creation
  // ---------------------------------------------------------------------------
  describe('8. Receipt Confirmation & Duplicate Protection (409 Conflict)', () => {
    let receiptId;

    beforeEach(async () => {
      const formData = new FormData();
      formData.append('receipt', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'confirm-test.png');
      formData.append('mockOcrText', 'GROCERY MART\nTOTAL: Rs. 350.00');

      const res = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      const data = await res.json();
      receiptId = data.receipt._id;
    });

    it('confirms pending receipt and generates linked personal expense', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/${receiptId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Weekly Groceries',
          amount: 35000,
          categoryId: '507f1f77bcf86cd799439099',
          paymentMethod: 'UPI',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();

      assert.equal(data.receipt.status, 'confirmed');
      assert.equal(data.receipt.amount, 35000);
      assert.ok(data.expense);
      assert.equal(data.expense.amount, 35000);
      assert.equal(data.expense.description, 'Weekly Groceries');
    });

    it('rejects confirmation with missing description (400 Bad Request)', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/${receiptId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 35000,
          categoryId: '507f1f77bcf86cd799439099',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
    });

    it('rejects confirmation with decimal rupee amounts (requires integer paise)', async () => {
      const res = await fetch(`${baseUrl}/api/receipts/${receiptId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Groceries',
          amount: 350.50, // Rupee float instead of paise integer
          categoryId: '507f1f77bcf86cd799439099',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('positive integer in paise'));
    });

    it('rejects duplicate confirmation with 409 Conflict', async () => {
      // First confirmation succeeds
      await fetch(`${baseUrl}/api/receipts/${receiptId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Weekly Groceries',
          amount: 35000,
          categoryId: '507f1f77bcf86cd799439099',
        }),
      });

      // Second confirmation must be rejected with 409 Conflict
      const secondRes = await fetch(`${baseUrl}/api/receipts/${receiptId}/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Weekly Groceries',
          amount: 35000,
          categoryId: '507f1f77bcf86cd799439099',
        }),
      });

      assert.equal(secondRes.status, 409);
      const data = await secondRes.json();
      assert.equal(data.error, 'ConflictError');
      assert.ok(data.message.includes('already been confirmed'));
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Deletion & Cleanup
  // ---------------------------------------------------------------------------
  describe('9. Receipt Deletion & Storage Lifecycle', () => {
    it('deletes receipt and cleans up stored image binary from storage', async () => {
      // 1. Upload
      const formData = new FormData();
      formData.append('receipt', new Blob([VALID_PNG_BUFFER], { type: 'image/png' }), 'delete-test.png');
      formData.append('bypassOcr', 'true');

      const uploadRes = await fetch(`${baseUrl}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
        body: formData,
      });

      const uploadData = await uploadRes.json();
      const receiptId = uploadData.receipt._id;

      // 2. Delete
      const deleteRes = await fetch(`${baseUrl}/api/receipts/${receiptId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      assert.equal(deleteRes.status, 200);

      // 3. Verify metadata retrieval returns 404
      const getMetaRes = await fetch(`${baseUrl}/api/receipts/${receiptId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(getMetaRes.status, 404);

      // 4. Verify image binary streaming returns 404
      const getImageRes = await fetch(`${baseUrl}/api/receipts/${receiptId}/image`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(getImageRes.status, 404);
    });
  });
});
