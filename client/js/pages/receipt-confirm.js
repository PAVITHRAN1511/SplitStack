/**
 * Receipt confirmation page module (Review 2, Step P7).
 * Displays receipt image preview, honest OCR status banner,
 * editable candidate fields, client-side validation, Discard handler,
 * and saving the verified expense to the data layer.
 */

import { qs, createEl, on } from '../core/dom.js';
import { createExpense, createReceipt, confirmReceipt, getReceiptImageUrl, getApiMode } from '../data/api.js';
import { showToast } from '../ui/toast.js';
import {
  rupeesToPaise,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';
import { formatFileSize, sanitizeReceiptFilename } from '../domain/receipt.js';

// Map HTML form select values to existing seed category IDs
const CATEGORY_MAP = {
  food: 'cat_food',
  transport: 'cat_travel',
  shopping: 'cat_shopping',
  bills: 'cat_bills',
  entertainment: 'cat_entertainment',
  health: 'cat_health',
  travel: 'cat_travel',
  other: 'cat_other'
};

/**
 * Initialize receipt-confirm page.
 */
export async function init() {
  const form = qs('form.form');
  const descInput = qs('#r-desc', form);
  const amountInput = qs('#r-amount', form);
  const dateInput = qs('#r-date', form);
  const catSelect = qs('#r-cat', form);
  const methodSelect = qs('#r-method', form);
  const submitBtn = qs('button[type="submit"]', form);
  const discardBtn = qs('a.btn-ghost', form);
  const previewImg = qs('img.receipt-preview');
  const figcaption = qs('figcaption.card-footer');
  const badge = qs('.card-header .badge');

  let pendingData = null;
  let pendingDataUrl = null;

  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem('splitstack_pending_receipt');
      if (raw) pendingData = JSON.parse(raw);
      pendingDataUrl = sessionStorage.getItem('splitstack_pending_receipt_dataurl');
    }
  } catch (_) {}

  // Apply pending uploaded file state
  if (pendingData) {
    const cleanName = sanitizeReceiptFilename(pendingData.fileName);
    const sizeStr = pendingData.formattedSize || formatFileSize(pendingData.fileSize);

    if (figcaption) {
      figcaption.textContent = pendingData.serverProcessed
        ? `Uploaded & server-scanned receipt · ${cleanName} (${sizeStr})`
        : `Uploaded image · ${cleanName} (${sizeStr})`;
    }

    if (previewImg) {
      if (pendingData.receiptId && getApiMode() === 'api') {
        previewImg.src = getReceiptImageUrl(pendingData.receiptId);
        previewImg.alt = `Receipt image for ${cleanName}`;
      } else if (pendingDataUrl) {
        previewImg.src = pendingDataUrl;
        previewImg.alt = `Receipt preview for ${cleanName}`;
      }
    }

    // Populate extracted OCR candidate fields as unverified suggestions
    if (pendingData.candidate) {
      const cand = pendingData.candidate;
      if (descInput && !descInput.value && (cand.merchant || cand.description)) {
        descInput.value = cand.merchant || cand.description;
      }
      if (amountInput && !amountInput.value && cand.amount) {
        amountInput.value = (cand.amount / 100).toFixed(2);
      }
      if (dateInput && cand.date) {
        dateInput.value = cand.date;
      }
    }

    // Contextual badge
    if (badge) {
      if (pendingData.serverProcessed) {
        const conf = pendingData.candidate?.confidence;
        const pct = conf ? Math.round(conf * 100) : 85;
        badge.className = 'badge badge-success';
        badge.textContent = `OCR candidate: ${pct}% confidence (Unverified)`;
      } else {
        badge.className = 'badge badge-warning';
        badge.textContent = 'Manual review (OCR pending)';
      }
    }

    // Insert honest notice above form fields
    const formCardBody = form?.parentElement;
    if (formCardBody && !qs('#ocr-notice', formCardBody)) {
      const isServer = pendingData.serverProcessed && getApiMode() === 'api';
      const notice = createEl('div', { id: 'ocr-notice', className: 'alert alert-info mb-4' }, [
        createEl('i', { className: 'fa-solid fa-circle-info', 'aria-hidden': 'true' }),
        createEl('div', {}, [
          createEl('strong', {
            textContent: isServer ? 'OCR suggestion ready for review' : 'Client-side preview mode'
          }),
          createEl('p', {
            className: 'text-xs',
            textContent: isServer
              ? 'Server OCR has suggested merchant, amount, and date. Review and edit any field below before confirming.'
              : 'Automated OCR extraction is scheduled for Review 3. Review your receipt image on the right and adjust the expense details below before saving.'
          })
        ])
      ]);
      form.parentElement.insertBefore(notice, form);
    }

    // Default to today if date input is empty
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  } else {
    // Visiting directly without an upload — show sample preview indicator
    if (badge) {
      badge.className = 'badge badge-info';
      badge.textContent = 'Sample receipt preview';
    }
  }

  // Handle Discard action
  if (discardBtn) {
    on(discardBtn, 'click', (e) => {
      e.preventDefault();
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('splitstack_pending_receipt');
          sessionStorage.removeItem('splitstack_pending_receipt_dataurl');
        }
      } catch (_) {}
      showToast('Receipt discarded', 'info');
      window.location.href = 'receipt-scan.html';
    });
  }

  // Handle Form Submission ("Confirm & save")
  if (form) {
    on(form, 'submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);

      const description = descInput?.value.trim() || '';
      const amountVal = amountInput?.value.trim() || '';
      const dateVal = dateInput?.value.trim() || '';
      const catKey = catSelect?.value || 'food';
      const categoryId = CATEGORY_MAP[catKey] || 'cat_food';
      const paymentMethod = methodSelect?.value || 'UPI';

      let hasError = false;

      if (!description) {
        showFieldError(descInput, 'Merchant or description is required');
        hasError = true;
      }

      let amountPaise = 0;
      if (!amountVal) {
        showFieldError(amountInput, 'Amount is required');
        hasError = true;
      } else {
        try {
          amountPaise = rupeesToPaise(amountVal);
          if (amountPaise <= 0) {
            showFieldError(amountInput, 'Amount must be greater than zero');
            hasError = true;
          }
        } catch (err) {
          showFieldError(amountInput, err.message);
          hasError = true;
        }
      }

      if (!dateVal) {
        showFieldError(dateInput, 'Receipt date is required');
        hasError = true;
      }

      if (hasError) {
        focusFirstInvalid(form);
        return;
      }

      setButtonLoading(submitBtn, true, 'Saving expense...');

      try {
        let createdExpense;
        if (pendingData?.receiptId && getApiMode() === 'api') {
          // Confirm receipt on server via POST /api/receipts/:id/confirm
          const res = await confirmReceipt(pendingData.receiptId, {
            description,
            amount: amountPaise,
            date: dateVal,
            categoryId,
            paymentMethod
          });
          createdExpense = res.expense;
        } else {
          // Local store mode
          createdExpense = await createExpense({
            categoryId,
            amount: amountPaise,
            date: dateVal,
            description,
            paymentMethod,
            notes: pendingData
              ? `Created from receipt: ${sanitizeReceiptFilename(pendingData.fileName)}`
              : 'Created from sample receipt'
          });

          await createReceipt({
            merchant: description,
            amount: amountPaise,
            date: dateVal,
            status: 'confirmed',
            rawText: pendingData ? `Receipt: ${pendingData.fileName}` : 'Sample receipt',
            confidence: pendingData ? null : 0.94,
            imageUrl: pendingDataUrl || '../assets/sample-receipt.webp'
          });
        }

        // Clean up session storage
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('splitstack_pending_receipt');
            sessionStorage.removeItem('splitstack_pending_receipt_dataurl');
          }
        } catch (_) {}

        showToast(`Expense "${createdExpense.description}" confirmed and saved!`, 'success');

        setTimeout(() => {
          window.location.href = 'expenses.html';
        }, 500);
      } catch (err) {
        setButtonLoading(submitBtn, false);
        if (err.status === 409) {
          showToast('This receipt has already been confirmed.', 'warning');
        } else {
          showToast(err.message || 'Failed to save expense from receipt', 'danger');
        }
        if (err.field === 'description' && descInput) {
          showFieldError(descInput, err.message);
        } else if (err.field === 'amount' && amountInput) {
          showFieldError(amountInput, err.message);
        }
        focusFirstInvalid(form);
      }
    });
  }
}
