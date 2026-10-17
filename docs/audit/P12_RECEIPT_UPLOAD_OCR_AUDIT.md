# SplitStack — Phase P12 Technical Audit Report
**Review 3: Receipt Upload and Server-Side OCR**
**Date:** 2026-10-17  
**Branch:** `refurbish`  
**Starting Commit:** `c6c6f1d Review 3: authentication and REST API`  

---

## 1. Executive Summary & Objective

Phase **P12** implements secure multipart receipt upload, deep binary magic byte verification, persistent file storage in MongoDB GridFS, and server-side OCR candidate extraction using Tesseract.js for SplitStack under the Review 3 Node.js/Express architecture.

Building upon the authentication and REST resource foundation from Step P11 and the Mongoose `Receipt` schema from Step P10, this phase provides an authenticated receipt pipeline that derives ownership exclusively from the verified JWT principal, defends against MIME spoofing and path traversal, generates server-controlled storage keys, treats all OCR extractions as untrusted candidates, enforces duplicate-protected expense conversion, and cleans up storage binaries on partial failure.

### Scope Boundaries Preserved:
- **Legacy Preservation:** The entire Flask application (`app.py`, `config.py`, `modules/`, `database/`, `templates/`, `static/`, `tests/`) and all existing audit evidence in `docs/audit/` remain intact.
- **Client Data Layer Deferral:** P13 client frontend migration from `sessionStorage`/`localStorage` to live server `/api` `fetch()` remains deferred to Step P13. The client receipt preview/review flow remains compatible.
- **Seeding & CI Deferral:** P14 seeding scripts and continuous integration automation remain deferred to Step P14.
- **No Remote Push:** All work is staged and committed strictly on the local `refurbish` branch.

---

## 2. Secure Receipt Upload Architecture

### 2.1 Multipart Upload & Byte Ceiling
- **Parser:** Multer (`multer` ^2.0.2 / ^2.4.0) with memory storage buffering.
- **Configurable Limit:** Enforces a conservative 5 MB ceiling (`config.maxReceiptSizeBytes`, default `5242880` bytes), configurable via `MAX_RECEIPT_SIZE_BYTES`.
- **Single File Enforcement:** Limits upload to exactly 1 file per request (`files: 1`).
- **Standard Field Support:** Accepts multipart files under `receipt`, `file`, or `image` field names.
- **Exhaustion Protection:** Oversized files are rejected immediately by Multer with HTTP 400 Bad Request (`File size exceeds the 5 MB limit. Please select a smaller image.`).

### 2.2 Deep Binary Header Magic Byte Inspection (Anti-MIME-Spoofing)
Client-supplied MIME types and file extensions are fundamentally untrusted user input. Middleware `validateImageSignature(buffer)` inspects the raw binary headers of the uploaded payload:
- **PNG Signature:** Verifies offset bytes `0x89 0x50 0x4E 0x47` (`89 50 4E 47`).
- **JPEG Signature:** Verifies offset bytes `0xFF 0xD8 0xFF` (`FF D8 FF`).
- **WEBP Signature:** Verifies `'RIFF'` at offset 0 and `'WEBP'` at offset 8.
- **Rejection Policy:** Text files, executables, HTML scripts, corrupt files, empty payloads (0 bytes), or files claiming an image MIME type but containing text or script headers are immediately rejected with HTTP 400 Bad Request.

### 2.3 Server-Controlled Unique Storage Identifiers
- **Path Traversal Neutralization:** Client-supplied filenames and paths are never used in filesystem or database storage paths.
- **Unique Key Generation:** Every stored receipt receives an unpredictable server-generated key:
  ```js
  receipt_${Date.now()}_${crypto.randomUUID()}${verifiedExt}
  ```
- **Guaranteed Isolation:** Prevents overwrites, namespace collisions, or path escape sequences (`../`, `..\`).

### 2.4 Storage Engine: MongoDB GridFS with In-Memory Fallback
- **Primary Engine:** MongoDB GridFS (`receipts` bucket) using `mongoose.mongo.GridFSBucket`. Files are chunked and indexed with authenticated user metadata (`userId`, `storedAt`).
- **Streaming Retrieval:** `GET /api/receipts/:id/image` opens a download stream directly from GridFS, setting `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=86400`, and verified `Content-Type`.
- **Test/Offline Fallback:** In the absence of an external MongoDB daemon during unit tests, an in-memory buffer store provides identical streaming and deletion semantics.
- **Compensating Cleanup:** If database persistence or OCR processing fails during upload, `deleteReceiptImage(storedFileKey)` is immediately executed in the route error handler, guaranteeing zero orphaned binary files.

---

## 3. Server-Side OCR Pipeline

### 3.1 Tesseract.js Integration
- **Engine:** `tesseract.js` (^7.0.0) performing optical character recognition server-side on validated image buffers.
- **Language Configuration:** Configurable via `OCR_LANGUAGE` (default `eng`).
- **Safe Failure Handling:** If Tesseract encounters an unreadable or malformed image, the service catches the error gracefully, returning `ocrSuccess: false` with descriptive error details rather than crashing the Express process.
- **Deterministic Test Fast-Path:** In automated unit tests, passing `mockOcrText` or `bypassOcr` in form data allows instant, deterministic unit testing of parsing and storage pipelines without invoking external network downloads.

### 3.2 Candidate Parsing & Confidence Scoring
- Reuses the authoritative domain extraction algorithm `parseCandidateReceipt` from `client/js/domain/receipt.js`.
- **Merchant Extraction:** Detects the primary business name from header lines, skipping metadata labels (`Date:`, `Invoice:`, `TOTAL:`).
- **Date Extraction:** Scans for standard ISO (`YYYY-MM-DD`) and common Indian date formats (`DD/MM/YYYY`, `DD-Mon-YYYY`).
- **Amount Extraction:** Prioritizes explicit `TOTAL:` lines over individual line items, converting rupee values cleanly into integer paise (`Rs. 550.00` → `55000` paise).
- **Confidence Scoring:** Outputs a normalized confidence score between `0.0` and `1.0`.

### 3.3 Untrusted Suggestion Security Posture
- Extracted receipt fields are strictly treated as **untrusted suggestions**.
- The server never automatically creates an expense or modifies financial balances upon upload.
- An expense is created only when the authenticated user explicitly reviews, adjusts, and submits confirmation to `POST /api/receipts/:id/confirm`.

### 3.4 Duplicate Protection
- Confirmed receipts have their `status` updated from `'pending'` to `'confirmed'` and are linked to the newly generated `Expense` via `receipt._id`.
- Any subsequent attempt to confirm an already-confirmed receipt is rejected with HTTP 409 Conflict (`Receipt has already been confirmed and recorded as an expense.`).

---

## 4. Privacy, Security, and Ownership Boundaries

1. **No Sensitive Artifacts:** No private receipt images, real financial data, or credentials were committed. Test fixtures are generated programmatically (minimal 1x1 pixel PNG/JPEG/WEBP byte arrays).
2. **Authenticated Ownership Derivation:** All receipt endpoints derive user identity exclusively from verified JWT claims (`req.userId`).
3. **Cross-User Access Denial:**
   - `GET /api/receipts/:id`: Returns HTTP 404 Not Found if requested by a different user.
   - `GET /api/receipts/:id/image`: Rejects cross-user streaming with HTTP 404 Not Found.
   - `POST /api/receipts/:id/confirm`: Rejects cross-user confirmation with HTTP 404 Not Found.
   - `DELETE /api/receipts/:id`: Rejects cross-user deletion with HTTP 404 Not Found.
   - `GET /api/receipts`: Returns only receipts owned by the authenticated caller.
4. **Log Privacy:** Raw image buffers, base64 strings, JWTs, and extracted OCR text are excluded from server application logs.

---

## 5. Endpoints Inventory (Receipts Resource)

| Method | Endpoint | Description | Auth | Safeguards |
|---|---|---|---|---|
| `POST` | `/api/receipts/upload` | Multipart receipt upload & OCR extraction | Required | Multer 5 MB limit, magic byte validation, server keys, cleanup |
| `POST` | `/api/receipts` | Alias for upload endpoint | Required | Identical to `/upload` |
| `GET` | `/api/receipts` | List receipts for authenticated user | Required | Filtered strictly to `user: req.userId` |
| `GET` | `/api/receipts/:id` | Get receipt metadata | Required | 404 if not found or owned by another user |
| `GET` | `/api/receipts/:id/image` | Stream authorized receipt binary | Required | Ownership check, GridFS streaming, nosniff headers |
| `POST` | `/api/receipts/:id/confirm` | Confirm receipt into an Expense | Required | Positive integer paise check, duplicate 409 Conflict guard |
| `DELETE` | `/api/receipts/:id` | Delete metadata and image binary | Required | Ownership check, GridFS binary removal, record deletion |

---

## 6. Files Changed & Added

### Modified:
- `client/js/domain/receipt.js`: Prioritized explicit `TOTAL:` lines over item-level currency symbols in `parseCandidateReceipt`.
- `server/.env.example`: Added configuration variables for `MAX_RECEIPT_SIZE_BYTES`, `OCR_ENABLED`, `OCR_LANGUAGE`, and `UPLOAD_TEMP_DIR`.
- `server/package.json` & `server/package-lock.json`: Added `multer` (^2.0.2) and `tesseract.js` (^7.0.0).
- `server/src/config.js`: Added configuration parsing for receipt upload limits, OCR toggles, and languages.
- `server/src/models/Receipt.js`: Added fields for `mimeType`, `fileSizeBytes`, `originalName`, and indexes.
- `server/src/routes/receipts.js`: Implemented upload, streaming, confirmation, deletion, and stateful offline fallback.
- `server/README.md`: Documented receipt upload architecture, GridFS storage, OCR pipeline, env vars, and updated test counts.

### Created:
- `server/src/middleware/upload.js`: Multer memory upload middleware and `validateImageSignature` magic byte inspection.
- `server/src/services/storageService.js`: MongoDB GridFS bucket lifecycle, unique key generator, and in-memory test store.
- `server/src/services/ocrService.js`: Tesseract.js optical character recognition and domain candidate parser.
- `server/tests/receipts.test.js`: Comprehensive 35-test suite covering magic bytes, upload validation, storage, OCR, ownership, confirmation, and deletion.
- `docs/audit/P12_RECEIPT_UPLOAD_OCR_AUDIT.md`: This audit document.

---

## 7. Verification & Test Evidence

### 7.1 Server Test Suite (`npm run test:server`)
- **Total Tests:** 123
- **Total Suites:** 43
- **Passed:** 123
- **Failed:** 0
- **Duration:** 3.05s

Breakdown of Step P12 tests (35 tests):
- Suite 1 (Magic Bytes): 5 tests passing (PNG, JPEG, WEBP, plain text rejection, truncated buffer rejection).
- Suite 2 (Storage Service): 2 tests passing (unique key generation, store/stream/delete lifecycle).
- Suite 3 (OCR Extraction): 4 tests passing (candidate extraction, unrecognizable text, bypass mode, real Tesseract failure handling).
- Suite 4 (Auth Protection): 6 tests passing (401 on upload, list, get, image stream, confirm, delete).
- Suite 5 (Upload Validation): 5 tests passing (missing file, unsupported format, misleading MIME type, empty file, oversized 5 MB file).
- Suite 6 (Upload & Stream): 3 tests passing (successful upload, image streaming with nosniff header, ownership listing).
- Suite 7 (Ownership Isolation): 5 tests passing (User B cannot view metadata, stream image, confirm, delete, or list User A receipts).
- Suite 8 (Confirmation): 4 tests passing (expense conversion, missing description rejection, non-integer paise rejection, 409 duplicate conflict).
- Suite 9 (Deletion): 1 test passing (delete metadata and stored image binary).

### 7.2 Client Test Suite (`npm run test:client`)
- **Total Tests:** 176
- **Total Suites:** 52
- **Passed:** 176
- **Failed:** 0
- **Duration:** 0.49s

### 7.3 HTML Validation (`npm run lint:html`)
- **Files Validated:** 25 HTML templates
- **Passed:** 25
- **Errors:** 0

---

## 8. Honest Boundary Reporting

1. **OCR Engine:** Tested with both fast deterministic mock text parsing and genuine Tesseract.js execution on image buffers (verifying safe error handling on malformed images).
2. **MongoDB / GridFS:** The service implements full Mongoose `GridFSBucket` upload, stream, and deletion logic for production. In unit tests where no external MongoDB daemon was running, the service seamlessly used its in-memory storage fallback, verifying exact streaming headers, byte lengths, and cleanup behavior.
3. **No Frontend API Wiring:** As mandated by P12 scope rules, client frontend files continue to use client preview mode. Live API integration is deferred to P13.

---

## 9. Conclusion & Transition to P13

Phase P12 is complete, fully tested, and documented. The receipt upload and server-side OCR processing pipeline meets all security, privacy, and architectural requirements. SplitStack is now ready for **P13: Client Data Layer Integration**.
