/**
 * Recurring payments page module (Review 2, Steps P3 & P4).
 * Connects recurring.html to api.js to render recurring expenses,
 * compute monthly commitments, handle schedule addition with validation,
 * toggle active statuses, and delete schedules with confirmation.
 */

import { listRecurring, listCategories, toggleRecurring, createRecurring, removeRecurring } from '../data/api.js';
import { qs, qsa, on, createEl } from '../core/dom.js';
import { formatINR, formatDate } from '../core/format.js';
import { setLoading, clearElement, renderEmptyState } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import {
  rupeesToPaise,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

let categoryMap = new Map();

/**
 * Format next due date relative description.
 * @param {string} dateStr
 * @returns {{ main: string, sub: string }}
 */
function formatNextDue(dateStr) {
  if (!dateStr) return { main: '—', sub: '' };

  const target = new Date(dateStr);
  const now = new Date('2026-10-28T00:00:00'); // Baseline date
  const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));

  const main = formatDate(dateStr);
  let sub = '';

  if (diffDays === 0) {
    sub = 'Due today';
  } else if (diffDays === 1) {
    sub = 'Tomorrow';
  } else if (diffDays > 1) {
    sub = `In ${diffDays} days`;
  } else {
    sub = `${Math.abs(diffDays)} days ago`;
  }

  return { main, sub };
}

/**
 * Render recurring stat headers.
 * @param {Array} items
 */
function renderHeaderStats(items) {
  const activeItems = items.filter((i) => i.active);

  let monthlyCommitmentPaise = 0;
  for (const item of activeItems) {
    const amt = item.amount || 0;
    const freq = (item.frequency || 'Monthly').toLowerCase();
    if (freq === 'monthly') monthlyCommitmentPaise += amt;
    else if (freq === 'weekly') monthlyCommitmentPaise += Math.round(amt * 4.333);
    else if (freq === 'yearly') monthlyCommitmentPaise += Math.round(amt / 12);
    else if (freq === 'daily') monthlyCommitmentPaise += amt * 30;
    else monthlyCommitmentPaise += amt;
  }

  const statMonthly = qs('article[aria-label="Monthly commitment"] .stat-value');
  const statMonthlyMeta = qs('article[aria-label="Monthly commitment"] .stat-meta');
  if (statMonthly) statMonthly.textContent = formatINR(monthlyCommitmentPaise);
  if (statMonthlyMeta) statMonthlyMeta.textContent = `Across ${activeItems.length} active schedules`;

  const activeCountEl = qs('article[aria-label="Active schedules"] .stat-value');
  const activeMetaEl = qs('article[aria-label="Active schedules"] .stat-meta');
  if (activeCountEl) activeCountEl.textContent = String(activeItems.length);
  if (activeMetaEl) activeMetaEl.textContent = `${items.length} total schedules`;
}

/**
 * Render recurring items table.
 * @param {Array} items
 * @param {Function} [onRefresh]
 */
function renderRecurringTable(items, onRefresh) {
  const tbody = qs('table.table tbody');
  const cardBody = qs('section[aria-labelledby="rec-title"] .card-body');
  if (!tbody) return;

  clearElement(tbody);

  if (items.length === 0) {
    if (cardBody) {
      renderEmptyState(cardBody, {
        icon: 'fa-repeat',
        title: 'No recurring schedules',
        description: 'Track subscriptions, rent, utility bills, and insurance.',
        actionText: 'Add schedule',
        actionHref: '#new-schedule'
      });
    }
    return;
  }

  for (const item of items) {
    const cat = categoryMap.get(item.categoryId) || {
      name: item.categoryId || 'Bills',
      icon: 'fa-file-invoice',
      color: 'var(--cat-bills)'
    };

    const { main: nextDueMain, sub: nextDueSub } = formatNextDue(item.nextDueDate);

    const toggleInput = createEl('input', {
      type: 'checkbox',
      checked: Boolean(item.active)
    });

    on(toggleInput, 'change', async () => {
      try {
        const updated = await toggleRecurring(item.id);
        item.active = updated.active;
        if (onRefresh) await onRefresh();
      } catch (err) {
        console.warn('[SplitStack] Error toggling recurring active state:', err);
        toggleInput.checked = !toggleInput.checked;
      }
    });

    const nextDueMainSpan = createEl('span', { className: 'cell-main', textContent: nextDueMain });
    const nextDueSubSpan = createEl('span', { className: 'cell-sub', textContent: nextDueSub });

    const delBtn = createEl('button', {
      className: 'icon-btn sm danger',
      type: 'submit',
      'aria-label': `Delete ${item.name}`
    }, [
      createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
    ]);
    const delForm = createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [delBtn]);

    on(delForm, 'submit', async (e) => {
      e.preventDefault();
      const confirmed = await confirmDialog({
        title: 'Delete schedule',
        message: `Delete recurring schedule "${item.name}"? This action cannot be undone.`,
        confirmText: 'Delete'
      });
      if (!confirmed) return;
      try {
        await removeRecurring(item.id);
        showToast(`Schedule "${item.name}" deleted`, 'info');
        if (onRefresh) await onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to delete schedule', 'danger');
      }
    });

    const tr = createEl('tr', {}, [
      createEl('td', { 'data-label': 'Payment' }, [
        createEl('span', { className: 'cell-main', textContent: item.name }),
        createEl('span', { className: 'cell-sub', textContent: cat.name })
      ]),
      createEl('td', { 'data-label': 'Frequency' }, [
        createEl('span', { className: 'badge badge-info', textContent: item.frequency || 'Monthly' })
      ]),
      createEl('td', { 'data-label': 'Next due' }, [
        nextDueMainSpan,
        nextDueSubSpan
      ]),
      createEl('td', {
        'data-label': 'Amount',
        className: 'end num fw-600',
        textContent: formatINR(item.amount)
      }),
      createEl('td', { 'data-label': 'Active' }, [
        createEl('label', { className: 'switch' }, [
          toggleInput,
          createEl('span', { className: 'visually-hidden', textContent: `${item.name} active` })
        ])
      ]),
      createEl('td', { 'data-label': 'Actions', className: 'end' }, [delForm])
    ]);

    tbody.appendChild(tr);
  }
}

/**
 * Fetch and render all recurring schedules.
 */
async function loadAndRenderRecurring() {
  const [items, cats] = await Promise.all([
    listRecurring(),
    listCategories()
  ]);

  categoryMap = new Map((cats || []).map((c) => [c.id, c]));

  renderHeaderStats(items || []);
  renderRecurringTable(items || [], loadAndRenderRecurring);
}

/**
 * Initialize recurring payments page.
 */
export async function init() {
  const cardBody = qs('section[aria-labelledby="rec-title"] .card-body');
  setLoading(cardBody, true);

  try {
    await loadAndRenderRecurring();

    // Wire new schedule form
    const form = qs('aside[aria-labelledby="add-rec-title"] form');
    if (form) {
      const submitBtn = qs('button[type="submit"]', form);
      const nameInput = qs('#r-name', form);
      const amountInput = qs('#r-amount', form);
      const freqSelect = qs('#r-freq', form);
      const catSelect = qs('#r-cat', form);
      const startInput = qs('#r-start', form);
      const nextInput = qs('#r-next', form);

      on(form, 'submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);

        let hasError = false;
        let amountPaise = 0;

        const nameVal = nameInput?.value.trim() || '';
        if (!nameVal) {
          showFieldError(nameInput, 'Name is required');
          hasError = true;
        }

        try {
          amountPaise = rupeesToPaise(amountInput?.value);
        } catch (err) {
          showFieldError(amountInput, err.message);
          hasError = true;
        }

        const startDate = startInput?.value || new Date().toISOString().slice(0, 10);
        const nextDueDate = nextInput?.value || startDate;
        const frequency = freqSelect?.value || 'Monthly';
        const rawCat = catSelect?.value || 'bills';
        const categoryId = rawCat.startsWith('cat_') ? rawCat : `cat_${rawCat}`;

        if (hasError) {
          focusFirstInvalid(form);
          return;
        }

        setButtonLoading(submitBtn, true, 'Adding schedule...');

        try {
          await createRecurring({
            name: nameVal,
            amount: amountPaise,
            categoryId,
            frequency,
            startDate,
            nextDueDate,
            active: true
          });

          showToast(`Schedule "${nameVal}" created!`, 'success');
          form.reset();
          if (startInput) startInput.value = new Date().toISOString().slice(0, 10);
          await loadAndRenderRecurring();
        } catch (err) {
          showFieldError(nameInput, err.message || 'Failed to add recurring payment');
          focusFirstInvalid(form);
        } finally {
          setButtonLoading(submitBtn, false);
        }
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading recurring page:', err);
  } finally {
    setLoading(cardBody, false);
  }
}
