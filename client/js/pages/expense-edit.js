/**
 * Expense edit page module (Review 2, Step P3).
 * Connects expense-edit.html to api.js to pre-fill the form fields from the stored expense
 * and handles missing/invalid IDs gracefully.
 */

import { getExpense } from '../data/api.js';
import { qs, qsa } from '../core/dom.js';
import { setLoading, clearElement, renderErrorState } from '../core/render.js';

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
