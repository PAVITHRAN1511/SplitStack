/**
 * Shopping list form page module (Review 2, Steps P4 & P7).
 * Handles creating or editing a personal or group shopping list, validation,
 * budget in integer paise, and redirect to the list's detail page.
 */

import { listGroups, getShoppingList, createShoppingList, updateShoppingList } from '../data/api.js';
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
 * Initialize shopping list form (create or edit).
 */
export async function init() {
  const form = qs('form.form');
  const submitBtn = qs('button[type="submit"]', form);
  const nameInput = qs('#l-name', form);
  const groupSelect = qs('#l-group', form);
  const budgetInput = qs('#l-budget', form);

  if (!form) return;

  const url = new URL(window.location.href);
  const editId = url.searchParams.get('id');
  const isEditMode = Boolean(editId);

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

  // If in edit mode, load existing shopping list and update UI copy
  if (isEditMode) {
    const breadcrumbCurrent = qs('.breadcrumbs li[aria-current="page"]');
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = 'Edit list';

    const h1 = qs('.page-header h1');
    if (h1) h1.textContent = 'Edit shopping list';

    const p = qs('.page-header p');
    if (p) p.textContent = 'Update list name, group sharing, or budget.';

    if (submitBtn) submitBtn.textContent = 'Save changes';

    try {
      const existingList = await getShoppingList(editId);
      if (nameInput) nameInput.value = existingList.name || '';
      if (groupSelect) groupSelect.value = existingList.groupId || '';
      if (budgetInput && existingList.budget > 0) {
        budgetInput.value = String(existingList.budget / 100);
      }
    } catch (err) {
      showToast(err.message || 'Failed to load shopping list', 'danger');
    }
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

    setButtonLoading(submitBtn, true, isEditMode ? 'Saving changes...' : 'Creating list...');

    try {
      if (isEditMode) {
        const updated = await updateShoppingList(editId, {
          name: nameVal,
          budget: budgetPaise,
          groupId: groupVal || null
        });

        showToast(`Shopping list "${updated.name}" updated!`, 'success');

        setTimeout(() => {
          window.location.href = `shopping-detail.html?id=${encodeURIComponent(updated.id)}`;
        }, 500);
      } else {
        const newList = await createShoppingList({
          name: nameVal,
          budget: budgetPaise,
          groupId: groupVal || null
        });

        showToast(`Shopping list "${newList.name}" created!`, 'success');

        setTimeout(() => {
          window.location.href = `shopping-detail.html?id=${encodeURIComponent(newList.id)}`;
        }, 500);
      }
    } catch (err) {
      setButtonLoading(submitBtn, false);

      if (err.field === 'name') {
        showFieldError(nameInput, err.message);
      } else if (err.field === 'budget') {
        showFieldError(budgetInput, err.message);
      } else {
        showFieldError(nameInput, err.message || (isEditMode ? 'Failed to update shopping list' : 'Failed to create shopping list'));
      }
      focusFirstInvalid(form);
    }
  });
}
