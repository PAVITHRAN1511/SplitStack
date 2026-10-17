/**
 * Group detail page module (Review 2, Steps P3 & P4).
 * Connects group-detail.html to api.js to render group info, shared expenses,
 * member net balances, wires add member form, shared expense deletion,
 * and leave group flow with confirmation.
 */

import {
  getGroup,
  listSharedExpenses,
  getGroupBalances,
  getGroupMemberStats,
  getSuggestedSettlements,
  currentUser,
  listCategories,
  removeSharedExpense,
  addMember,
  leaveGroup
} from '../data/api.js';
import { qs, on, createEl } from '../core/dom.js';
import { formatINR, formatDate } from '../core/format.js';
import { getInitials } from '../ui/user.js';
import { setLoading, clearElement, renderEmptyState, renderErrorState } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import {
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

let categoryMap = new Map();
const AVATAR_COLORS = ['#0ea5e9', '#db2777', '#d97706', '#059669', '#7c3aed', '#e11d48'];

/**
 * Render group header and action links.
 * @param {Object} group
 * @param {number} totalSpentPaise
 */
function renderHeader(group, totalSpentPaise) {
  // Breadcrumb
  const breadcrumbCurrent = qs('.breadcrumbs li[aria-current="page"]');
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = group.name;

  // Title and subtitle
  const h1 = qs('.page-header h1');
  const p = qs('.page-header p');
  if (h1) h1.textContent = group.name;
  if (p) {
    p.textContent = `${group.members?.length || 0} members · Total spent ${formatINR(totalSpentPaise)}`;
  }

  // Add expense button link
  const addExpLink = qs('.page-actions a.btn-primary');
  if (addExpLink) {
    addExpLink.href = `shared-expense-form.html?groupId=${encodeURIComponent(group.id)}`;
  }

  // Settle up link
  const settleLink = qs('.page-actions a.btn-secondary');
  if (settleLink) {
    settleLink.href = `settlements.html?groupId=${encodeURIComponent(group.id)}`;
  }
}

/**
 * Render shared expenses table.
 * @param {Array} expenses
 * @param {Object} group
 * @param {Function} [onRefresh]
 */
function renderExpensesTable(expenses, group, onRefresh) {
  const tbody = qs('table.table tbody');
  const cardBody = qs('section[aria-labelledby="exp-title"] .card-body');
  if (!tbody) return;

  clearElement(tbody);

  if (expenses.length === 0) {
    if (cardBody) {
      renderEmptyState(cardBody, {
        icon: 'fa-receipt',
        title: 'No shared expenses yet',
        description: 'Add an expense to start splitting costs with the group.',
        actionText: 'Add an expense',
        actionHref: `shared-expense-form.html?groupId=${encodeURIComponent(group.id)}`
      });
    }
    return;
  }

  for (const exp of expenses) {
    const cat = categoryMap.get(exp.categoryId) || {
      name: exp.categoryId || 'General',
      icon: 'fa-tag'
    };

    const payer = group.members?.find((m) => m.userId === exp.paidBy) || { name: 'Someone' };
    const splitCount = exp.shares?.length || group.members?.length || 1;
    const splitLabel = `${exp.splitType === 'custom' ? 'Custom' : 'Equal'} · ${splitCount} people`;

    const delBtn = createEl('button', {
      className: 'icon-btn sm danger',
      type: 'submit',
      'aria-label': `Delete ${exp.title}`
    }, [
      createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
    ]);
    const delForm = createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [delBtn]);

    on(delForm, 'submit', async (e) => {
      e.preventDefault();
      const confirmed = await confirmDialog({
        title: 'Delete shared expense',
        message: `Delete "${exp.title}"? This will recalculate member balances.`,
        confirmText: 'Delete'
      });
      if (!confirmed) return;
      try {
        await removeSharedExpense(groupId, exp.id);
        showToast('Shared expense deleted', 'info');
        if (onRefresh) await onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to delete shared expense', 'danger');
      }
    });

    const tr = createEl('tr', {}, [
      createEl('td', { 'data-label': 'Expense' }, [
        createEl('span', { className: 'cell-main', textContent: exp.title }),
        createEl('span', { className: 'cell-sub' }, [
          createEl('time', { datetime: exp.date, textContent: formatDate(exp.date) }),
          ` · ${cat.name}`
        ])
      ]),
      createEl('td', { 'data-label': 'Paid by' }, [
        createEl('span', { className: 'flex items-center gap-2' }, [
          createEl('span', {
            className: 'avatar sm',
            style: { '--avatar': AVATAR_COLORS[0] },
            title: payer.name,
            'aria-hidden': 'true',
            textContent: getInitials(payer.name)
          }),
          payer.name
        ])
      ]),
      createEl('td', { 'data-label': 'Split' }, [
        createEl('span', { className: 'badge', textContent: splitLabel })
      ]),
      createEl('td', {
        'data-label': 'Amount',
        className: 'end num fw-600',
        textContent: formatINR(exp.amount)
      }),
      createEl('td', { 'data-label': 'Actions', className: 'end' }, [delForm])
    ]);

    tbody.appendChild(tr);
  }
}

/**
 * Render group member balances card with per-member stats and suggested settlements.
 * @param {Record<string, { paid: number, share: number, net: number }>} memberStats
 * @param {Object} suggested - Result from getSuggestedSettlements ({ transfers, ... })
 * @param {Object} group
 * @param {Object} currentUserData
 */
function renderBalancesCard(memberStats, suggested, group, currentUserData) {
  const container = qs('section[aria-labelledby="bal-title"] .card-body.stack');
  if (!container) return;

  clearElement(container);

  for (const member of group.members || []) {
    const isMe = member.userId === currentUserData.id;
    const isAdmin = member.role === 'admin';

    const stats = memberStats?.[member.userId] || { paid: 0, share: 0, net: 0 };
    const netPaise = stats.net;
    const paidPaise = stats.paid;
    const sharePaise = stats.share;

    const titleSpans = [member.name];
    if (isMe && isAdmin) {
      titleSpans.push(createEl('span', { className: 'badge badge-primary', textContent: 'You · admin' }));
    } else if (isMe) {
      titleSpans.push(createEl('span', { className: 'badge badge-primary', textContent: 'You' }));
    } else if (isAdmin) {
      titleSpans.push(createEl('span', { className: 'badge', textContent: 'Admin' }));
    }

    const balanceSpan = createEl('span', {
      className: netPaise > 0 ? 'balance-pos num' : netPaise < 0 ? 'balance-neg num' : 'balance-zero',
      textContent: netPaise > 0
        ? `+${formatINR(netPaise)}`
        : netPaise < 0
        ? `−${formatINR(Math.abs(netPaise))}`
        : '₹0'
    });

    const memberDiv = createEl('div', { className: 'member' }, [
      createEl('span', {
        className: 'avatar',
        style: { '--avatar': isMe ? 'var(--primary)' : AVATAR_COLORS[1] },
        title: member.name,
        'aria-hidden': 'true',
        textContent: getInitials(member.name)
      }),
      createEl('div', { className: 'grow' }, [
        createEl('span', { className: 'list-title' }, titleSpans),
        createEl('span', {
          className: 'list-sub',
          textContent: `Paid ${formatINR(paidPaise)} · share ${formatINR(sharePaise)}`
        })
      ]),
      balanceSpan
    ]);

    container.appendChild(memberDiv);
  }

  container.appendChild(createEl('p', {
    className: 'text-xs',
    textContent: 'Balance = amount paid − your share. Positive means the group owes you.'
  }));

  // Suggested settlements section
  const transfers = suggested?.transfers || [];
  if (transfers.length > 0) {
    const settleSection = createEl('div', { className: 'suggested-settlements pt-3 border-t mt-2' }, [
      createEl('h3', { className: 'text-sm font-semibold mb-2', textContent: 'Suggested settlements' })
    ]);

    const list = createEl('ul', { className: 'list list-compact' });
    for (const t of transfers) {
      const li = createEl('li', { className: 'list-item text-xs flex justify-between items-center py-1' }, [
        createEl('span', {}, [
          createEl('strong', { textContent: t.fromName }),
          ' owes ',
          createEl('strong', { textContent: t.toName })
        ]),
        createEl('span', { className: 'num font-semibold', textContent: formatINR(t.amount) })
      ]);
      list.appendChild(li);
    }
    settleSection.appendChild(list);

    settleSection.appendChild(createEl('div', { className: 'mt-2' }, [
      createEl('a', {
        className: 'text-xs link font-medium',
        href: `settlements.html?groupId=${encodeURIComponent(group.id)}`,
        textContent: 'Go to Settle up →'
      })
    ]));

    container.appendChild(settleSection);
  }
}

/**
 * Fetch and render all group details.
 * @param {string} groupId
 */
async function loadAndRenderGroup(groupId) {
  const [group, expenses, stats, suggested, user, cats] = await Promise.all([
    getGroup(groupId),
    listSharedExpenses(groupId),
    getGroupMemberStats(groupId),
    getSuggestedSettlements(groupId),
    currentUser(),
    listCategories()
  ]);

  categoryMap = new Map((cats || []).map((c) => [c.id, c]));

  const totalSpentPaise = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  renderHeader({ ...group, sharedExpensesCount: expenses?.length || 0 }, totalSpentPaise);
  renderExpensesTable(expenses || [], group, () => loadAndRenderGroup(groupId));
  renderBalancesCard(stats?.memberStats || {}, suggested, group, user);
}

/**
 * Initialize group-detail page.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  const url = new URL(window.location.href);
  const groupId = url.searchParams.get('id') || 'grp_goa';

  try {
    await loadAndRenderGroup(groupId);

    // Wire Add member form
    const addMemForm = qs('section[aria-labelledby="add-mem-title"] form');
    if (addMemForm) {
      const emailInput = qs('#m-email', addMemForm);
      const submitBtn = qs('button[type="submit"]', addMemForm);

      on(addMemForm, 'submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(addMemForm);

        const email = emailInput?.value.trim() || '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showFieldError(emailInput, 'Please enter a valid email address');
          focusFirstInvalid(addMemForm);
          return;
        }

        setButtonLoading(submitBtn, true, 'Adding...');

        try {
          await addMember(groupId, email);
          showToast(`Added ${email} to group!`, 'success');
          addMemForm.reset();
          await loadAndRenderGroup(groupId);
        } catch (err) {
          showFieldError(emailInput, err.message || 'Failed to add member');
          focusFirstInvalid(addMemForm);
        } finally {
          setButtonLoading(submitBtn, false);
        }
      });
    }

    // Wire Leave group form
    const leaveForm = qs('.stack form[action="groups.html"]');
    if (leaveForm) {
      on(leaveForm, 'submit', async (e) => {
        e.preventDefault();
        const confirmed = await confirmDialog({
          title: 'Leave group',
          message: 'Are you sure you want to leave this group? You can only leave once your balance is settled.',
          confirmText: 'Leave',
          danger: true
        });
        if (!confirmed) return;

        try {
          await leaveGroup(groupId);
          showToast('You have left the group', 'info');
          setTimeout(() => {
            window.location.href = 'groups.html';
          }, 500);
        } catch (err) {
          showToast(err.message || 'Cannot leave group until balance is settled', 'danger');
        }
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading group details:', err);
    clearElement(main);
    renderErrorState(main, `Group "${groupId}" could not be found.`, () => {
      window.location.href = 'groups.html';
    });
  } finally {
    setLoading(main, false);
  }
}
