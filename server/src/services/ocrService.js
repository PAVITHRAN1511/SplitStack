/**
 * SplitStack Server-Side OCR Processing Service (Review 3, Step P12).
 * Integrates Tesseract.js for optical character recognition,
 * extracts candidate merchant/date/amount fields using domain parsing logic,
 * and handles failures gracefully without crashing or creating orphaned data.
 */

import Tesseract from 'tesseract.js';
import { parseCandidateReceipt } from '../../../client/js/domain/receipt.js';
import { config } from '../config.js';

/**
 * Process a receipt image buffer through Tesseract OCR and parse financial candidate fields.
 * Extracted fields are strictly treated as untrusted suggestions, requiring explicit user confirmation.
 *
 * @param {Buffer} imageBuffer - Raw image file bytes
 * @param {Object} [options={}] - Optional processing overrides
 * @param {boolean} [options.bypassOcr=false] - Skip engine call (e.g. in test doubles)
 * @param {string} [options.mockText] - Custom mock text to simulate OCR output
 * @returns {Promise<{
 *   rawText: string,
 *   confidence: number,
 *   merchant: string,
 *   date: string,
 *   amountPaise: number,
 *   ocrSuccess: boolean,
 *   error?: string
 * }>}
 */
export async function processReceiptOcr(imageBuffer, options = {}) {
  // 1. Check if mock/bypass is requested or OCR is explicitly disabled
  if (options.bypassOcr || options.mockText !== undefined) {
    const rawText = options.mockText || '';
    const parsed = parseCandidateReceipt(rawText);
    return {
      rawText,
      confidence: parsed ? parsed.confidence : 0,
      merchant: parsed?.merchant || 'Unknown Merchant',
      date: parsed?.date || new Date().toISOString().slice(0, 10),
      amountPaise: parsed?.amountPaise || 0,
      ocrSuccess: true,
    };
  }

  if (!config.ocrEnabled) {
    return {
      rawText: '',
      confidence: 0,
      merchant: 'Receipt Scan',
      date: new Date().toISOString().slice(0, 10),
      amountPaise: 0,
      ocrSuccess: false,
      error: 'OCR processing is disabled in server configuration.',
    };
  }

  // 2. Perform OCR with Tesseract.js
  try {
    const result = await Tesseract.recognize(
      imageBuffer,
      config.ocrLanguage || 'eng',
      {
        errorHandler: () => {},
      }
    );

    const rawText = result.data?.text || '';
    const rawConfidence = typeof result.data?.confidence === 'number' ? result.data.confidence : 0;
    // Normalize confidence from 0-100 to 0.0-1.0
    const normalizedConfidence = Math.max(0, Math.min(1, Number((rawConfidence / 100).toFixed(2))));

    // 3. Extract candidate financial fields
    const parsed = parseCandidateReceipt(rawText);

    return {
      rawText: rawText.trim(),
      confidence: parsed?.confidence || normalizedConfidence,
      merchant: parsed?.merchant || 'Unknown Merchant',
      date: parsed?.date || new Date().toISOString().slice(0, 10),
      amountPaise: parsed?.amountPaise || 0,
      ocrSuccess: true,
    };
  } catch (err) {
    // Graceful error handling: OCR failure produces safe error without crashing
    return {
      rawText: '',
      confidence: 0,
      merchant: 'Unrecognized Receipt',
      date: new Date().toISOString().slice(0, 10),
      amountPaise: 0,
      ocrSuccess: false,
      error: `OCR processing failed: ${err.message}`,
    };
  }
}

export default processReceiptOcr;
