/**
 * Login page module (Review 2, Step P4).
 * Handles authentication form submission, password visibility toggling,
 * accessible field-level error messages, and post-login redirection.
 */

import { login } from '../data/api.js';
import { qs, on } from '../core/dom.js';
import { showToast } from '../ui/toast.js';
import {
  initPasswordToggles,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

/**
 * Initialize login page module.
 */
export async function init() {
  initPasswordToggles();

  const form = qs('form.form');
  const submitBtn = qs('button[type="submit"]', form);
  const emailInput = qs('#email', form);
  const passwordInput = qs('#password', form);

  if (!form) return;

  on(form, 'submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    // Client-side validation
    let hasError = false;
    if (!email) {
      showFieldError(emailInput, 'Email address is required');
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError(emailInput, 'Please enter a valid email address');
      hasError = true;
    }

    if (!password) {
      showFieldError(passwordInput, 'Password is required');
      hasError = true;
    } else if (password.length < 8) {
      showFieldError(passwordInput, 'Password must be at least 8 characters');
      hasError = true;
    }

    if (hasError) {
      focusFirstInvalid(form);
      return;
    }

    setButtonLoading(submitBtn, true, 'Signing in...');

    try {
      const user = await login({ email, password });
      showToast(`Welcome back, ${user.name}!`, 'success');

      // Check for redirect parameter
      const url = new URL(window.location.href);
      const redirectPath = url.searchParams.get('redirect') || 'dashboard.html';

      setTimeout(() => {
        window.location.href = redirectPath;
      }, 500);
    } catch (err) {
      setButtonLoading(submitBtn, false);

      const msg = err.message || 'Invalid email or password';
      if (err.field === 'email') {
        showFieldError(emailInput, msg);
      } else {
        showFieldError(passwordInput, msg);
      }
      focusFirstInvalid(form);
    }
  });
}
