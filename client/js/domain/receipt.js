/**
 * Receipt scanning and validation domain module (Review 2, Step P7).
 * Pure domain functions for client-side receipt file validation,
 * file size formatting, filename sanitization, candidate receipt parsing,
 * and honest OCR status classification.
 */

export const ALLOWED_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp'
]);

export const ALLOWED_EXTENSIONS = Object.freeze([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp'
]);

export const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Sanitize a filename to prevent HTML/XSS injection or path traversal.
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeReceiptFilename(filename) {
  if (!filename || typeof filename !== 'string') return 'receipt-image';
  return filename
    .replace(/[/\\]/g, '_')
    .replace(/[<>"'&]/g, '')
    .trim() || 'receipt-image';
}

/**
 * Format bytes into human-readable size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a receipt file object for size and MIME/extension type.
 * @param {File|Object} file
 * @returns {{ valid: boolean, error?: string, details?: Object }}
 */
export function validateReceiptFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected. Please choose a receipt image.' };
  }

  const name = typeof file.name === 'string' ? file.name : '';
  const size = Number(file.size);
  const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';

  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, error: 'Selected file is empty.' };
  }

  if (size > MAX_RECEIPT_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${formatFileSize(size)}) exceeds the 5 MB limit. Please select a smaller image.`
    };
  }

  const extMatch = name.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0].toLowerCase() : '';

  const isMimeAllowed = ALLOWED_MIME_TYPES.includes(type);
  const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);

  if (!isMimeAllowed && !isExtAllowed) {
    return {
      valid: false,
      error: 'Unsupported file format. Please upload a PNG, JPG, or WEBP image.'
    };
  }

  return {
    valid: true,
    details: {
      name: sanitizeReceiptFilename(name),
      size,
      formattedSize: formatFileSize(size),
      type: type || (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg')
    }
  };
}

/**
 * Honest check of whether automated OCR is available in client runtime.
 * P7 is client-side preview mode; server-side/Tesseract OCR is deferred to Review 3.
 * @returns {boolean}
 */
export function isOcrAvailable() {
  return false;
}

/**
 * Get honest extraction status for a receipt.
 * @param {Object} [receiptData]
 * @returns {{ available: boolean, status: string, confidence: number|null, message: string }}
 */
export function getExtractionStatus(receiptData = null) {
  if (receiptData && receiptData.rawText) {
    return {
      available: true,
      status: 'candidate',
      confidence: typeof receiptData.confidence === 'number' ? receiptData.confidence : 0.85,
      message: 'Candidate fields extracted from provided receipt data.'
    };
  }

  return {
    available: false,
    status: 'unavailable',
    confidence: null,
    message: 'Automated OCR extraction is not available in client-side preview mode (planned for Review 3). Please verify details manually.'
  };
}

/**
 * Parse candidate fields from raw receipt text (when candidate text is provided).
 * @param {string} rawText
 * @returns {Object|null}
 */
export function parseCandidateReceipt(rawText) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  // Merchant: first line that doesn't start with Date, Total, Receipt, or dashes
  let merchant = 'Unknown Merchant';
  for (const line of lines) {
    if (!/^(date|total|subtotal|receipt|no|invoice|item|qty|amount|-|=)/i.test(line)) {
      merchant = line.replace(/^[#*-]\s*/, '').slice(0, 80);
      break;
    }
  }

  // Date: look for YYYY-MM-DD or DD/MM/YYYY or DD-MMM-YYYY
  let date = new Date().toISOString().slice(0, 10);
  const dateMatch = rawText.match(/\b(\d{4}[-/.]\d{2}[-/.]\d{2})\b/) ||
    rawText.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/) ||
    rawText.match(/\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/);

  if (dateMatch) {
    const rawDate = dateMatch[1];
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed.toISOString().slice(0, 10);
    }
  }

  // Total amount: prioritize explicit TOTAL line before generic currency prefix
  let amountPaise = 0;
  const explicitTotalMatch = rawText.match(/(?:TOTAL|Total|Grand Total)\s*:?\s*(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const totalLineMatch = explicitTotalMatch || rawText.match(/(?:Rs\.?|INR)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (totalLineMatch) {
    const cleanNum = totalLineMatch[1].replace(/,/g, '');
    const num = parseFloat(cleanNum);
    if (!Number.isNaN(num) && num > 0) {
      amountPaise = Math.round(num * 100);
    }
  }

  return {
    merchant,
    date,
    amountPaise,
    confidence: amountPaise > 0 ? 0.9 : 0.6,
    rawText
  };
}
