/**
 * Income page module (Review 2, Step P3).
 * Connects income.html to api.js to render summary statistics,
 * income history table, and empty states.
 */

import { listIncome, listCategories, removeIncome } from '../data/api.js';
import { qs, createEl } from '../core/dom.js';
import { formatINR, formatDate } from '../core/format.js';
import { setLoading, clearElement, renderEmptyState } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';

let categoryMap = new Map();

/**
 * Render income summary cards.
 * @param {Array} incomeList
 */
function renderSummary(incomeList) {
  // This month (October 2026)
  const thisMonthList = incomeList.filter((i) => i.date?.startsWith('2026-10'));
  const thisMonthTotal = thisMonthList.reduce((sum, i) => sum + (i.amount || 0), 0);

  // Last 3 months (Aug, Sep, Oct 2026)
  const last3MonthsList = incomeList.filter((i) => {
    return i.date?.startsWith('2026-10') || i.date?.startsWith('2026-09') || i.date?.startsWith('2026-08');
  });
  const last3MonthsTotal = last3MonthsList.reduce((sum, i) => sum + (i.amount || 0), 0);

  // Side income share
  const sideIncomeList = incomeList.filter((i) => i.categoryId !== 'salary');
  const sideIncomeTotal = sideIncomeList.reduce((sum, i) => sum + (i.amount || 0), 0);
  const allTotal = incomeList.reduce((sum, i) => sum + (i.amount || 0), 0);
  const sideSharePercent = allTotal > 0 ? ((sideIncomeTotal / allTotal) * 100).toFixed(1) : '0.0';

  // Update DOM cards
  const thisMonthVal = qs('.stat.tone-success .stat-value');
  const thisMonthMeta = qs('.stat.tone-success .stat-meta');
  if (thisMonthVal) thisMonthVal.textContent = formatINR(thisMonthTotal);
  if (thisMonthMeta) thisMonthMeta.textContent = `${thisMonthList.length} entries`;

  const last3Val = qs('.stat.tone-primary .stat-value');
  const last3Meta = qs('.stat.tone-primary .stat-meta');
  if (last3Val) last3Val.textContent = formatINR(last3MonthsTotal);
  if (last3Meta) last3Meta.textContent = `${last3MonthsList.length} entries`;

  const sideShareVal = qs('.stat.tone-info .stat-value');
  if (sideShareVal) sideShareVal.textContent = `${sideSharePercent}%`;
}

/**
 * Render income table rows.
 * @param {Array} incomeList
 */
function renderIncomeTable(incomeList) {
  const tbody = qs('section[aria-labelledby="inc-title"] tbody');
  if (!tbody) return;

  clearElement(tbody);

  if (incomeList.length === 0) {
    const tr = createEl('tr', {}, [
      createEl('td', { colspan: '5', className: 'p-0' }, [
        renderEmptyState(createEl('div'), {
          icon: 'fa-wallet',
          title: 'No income logged',
          message: 'You have not added any income records yet.',
          actionText: 'Log income',
          onAction: () => {
            window.location.href = 'income-form.html';
          }
        })
      ])
    ]);
    tbody.appendChild(tr);
    return;
  }

  for (const item of incomeList) {
    const cat = categoryMap.get(item.categoryId) || {
      name: item.categoryId || 'Income',
      icon: 'fa-briefcase',
      color: 'var(--cat-education)'
    };

    const tr = createEl('tr', {}, [
      createEl('td', { 'data-label': 'Date' }, [
        createEl('time', {
          datetime: item.date || '',
          className: 'text-dim',
          textContent: formatDate(item.date)
        })
      ]),
      createEl('td', { 'data-label': 'Source', className: 'fw-600', textContent: item.source }),
      createEl('td', { 'data-label': 'Category' }, [
        createEl('span', {
          className: 'cat-tag',
          style: { '--cat': `var(--cat-${item.categoryId}, ${cat.color || 'var(--cat-education)'})` }
        }, [
          createEl('i', { className: `fa-solid ${cat.icon || 'fa-briefcase'}`, 'aria-hidden': 'true' }),
          cat.name
        ])
      ]),
      createEl('td', {
        'data-label': 'Amount',
        className: 'end num amount-in',
        textContent: `+${formatINR(item.amount)}`
      }),
      createEl('td', { 'data-label': 'Actions', className: 'end' }, [
        createEl('div', { className: 'row-actions' }, [
          createEl('a', {
            className: 'icon-btn sm',
            href: `income-form.html?id=${encodeURIComponent(item.id)}`,
            'aria-label': `Edit ${item.source}`
          }, [
            createEl('i', { className: 'fa-solid fa-pen', 'aria-hidden': 'true' })
          ]),
          (() => {
            const delBtn = createEl('button', {
              className: 'icon-btn sm danger',
              type: 'submit',
              'aria-label': `Delete ${item.source}`
            }, [
              createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
            ]);
            const delForm = createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [delBtn]);
            delForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const confirmed = await confirmDialog({
                title: 'Delete income record',
                message: `Are you sure you want to delete "${item.source}"? This action cannot be undone.`,
                confirmText: 'Delete'
              });
              if (!confirmed) return;
              try {
                await removeIncome(item.id);
                showToast('Income record deleted', 'info');
                await loadAndRenderIncome();
              } catch (err) {
                showToast(err.message || 'Failed to delete income', 'danger');
              }
            });
            return delForm;
          })()
        ])
      ])
    ]);

    tbody.appendChild(tr);
  }
}

/**
 * Fetch and render all income data.
 */
async function loadAndRenderIncome() {
  const cardBody = qs('section[aria-labelledby="inc-title"] .card-body');
  try {
    const [incomeResult, cats] = await Promise.all([
      listIncome({ limit: 100 }),
      listCategories()
    ]);

    categoryMap = new Map((cats || []).map((c) => [c.id, c]));

    const incomeList = incomeResult?.income || [];
    renderSummary(incomeList);
    renderIncomeTable(incomeList);
  } catch (err) {
    console.warn('[SplitStack] Error loading income page:', err);
  }
}

/**
 * Initialize income page.
 */
export async function init() {
  const cardBody = qs('section[aria-labelledby="inc-title"] .card-body');
  setLoading(cardBody, true);

  try {
    await loadAndRenderIncome();
  } finally {
    setLoading(cardBody, false);
  }
}
