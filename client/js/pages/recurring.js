/**
 * Recurring payments page module (Review 2, Step P3).
 * Connects recurring.html to api.js to render payment schedules, active/paused counts,
 * and live active/paused toggle switches.
 */

import { listRecurring, toggleRecurring, listCategories } from '../data/api.js';
import { qs, createEl, on } from '../core/dom.js';
import { formatINR, formatDate, formatRelativeDate } from '../core/format.js';
import { setLoading, clearElement, renderEmptyState } from '../core/render.js';

let categoryMap = new Map();

/**
 * Render recurring header summary and badge.
 * @param {Array} items
 */
function renderHeaderStats(items) {
  const activeItems = items.filter((i) => i.active);
  const pausedCount = items.length - activeItems.length;

  const monthlyActive = activeItems.filter((i) => (i.frequency || '').toLowerCase() === 'monthly');
  const monthlyTotal = monthlyActive.reduce((sum, i) => sum + (i.amount || 0), 0);

  const yearlyActive = activeItems.filter((i) => (i.frequency || '').toLowerCase() === 'yearly');
  const yearlyTotal = yearlyActive.reduce((sum, i) => sum + (i.amount || 0), 0);

  const headerP = qs('.page-header p');
  if (headerP) {
    headerP.textContent = `${formatINR(monthlyTotal)} a month in active subscriptions and bills, plus ${formatINR(yearlyTotal)} a year.`;
  }

  const badge = qs('section[aria-labelledby="rec-title"] .card-header .badge');
  if (badge) {
    badge.textContent = `${activeItems.length} active · ${pausedCount} paused`;
  }
}

/**
 * Render recurring items table.
 * @param {Array} items
 */
function renderTable(items) {
  const tbody = qs('section[aria-labelledby="rec-title"] tbody');
  if (!tbody) return;

  clearElement(tbody);

  if (items.length === 0) {
    const tr = createEl('tr', {}, [
      createEl('td', { colspan: '6', className: 'p-0' }, [
        renderEmptyState(createEl('div'), {
          icon: 'fa-rotate',
          title: 'No recurring payments',
          message: 'Add subscriptions or bills to track upcoming renewals.'
        })
      ])
    ]);
    tbody.appendChild(tr);
    return;
  }

  for (const item of items) {
    const cat = categoryMap.get(item.categoryId) || {
      name: item.categoryId || 'Bills & Utilities'
    };

    // Next due text
    let nextDueMain = '—';
    let nextDueSub = 'Paused';
    if (item.active && item.nextDueDate) {
      nextDueMain = formatDate(item.nextDueDate);
      nextDueSub = formatRelativeDate(item.nextDueDate);
    }

    // Toggle switch
    const toggleInput = createEl('input', {
      type: 'checkbox',
      name: `active-${item.id}`,
      checked: Boolean(item.active)
    });

    on(toggleInput, 'change', async () => {
      try {
        const updated = await toggleRecurring(item.id);
        item.active = updated.active;
        // Re-render stats and next due cell
        renderHeaderStats(items);
        if (item.active && item.nextDueDate) {
          nextDueMainSpan.textContent = formatDate(item.nextDueDate);
          nextDueSubSpan.textContent = formatRelativeDate(item.nextDueDate);
        } else {
          nextDueMainSpan.textContent = '—';
          nextDueSubSpan.textContent = 'Paused';
        }
      } catch (err) {
        console.warn('[SplitStack] Failed to toggle recurring item:', err);
        toggleInput.checked = !toggleInput.checked;
      }
    });

    const nextDueMainSpan = createEl('span', { className: 'cell-main', textContent: nextDueMain });
    const nextDueSubSpan = createEl('span', { className: 'cell-sub', textContent: nextDueSub });

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
      createEl('td', { 'data-label': 'Actions', className: 'end' }, [
        createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [
          createEl('button', {
            className: 'icon-btn sm danger',
            type: 'submit',
            'aria-label': `Delete ${item.name}`
          }, [
            createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
          ])
        ])
      ])
    ]);

    tbody.appendChild(tr);
  }
}

/**
 * Initialize recurring payments page.
 */
export async function init() {
  const cardBody = qs('section[aria-labelledby="rec-title"] .card-body');
  setLoading(cardBody, true);

  try {
    const [items, cats] = await Promise.all([
      listRecurring(),
      listCategories()
    ]);

    categoryMap = new Map((cats || []).map((c) => [c.id, c]));

    renderHeaderStats(items || []);
    renderTable(items || []);
  } catch (err) {
    console.warn('[SplitStack] Error loading recurring payments:', err);
  } finally {
    setLoading(cardBody, false);
  }
}
