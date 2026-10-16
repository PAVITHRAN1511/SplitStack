/**
 * Group creation page module (Review 2, Step P4).
 * Handles creating a new expense-sharing group, validation,
 * accessible error feedback, and redirect to the new group's detail page.
 */

import { createGroup } from '../data/api.js';
import { qs, on } from '../core/dom.js';
import { showToast } from '../ui/toast.js';
import {
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

/**
 * Initialize group creation form.
 */
export async function init() {
  const form = qs('form.form');
  const submitBtn = qs('button[type="submit"]', form);
  const nameInput = qs('#g-name', form);
  const descTextarea = qs('#g-desc', form);

  if (!form) return;

  on(form, 'submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const nameVal = nameInput?.value.trim() || '';
    const descVal = descTextarea?.value.trim() || '';

    let hasError = false;

    if (!nameVal) {
      showFieldError(nameInput, 'Group name is required');
      hasError = true;
    } else if (nameVal.length < 2) {
      showFieldError(nameInput, 'Group name must be at least 2 characters');
      hasError = true;
    } else if (nameVal.length > 60) {
      showFieldError(nameInput, 'Group name cannot exceed 60 characters');
      hasError = true;
    }

    if (hasError) {
      focusFirstInvalid(form);
      return;
    }

    setButtonLoading(submitBtn, true, 'Creating group...');

    try {
      const group = await createGroup({
        name: nameVal,
        description: descVal
      });

      showToast(`Group "${group.name}" created!`, 'success');

      setTimeout(() => {
        window.location.href = `group-detail.html?id=${encodeURIComponent(group.id)}`;
      }, 500);
    } catch (err) {
      setButtonLoading(submitBtn, false);

      if (err.field === 'name') {
        showFieldError(nameInput, err.message);
      } else {
        showFieldError(nameInput, err.message || 'Failed to create group');
      }
      focusFirstInvalid(form);
    }
  });
}
