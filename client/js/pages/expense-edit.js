/**
 * Expense edit page module (Review 2, Steps P3 & P4).
 * Connects expense-edit.html to api.js to pre-fill the form fields from the stored expense,
 * handles form submission and validation with integer paise conversion,
 * and handles missing/invalid IDs gracefully.
 */

import { getExpense, updateExpense } from '../data/api.js';
import { qs, qsa, on } from '../core/dom.js';
import { setLoading, clearElement, renderErrorState } from '../core/render.js';
import { showToast } from '../ui/toast.js';
import {
  rupeesToPaise,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

/**
 * Pre-fill the edit form with expense data.
 * @param {Object} expense
 */
function fillExpenseForm(expense) {
  // Amount input (convert integer paise to rupees)
  const amountInput = qs('#amount');
  if (amountInput) {
    const rupees = expense.amount / 100;
    amountInput.value = rupees % 1 === 0 ? String(rupees) : rupees.toFixed(2);
  }

  // Date input
  const dateInput = qs('#expense-date');
  if (dateInput && expense.date) {
    dateInput.value = expense.date;
  }

  // Description input
  const descInput = qs('#description');
  if (descInput) {
    descInput.value = expense.description || '';
  }

  // Category select
  const catSelect = qs('#category');
  if (catSelect && expense.categoryId) {
    catSelect.value = expense.categoryId;
  }

  // Payment method radio
  if (expense.paymentMethod) {
    const radios = qsa('input[name="payment_method"]');
    for (const r of radios) {
      if (r.value.toLowerCase() === expense.paymentMethod.toLowerCase()) {
        r.checked = true;
      }
    }
  }

  // Notes textarea
  const notesTextarea = qs('#notes');
  if (notesTextarea) {
    notesTextarea.value = expense.notes || '';
  }

  // Breadcrumbs current item
  const breadcrumbCurrent = qs('.breadcrumbs li[aria-current="page"]');
  if (breadcrumbCurrent && expense.description) {
    breadcrumbCurrent.textContent = `Edit: ${expense.description}`;
  }
}

/**
 * Initialize expense-edit page module.
 */
export async function init() {
  const main = qs('main#main');
  const url = new URL(window.location.href);
  const expenseId = url.searchParams.get('id') || 'exp_1';

  setLoading(main, true);

  try {
    const expense = await getExpense(expenseId);
    fillExpenseForm(expense);

    const form = qs('form.form');
    const submitBtn = qs('button[type="submit"]', form);
    const amountInput = qs('#amount', form);
    const dateInput = qs('#expense-date', form);
    const descInput = qs('#description', form);
    const catSelect = qs('#category', form);
    const notesTextarea = qs('#notes', form);

    if (form) {
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

        const methodInput = form.querySelector('input[name="payment_method"]:checked');
        const paymentMethod = methodInput ? methodInput.value : 'UPI';
        const notes = notesTextarea ? notesTextarea.value.trim() : '';

        setButtonLoading(submitBtn, true, 'Updating expense...');

        try {
          await updateExpense(expenseId, {
            amount: amountPaise,
            date: dateVal,
            description: descVal,
            categoryId: catVal,
            paymentMethod,
            notes
          });

          showToast('Expense updated successfully!', 'success');

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
            showFieldError(descInput, err.message || 'Failed to update expense');
          }
          focusFirstInvalid(form);
        }
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading expense for editing:', err);
    clearElement(main);
    renderErrorState(main, `Expense "${expenseId}" was not found or could not be loaded.`, () => {
      window.location.href = 'expenses.html';
    });
  } finally {
    setLoading(main, false);
  }
}
