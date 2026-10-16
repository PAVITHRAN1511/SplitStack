/**
 * Shopping list creation page module (Review 2, Step P4).
 * Handles creating a personal or group shopping list, validation,
 * budget in integer paise, and redirect to the new list's detail page.
 */

import { listGroups, createShoppingList } from '../data/api.js';
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
 * Initialize shopping list creation form.
 */
export async function init() {
  const form = qs('form.form');
  const submitBtn = qs('button[type="submit"]', form);
  const nameInput = qs('#l-name', form);
  const groupSelect = qs('#l-group', form);
  const budgetInput = qs('#l-budget', form);

  if (!form) return;

  // Dynamically populate user groups
  try {
    const groups = await listGroups();
    if (groupSelect && groups.length > 0) {
      groupSelect.innerHTML = '<option value="">Just me (personal)</option>' +
        groups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
    }
  } catch (err) {
    console.warn('[SplitStack] Could not load groups for shopping list:', err);
  }

  on(form, 'submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const nameVal = nameInput?.value.trim() || '';
    const groupVal = groupSelect?.value || null;
    let budgetPaise = 0;
    let hasError = false;

    if (!nameVal) {
      showFieldError(nameInput, 'List name is required');
      hasError = true;
    }

    const budgetVal = budgetInput?.value.trim();
    if (budgetVal) {
      try {
        budgetPaise = rupeesToPaise(budgetVal);
      } catch (err) {
        showFieldError(budgetInput, err.message);
        hasError = true;
      }
    }

    if (hasError) {
      focusFirstInvalid(form);
      return;
    }

    setButtonLoading(submitBtn, true, 'Creating list...');

    try {
      const newList = await createShoppingList({
        name: nameVal,
        budget: budgetPaise,
        groupId: groupVal || null
      });

      showToast(`Shopping list "${newList.name}" created!`, 'success');

      setTimeout(() => {
        window.location.href = `shopping-detail.html?id=${encodeURIComponent(newList.id)}`;
      }, 500);
    } catch (err) {
      setButtonLoading(submitBtn, false);

      if (err.field === 'name') {
        showFieldError(nameInput, err.message);
      } else if (err.field === 'budget') {
        showFieldError(budgetInput, err.message);
      } else {
        showFieldError(nameInput, err.message || 'Failed to create shopping list');
      }
      focusFirstInvalid(form);
    }
  });
}
