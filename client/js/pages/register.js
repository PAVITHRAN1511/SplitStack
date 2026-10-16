/**
 * Registration page module (Review 2, Step P4).
 * Handles account creation, password complexity/matching validation,
 * field-level errors, and post-registration redirect.
 */

import { register } from '../data/api.js';
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
 * Initialize registration page module.
 */
export async function init() {
  initPasswordToggles();

  const form = qs('form.form');
  const submitBtn = qs('button[type="submit"]', form);
  const nameInput = qs('#name', form);
  const emailInput = qs('#email', form);
  const passwordInput = qs('#password', form);
  const confirmInput = qs('#confirm', form);
  const termsCheckbox = qs('input[name="terms"]', form);

  if (!form) return;

  on(form, 'submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const name = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    const confirm = confirmInput?.value || '';
    const terms = termsCheckbox?.checked;

    let hasError = false;

    if (!name || name.length < 2) {
      showFieldError(nameInput, 'Please enter your full name (at least 2 characters)');
      hasError = true;
    }

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
    } else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      showFieldError(passwordInput, 'Password must contain at least one letter and one number');
      hasError = true;
    }

    if (!confirm) {
      showFieldError(confirmInput, 'Please confirm your password');
      hasError = true;
    } else if (password !== confirm) {
      showFieldError(confirmInput, 'Passwords do not match');
      hasError = true;
    }

    if (!terms) {
      showFieldError(termsCheckbox, 'You must agree to the terms of use');
      hasError = true;
    }

    if (hasError) {
      focusFirstInvalid(form);
      return;
    }

    setButtonLoading(submitBtn, true, 'Creating account...');

    try {
      const user = await register({ name, email, password });
      showToast(`Account created! Welcome, ${user.name}!`, 'success');

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 600);
    } catch (err) {
      setButtonLoading(submitBtn, false);

      const msg = err.message || 'Registration failed';
      if (err.field === 'email' || err.status === 409 || msg.toLowerCase().includes('email')) {
        showFieldError(emailInput, msg);
      } else if (err.field === 'password') {
        showFieldError(passwordInput, msg);
      } else {
        showFieldError(nameInput, msg);
      }
      focusFirstInvalid(form);
    }
  });
}
