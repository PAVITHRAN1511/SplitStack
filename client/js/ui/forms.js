/**
 * SplitStack Form Validation and Submission Helpers (Review 2, Step P4).
 * Provides accessible field-level error handling, integer-paise conversions,
 * duplicate-submission guards, password visibility toggles, and route auth guards.
 */

import { currentUser } from '../data/api.js';
import { createEl, qs, qsa, on } from '../core/dom.js';

/**
 * Public page names that do not require an active user session.
 */
const PUBLIC_PAGES = new Set(['landing', 'login', 'register', '404']);

/**
 * Convert user-entered Rupee amount to integer paise.
 * Strictly prevents floating-point monetary storage.
 * @param {string|number} rupeeValue
 * @returns {number} Integer paise (e.g. 640 -> 64000)
 * @throws {Error} If value is missing, negative, NaN, or has > 2 decimal places
 */
export function rupeesToPaise(rupeeValue) {
  if (rupeeValue === null || rupeeValue === undefined || rupeeValue === '') {
    throw new Error('Amount is required');
  }

  const str = String(rupeeValue).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error('Please enter a valid amount (e.g. 150 or 150.50)');
  }

  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  return Math.round(num * 100);
}

/**
 * Convert integer paise to rupee decimal string for form inputs.
 * @param {number} paise
 * @returns {string}
 */
export function paiseToRupees(paise) {
  const num = Number(paise);
  if (isNaN(num)) return '0.00';
  const val = num / 100;
  return val % 1 === 0 ? String(val) : val.toFixed(2);
}

/**
 * Show accessible field-level validation error message.
 * Links message via aria-describedby and sets aria-invalid="true".
 * @param {HTMLElement} fieldInput - Input, select, or textarea element
 * @param {string} message - Error description
 */
export function showFieldError(fieldInput, message) {
  if (!fieldInput) return;

  fieldInput.setAttribute('aria-invalid', 'true');

  const parentField = fieldInput.closest('.field') || fieldInput.parentElement;
  if (!parentField) return;

  parentField.classList.add('has-error');

  // Error message element ID
  const errorId = fieldInput.id ? `${fieldInput.id}-error` : `field-err-${Math.random().toString(36).slice(2, 7)}`;

  // Update or append error message
  let errorEl = parentField.querySelector('.field-error');
  if (!errorEl) {
    errorEl = createEl('span', {
      id: errorId,
      className: 'field-error text-danger text-xs mt-1 block',
      role: 'alert'
    });
    parentField.appendChild(errorEl);
  }

  errorEl.textContent = message;

  // Link via aria-describedby
  const currentDescribedBy = fieldInput.getAttribute('aria-describedby') || '';
  if (!currentDescribedBy.includes(errorId)) {
    fieldInput.setAttribute('aria-describedby', `${currentDescribedBy} ${errorId}`.trim());
  }
}

/**
 * Clear all field validation errors inside a form.
 * @param {HTMLFormElement} formEl
 */
export function clearFieldErrors(formEl) {
  if (!formEl) return;

  const errorEls = qsa('.field-error', formEl);
  for (const err of errorEls) {
    err.remove();
  }

  const fields = qsa('.has-error', formEl);
  for (const f of fields) {
    f.classList.remove('has-error');
  }

  const inputs = qsa('[aria-invalid="true"]', formEl);
  for (const inp of inputs) {
    inp.removeAttribute('aria-invalid');
  }

  const alertBox = qs('.alert.alert-danger', formEl);
  if (alertBox) alertBox.remove();
}

/**
 * Move focus to the first invalid input in a form.
 * @param {HTMLFormElement} formEl
 */
export function focusFirstInvalid(formEl) {
  if (!formEl) return;
  const first = formEl.querySelector('[aria-invalid="true"]') || formEl.querySelector(':invalid');
  if (first && typeof first.focus === 'function') {
    first.focus();
  }
}

/**
 * Prevent duplicate submissions by disabling the submit button during async work.
 * @param {HTMLButtonElement} buttonEl
 * @param {boolean} isLoading
 * @param {string} [loadingText='Saving...']
 */
export function setButtonLoading(buttonEl, isLoading, loadingText = 'Saving...') {
  if (!buttonEl) return;

  if (isLoading) {
    buttonEl.disabled = true;
    buttonEl.setAttribute('aria-busy', 'true');
    buttonEl.dataset.originalText = buttonEl.innerHTML;
    buttonEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${loadingText}`;
  } else {
    buttonEl.disabled = false;
    buttonEl.removeAttribute('aria-busy');
    if (buttonEl.dataset.originalText) {
      buttonEl.innerHTML = buttonEl.dataset.originalText;
      delete buttonEl.dataset.originalText;
    }
  }
}

/**
 * Initialize password show/hide toggle buttons.
 * Switches type between 'password' and 'text', updating aria-pressed and icons.
 * @param {ParentNode} [scope=document]
 */
export function initPasswordToggles(scope = document) {
  const toggleBtns = qsa('.input-with-action button[aria-label*="password" i]', scope);

  for (const btn of toggleBtns) {
    on(btn, 'click', (e) => {
      e.preventDefault();
      const input = btn.parentElement?.querySelector('input');
      if (!input) return;

      const isCurrentlyPassword = input.type === 'password';
      input.type = isCurrentlyPassword ? 'text' : 'password';

      btn.setAttribute('aria-pressed', String(isCurrentlyPassword));
      btn.setAttribute('aria-label', isCurrentlyPassword ? 'Hide password' : 'Show password');

      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isCurrentlyPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
      }
    });
  }
}

/**
 * Route authentication guard.
 * Redirects unauthenticated users attempting to visit protected pages to login.html.
 * @returns {Promise<boolean>} True if allowed to proceed, false if redirected
 */
export async function authGuard() {
  const pageName = document.body.dataset.page;
  if (!pageName || PUBLIC_PAGES.has(pageName)) {
    return true;
  }

  try {
    const user = await currentUser();
    if (!user) {
      const redirectUrl = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  } catch {
    const redirectUrl = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    window.location.href = redirectUrl;
    return false;
  }
}
