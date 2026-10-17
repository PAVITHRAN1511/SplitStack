/**
 * SplitStack Receipt Upload Middleware & Magic Byte Content Inspection (Review 3, Step P12).
 * Uses Multer with memory storage, enforces strict file size ceiling (5 MB),
 * and validates image binary header magic bytes to prevent MIME-type spoofing.
 */

import multer from 'multer';
import { config } from '../config.js';
import { BadRequestError } from '../utils/errors.js';

/**
 * Supported MIME types and extensions.
 */
export const SUPPORTED_FORMATS = Object.freeze({
  PNG: { mime: 'image/png', ext: '.png' },
  JPEG: { mime: 'image/jpeg', ext: '.jpg' },
  WEBP: { mime: 'image/webp', ext: '.webp' },
});

/**
 * Validate binary file buffer against official magic byte signatures.
 * Does not trust client-supplied Content-Type or file extension.
 * @param {Buffer} buffer - Raw file bytes
 * @returns {{ valid: boolean, mimeType?: string, ext?: string, error?: string }}
 */
export function validateImageSignature(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return {
      valid: false,
      error: 'Empty or corrupted image payload. File must contain valid image data.',
    };
  }

  // 1. PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, mimeType: SUPPORTED_FORMATS.PNG.mime, ext: SUPPORTED_FORMATS.PNG.ext };
  }

  // 2. JPEG Signature: FF D8 FF
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { valid: true, mimeType: SUPPORTED_FORMATS.JPEG.mime, ext: SUPPORTED_FORMATS.JPEG.ext };
  }

  // 3. WEBP Signature: Starts with 'RIFF' at offset 0, followed by 'WEBP' at offset 8
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { valid: true, mimeType: SUPPORTED_FORMATS.WEBP.mime, ext: SUPPORTED_FORMATS.WEBP.ext };
  }

  return {
    valid: false,
    error: 'Unsupported file format or corrupted image payload. Only valid PNG, JPEG, and WEBP files are accepted.',
  };
}

// Multer memory storage configuration with strict byte limit
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: config.maxReceiptSizeBytes, // 5 MB
    files: 1, // Exactly one receipt at a time
  },
  fileFilter(req, file, cb) {
    // Basic filter on client-supplied mimetype as initial pre-filter
    const validClientMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (validClientMimes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Unsupported file format. Please upload a PNG, JPEG, or WEBP image.'));
    }
  },
});

/**
 * Express middleware for receipt image upload with comprehensive error handling and signature verification.
 */
export function handleReceiptUpload(req, res, next) {
  // Support 'receipt', 'file', or 'image' field name
  const uploadMiddleware = upload.fields([
    { name: 'receipt', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]);

  uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new BadRequestError(
              `File size exceeds the ${(config.maxReceiptSizeBytes / (1024 * 1024)).toFixed(0)} MB limit. Please select a smaller image.`
            )
          );
        }
        return next(new BadRequestError(`Upload error: ${err.message}`));
      }
      return next(err);
    }

    // Extract file from any of the supported field names
    const file =
      (req.files && (req.files.receipt?.[0] || req.files.file?.[0] || req.files.image?.[0])) ||
      req.file;

    if (!file) {
      return next(new BadRequestError('No receipt file uploaded. Please select an image.'));
    }

    if (file.size === 0 || !file.buffer || file.buffer.length === 0) {
      return next(new BadRequestError('Selected file is empty.'));
    }

    // Inspect binary header bytes (anti-MIME-spoofing)
    const inspection = validateImageSignature(file.buffer);
    if (!inspection.valid) {
      return next(new BadRequestError(inspection.error));
    }

    // Attach verified metadata and normalize req.file
    file.verifiedMimeType = inspection.mimeType;
    file.verifiedExt = inspection.ext;
    req.file = file;

    next();
  });
}

export default handleReceiptUpload;
