/**
 * Shared expense creation page module (Review 2, Step P4).
 * Handles adding a shared expense to a group with equal or custom splits,
 * dynamic group member population, integer paise validation, and accessible feedback.
 */

import { getGroup, currentUser, createSharedExpense, validateCustomShares } from '../data/api.js';
import { qs, qsa, on, createEl } from '../core/dom.js';
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
 * Get two-letter initials from full name.
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Initialize shared expense form.
 */
export async function init() {
  const main = qs('main#main');
  const url = new URL(window.location.href);
  const groupId = url.searchParams.get('id') || url.searchParams.get('groupId') || 'grp_goa';

  setLoading(main, true);

  try {
    const [group, user] = await Promise.all([getGroup(groupId), currentUser()]);

    // Update breadcrumbs and Cancel links
    const groupLink = qs('.breadcrumbs a[href*="group-detail.html"]');
    if (groupLink) {
      groupLink.href = `group-detail.html?id=${encodeURIComponent(group.id)}`;
      groupLink.textContent = group.name;
    }
    const cancelLink = qs('.form-actions a[href*="group-detail.html"]');
    if (cancelLink) {
      cancelLink.href = `group-detail.html?id=${encodeURIComponent(group.id)}`;
    }

    const form = qs('form.form');
    if (!form) return;

    // Populate Paid By dropdown
    const paidSelect = qs('#s-paid', form);
    if (paidSelect) {
      paidSelect.innerHTML = group.members.map((m) => {
        const isCurrent = m.userId === user?.id;
        return `<option value="${m.userId}" ${isCurrent ? 'selected' : ''}>${m.name}${isCurrent ? ' (you)' : ''}</option>`;
      }).join('');
    }

    // Populate Equal Split member checkboxes
    const equalContainer = qs('.equal-split .grid', form);
    if (equalContainer) {
      equalContainer.innerHTML = group.members.map((m) => {
        const initials = getInitials(m.name);
        return `
          <label class="member check">
            <input type="checkbox" name="participants" value="${m.userId}" checked>
            <span class="avatar sm" title="${m.name}" aria-hidden="true">${initials}</span>
            <span class="grow">${m.name}</span>
          </label>
        `;
      }).join('');
    }

    // Populate Custom Split member inputs
    const customContainer = qs('.custom-split', form);
    if (customContainer) {
      // Remove existing share rows but keep legend and alert box
      const existingRows = qsa('.share-row', customContainer);
      for (const r of existingRows) r.remove();

      const legend = qs('legend', customContainer);
      const alertBox = qs('.alert', customContainer);

      const rowsFrag = document.createDocumentFragment();
      for (const m of group.members) {
        const initials = getInitials(m.name);
        const row = createEl('div', { className: 'share-row' });
        row.innerHTML = `
          <span class="avatar sm" title="${m.name}" aria-hidden="true">${initials}</span>
          <label for="share-${m.userId}">${m.name}</label>
          <div class="input-group">
            <span class="addon" aria-hidden="true">₹</span>
            <input class="input share-input" id="share-${m.userId}" data-user-id="${m.userId}" name="share_${m.userId}" type="number" min="0" step="0.01" placeholder="0.00">
          </div>
        `;
        rowsFrag.appendChild(row);
      }

      if (alertBox) {
        customContainer.insertBefore(rowsFrag, alertBox);
      } else {
        customContainer.appendChild(rowsFrag);
      }
    }

    // Split type toggle visibility and live custom allocation tracker
    const splitTypeRadios = qsa('input[name="split_type"]', form);
    const equalSection = qs('.equal-split', form);
    const customSection = qs('.custom-split', form);
    const amountInput = qs('#s-amount', form);

    function updateCustomRemaining() {
      const selected = form.querySelector('input[name="split_type"]:checked')?.value || 'equal';
      if (selected !== 'custom' || !customContainer) return;

      let totalPaise = 0;
      try {
        if (amountInput?.value) totalPaise = rupeesToPaise(amountInput.value);
      } catch (_) {
        totalPaise = 0;
      }

      const shareInputs = qsa('.share-input', customContainer);
      let assignedPaise = 0;
      for (const inp of shareInputs) {
        if (inp.value) {
          try {
            assignedPaise += rupeesToPaise(inp.value);
          } catch (_) {}
        }
      }

      const remainingPaise = totalPaise - assignedPaise;
      let trackerEl = qs('.custom-split-tracker', customContainer);
      if (!trackerEl) {
        trackerEl = createEl('div', { className: 'custom-split-tracker alert alert-info mt-2' });
        customContainer.appendChild(trackerEl);
      }

      if (totalPaise <= 0) {
        trackerEl.textContent = 'Enter a valid total amount above to calculate custom shares.';
        trackerEl.className = 'custom-split-tracker alert alert-info mt-2';
      } else if (remainingPaise === 0) {
        trackerEl.textContent = `✓ Perfect! Total assigned matches ₹${(totalPaise / 100).toFixed(2)}.`;
        trackerEl.className = 'custom-split-tracker alert alert-success mt-2';
      } else if (remainingPaise > 0) {
        trackerEl.textContent = `₹${(remainingPaise / 100).toFixed(2)} remaining to assign (Total: ₹${(totalPaise / 100).toFixed(2)}, Assigned: ₹${(assignedPaise / 100).toFixed(2)}).`;
        trackerEl.className = 'custom-split-tracker alert alert-warning mt-2';
      } else {
        trackerEl.textContent = `Over-allocated by ₹${(Math.abs(remainingPaise) / 100).toFixed(2)}! Total is ₹${(totalPaise / 100).toFixed(2)}, but assigned is ₹${(assignedPaise / 100).toFixed(2)}.`;
        trackerEl.className = 'custom-split-tracker alert alert-danger mt-2';
      }
    }

    function updateSplitVisibility() {
      const selected = form.querySelector('input[name="split_type"]:checked')?.value || 'equal';
      if (equalSection) {
        equalSection.style.display = selected === 'equal' ? '' : 'none';
      }
      if (customSection) {
        customSection.style.display = selected === 'custom' ? '' : 'none';
        if (selected === 'custom') updateCustomRemaining();
      }
    }

    for (const radio of splitTypeRadios) {
      on(radio, 'change', updateSplitVisibility);
    }
    updateSplitVisibility();

    if (amountInput) {
      on(amountInput, 'input', updateCustomRemaining);
    }
    if (customContainer) {
      on(customContainer, 'input', (e) => {
        if (e.target && e.target.classList.contains('share-input')) {
          updateCustomRemaining();
        }
      });
    }

    // Wire submit handler
    const submitBtn = qs('button[type="submit"]', form);
    const titleInput = qs('#s-title', form);
    const catSelect = qs('#s-cat', form);
    const dateInput = qs('#s-date', form);

    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    on(form, 'submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);

      let hasError = false;
      let amountPaise = 0;

      // Validate title
      const titleVal = titleInput?.value.trim() || '';
      if (!titleVal) {
        showFieldError(titleInput, 'Description/title is required');
        hasError = true;
      }

      // Validate total amount
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

      // Split type
      const splitType = form.querySelector('input[name="split_type"]:checked')?.value || 'equal';
      const paidBy = paidSelect?.value || user.id;
      let shares = [];

      if (splitType === 'equal') {
        const checkedInputs = qsa('input[name="participants"]:checked', form);
        if (checkedInputs.length === 0) {
          showFieldError(equalContainer || amountInput, 'Select at least one participant');
          hasError = true;
        } else {
          shares = Array.from(checkedInputs).map((inp) => ({ userId: inp.value }));
        }
      } else {
        // Custom split: collect each member's amount
        const shareInputs = qsa('.share-input', form);
        const customShares = [];

        for (const sInp of shareInputs) {
          const uId = sInp.dataset.userId;
          const val = sInp.value.trim();
          let sharePaise = 0;
          if (val) {
            try {
              sharePaise = rupeesToPaise(val);
            } catch (err) {
              showFieldError(sInp, err.message);
              hasError = true;
            }
          }
          customShares.push({ userId: uId, amount: sharePaise });
        }

        if (!hasError) {
          const customRes = validateCustomShares({
            amount: amountPaise,
            shares: customShares,
            allowedMemberIds: group.members.map((m) => m.userId)
          });

          if (!customRes.isValid) {
            showFieldError(amountInput, customRes.error);
            hasError = true;
          } else {
            shares = customShares;
          }
        }
      }

      if (hasError) {
        focusFirstInvalid(form);
        return;
      }

      const catVal = catSelect?.value || 'food';

      setButtonLoading(submitBtn, true, 'Adding expense...');

      try {
        await createSharedExpense(group.id, {
          title: titleVal,
          amount: amountPaise,
          categoryId: catVal.startsWith('cat_') ? catVal : `cat_${catVal}`,
          date: dateVal,
          splitType,
          shares,
          paidBy
        });

        showToast('Shared expense recorded successfully!', 'success');

        setTimeout(() => {
          window.location.href = `group-detail.html?id=${encodeURIComponent(group.id)}`;
        }, 500);
      } catch (err) {
        setButtonLoading(submitBtn, false);

        if (err.field === 'title') {
          showFieldError(titleInput, err.message);
        } else if (err.field === 'amount') {
          showFieldError(amountInput, err.message);
        } else if (err.field === 'shares') {
          showFieldError(amountInput, err.message);
        } else {
          showFieldError(titleInput, err.message || 'Failed to add shared expense');
        }
        focusFirstInvalid(form);
      }
    });
  } catch (err) {
    console.warn('[SplitStack] Error loading group for shared expense:', err);
    clearElement(main);
    renderErrorState(main, `Group "${groupId}" was not found or could not be loaded.`, () => {
      window.location.href = 'groups.html';
    });
  } finally {
    setLoading(main, false);
  }
}
