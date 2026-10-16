/**
 * Expense creation page module (Review 2, Step P4).
 * Handles adding a new personal expense with integer paise conversion,
 * date validation, accessible error feedback, and Post/Redirect/Get flow.
 */

import { createExpense } from '../data/api.js';
import { qs, on } from '../core/dom.js';
import { showToast } from '../ui/toast.js';
import {
  rupeesToPaise,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

/**
 * Initialize expense creation form.
 */
export async function init() {
  const form = qs('form.form');
  const submitBtn = qs('button[type="submit"]', form);
  const amountInput = qs('#amount', form);
  const dateInput = qs('#expense-date', form);
  const descInput = qs('#description', form);
  const catSelect = qs('#category', form);
  const notesTextarea = qs('#notes', form);

  if (!form) return;

  // Set default date to today if empty
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  on(form, 'submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    let hasError = false;
    let amountPaise = 0;

    // Validate amount
    try {
      amountPaise = rupeesToPaise(amountInput?.value);
    } catch (err) {
      showFieldError(amountInput, err.message);
      hasError = true;
    }

    // Validate date
    const dateVal = dateInput?.value || '';
    if (!dateVal) {
      showFieldError(dateInput, 'Date is required');
      hasError = true;
    }

    // Validate description
    const descVal = descInput?.value.trim() || '';
    if (!descVal) {
      showFieldError(descInput, 'Description is required');
      hasError = true;
    }

    // Validate category
    const catVal = catSelect?.value || '';
    if (!catVal) {
      showFieldError(catSelect, 'Please select a category');
      hasError = true;
    }

    if (hasError) {
      focusFirstInvalid(form);
      return;
    }

    // Selected payment method
    const methodInput = form.querySelector('input[name="payment_method"]:checked');
    const paymentMethod = methodInput ? methodInput.value : 'UPI';
    const notes = notesTextarea ? notesTextarea.value.trim() : '';

    setButtonLoading(submitBtn, true, 'Saving expense...');

    try {
      await createExpense({
        amount: amountPaise,
        date: dateVal,
        description: descVal,
        categoryId: catVal,
        paymentMethod,
        notes
      });

      showToast('Expense added successfully!', 'success');

      setTimeout(() => {
        window.location.href = 'expenses.html';
      }, 500);
    } catch (err) {
      setButtonLoading(submitBtn, false);

      if (err.field === 'amount') {
        showFieldError(amountInput, err.message);
      } else if (err.field === 'date') {
        showFieldError(dateInput, err.message);
      } else if (err.field === 'category' || err.field === 'categoryId') {
        showFieldError(catSelect, err.message);
      } else {
        showFieldError(descInput, err.message || 'Failed to save expense');
      }
      focusFirstInvalid(form);
    }
  });
}
