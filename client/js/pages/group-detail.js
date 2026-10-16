/**
 * Group detail page module (Review 2, Step P3).
 * Connects group-detail.html to api.js to render group info, shared expenses,
 * and individual member net balances.
 */

import { getGroup, listSharedExpenses, getGroupBalances, currentUser, listCategories } from '../data/api.js';
import { qs, createEl } from '../core/dom.js';
import { formatINR, formatDate } from '../core/format.js';
import { getInitials } from '../ui/user.js';
import { setLoading, clearElement, renderEmptyState, renderErrorState } from '../core/render.js';

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
    p.textContent = `${group.description || 'Shared group'} · ${group.members?.length || 1} members · ${formatINR(totalSpentPaise)} spent`;
  }

  // Update action links with group ID
  const settleUpBtn = qs('.page-actions a.btn-secondary');
  if (settleUpBtn) settleUpBtn.href = `settlements.html?groupId=${encodeURIComponent(group.id)}`;

  const addExpBtn = qs('.page-actions a.btn-primary');
  if (addExpBtn) addExpBtn.href = `shared-expense-form.html?groupId=${encodeURIComponent(group.id)}`;

  const badge = qs('section[aria-labelledby="gexp-title"] .card-header .badge');
  if (badge) badge.textContent = `${group.sharedExpensesCount || 0} bills`;
}

/**
 * Render shared expenses table.
 * @param {Array} expenses
 * @param {Object} group
 */
function renderExpensesTable(expenses, group) {
  const tbody = qs('section[aria-labelledby="gexp-title"] tbody');
  if (!tbody) return;

  clearElement(tbody);

  if (expenses.length === 0) {
    const tr = createEl('tr', {}, [
      createEl('td', { colspan: '5', className: 'p-0' }, [
        renderEmptyState(createEl('div'), {
          icon: 'fa-receipt',
          title: 'No shared expenses yet',
          message: 'Add group expenses to start splitting costs.',
          actionText: 'Add expense',
          onAction: () => {
            window.location.href = `shared-expense-form.html?groupId=${encodeURIComponent(group.id)}`;
          }
        })
      ])
    ]);
    tbody.appendChild(tr);
    return;
  }

  const memberMap = new Map((group.members || []).map((m) => [m.userId, m]));

  for (const exp of expenses) {
    const payer = memberMap.get(exp.paidBy) || { name: exp.paidBy || 'Member' };
    const cat = categoryMap.get(exp.categoryId) || { name: exp.categoryId || 'General' };

    const splitCount = exp.shares?.length || group.members?.length || 1;
    const splitLabel = `${exp.splitType === 'custom' ? 'Custom' : 'Equal'} · ${splitCount} people`;

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
      createEl('td', { 'data-label': 'Actions', className: 'end' }, [
        createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [
          createEl('button', {
            className: 'icon-btn sm danger',
            type: 'submit',
            'aria-label': `Delete ${exp.title}`
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
 * Render group member balances card.
 * @param {Record<string, number>} balances
 * @param {Array} expenses
 * @param {Object} group
 * @param {Object} currentUserData
 */
function renderBalancesCard(balances, expenses, group, currentUserData) {
  const container = qs('section[aria-labelledby="bal-title"] .card-body.stack');
  if (!container) return;

  clearElement(container);

  for (const member of group.members || []) {
    const isMe = member.userId === currentUserData.id;
    const isAdmin = member.role === 'admin';

    const netPaise = (balances && typeof balances === 'object') ? (balances[member.userId] || 0) : 0;
    const paidPaise = (expenses || []).filter((e) => e.paidBy === member.userId).reduce((s, e) => s + (e.amount || 0), 0);
    const sharePaise = paidPaise - netPaise;

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
    const [group, expenses, balances, user, cats] = await Promise.all([
      getGroup(groupId),
      listSharedExpenses(groupId),
      getGroupBalances(groupId),
      currentUser(),
      listCategories()
    ]);

    categoryMap = new Map((cats || []).map((c) => [c.id, c]));

    const totalSpentPaise = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    renderHeader({ ...group, sharedExpensesCount: expenses?.length || 0 }, totalSpentPaise);
    renderExpensesTable(expenses || [], group);
    renderBalancesCard(balances || {}, expenses || [], group, user);
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
