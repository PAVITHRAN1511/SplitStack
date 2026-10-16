/**
 * Income creation page module (Review 2, Step P4).
 * Handles adding a new income record with integer paise conversion,
 * accessible field-level error messages, and Post/Redirect/Get flow.
 */

import { createIncome, listCategories } from '../data/api.js';
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
 * Initialize income creation form.
 */
export async function init() {
  const form = qs('form.form');
  const submitBtn = qs('button[type="submit"]', form);
  const amountInput = qs('#amount', form);
  const dateInput = qs('#income-date', form);
  const sourceInput = qs('#source', form);
  const catSelect = qs('#category', form);

  if (!form) return;

  // Set default date to today if empty
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  // Populate categories dynamically from API if available
  try {
    const cats = await listCategories({ type: 'income' });
    if (cats && cats.length > 0 && catSelect) {
      catSelect.innerHTML = '<option value="">Choose a category</option>' +
        cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  } catch (err) {
    console.warn('[SplitStack] Could not load income categories:', err);
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

    // Validate source
    const sourceVal = sourceInput?.value.trim() || '';
    if (!sourceVal) {
      showFieldError(sourceInput, 'Income source is required');
      hasError = true;
    }

    // Validate category
    let catVal = catSelect?.value || '';
    if (!catVal) {
      showFieldError(catSelect, 'Please select an income category');
      hasError = true;
    } else {
      // Map shorthand values like 'salary' to 'cat_salary' if needed
      if (!catVal.startsWith('cat_')) {
        catVal = `cat_${catVal}`;
      }
    }

    if (hasError) {
      focusFirstInvalid(form);
      return;
    }

    setButtonLoading(submitBtn, true, 'Saving income...');

    try {
      await createIncome({
        amount: amountPaise,
        date: dateVal,
        source: sourceVal,
        categoryId: catVal,
        paymentMethod: 'Net banking'
      });

      showToast('Income added successfully!', 'success');

      setTimeout(() => {
        window.location.href = 'income.html';
      }, 500);
    } catch (err) {
      setButtonLoading(submitBtn, false);

      if (err.field === 'amount') {
        showFieldError(amountInput, err.message);
      } else if (err.field === 'date') {
        showFieldError(dateInput, err.message);
      } else if (err.field === 'source') {
        showFieldError(sourceInput, err.message);
      } else if (err.field === 'category' || err.field === 'categoryId') {
        showFieldError(catSelect, err.message);
      } else {
        showFieldError(sourceInput, err.message || 'Failed to save income');
      }
      focusFirstInvalid(form);
    }
  });
}
