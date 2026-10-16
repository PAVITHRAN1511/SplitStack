/**
 * Groups page module (Review 2, Step P3).
 * Connects groups.html to api.js to render group cards, member avatars,
 * total spent, user net balances, and settle-up status.
 */

import { listGroups, currentUser, getGroupBalances, listSharedExpenses } from '../data/api.js';
import { qs, createEl } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { getInitials } from '../ui/user.js';
import { setLoading, clearElement, renderEmptyState } from '../core/render.js';

const AVATAR_COLORS = ['#0ea5e9', '#db2777', '#d97706', '#059669', '#7c3aed', '#e11d48'];

/**
 * Render group cards inside grid.
 * @param {Array} groups
 * @param {Object} user
 */
async function renderGroupCards(groups, user) {
  const container = qs('main#main .grid.grid-3');
  if (!container) return;

  clearElement(container);

  if (groups.length === 0) {
    renderEmptyState(container, {
      icon: 'fa-users',
      title: 'No groups yet',
      message: 'Create a group for trips, flatmates, or shared team lunches.',
      actionText: 'New group',
      onAction: () => {
        window.location.href = 'group-create.html';
      }
    });
    return;
  }

  let totalNetOwedPaise = 0;

  for (const g of groups) {
    let balances = {};
    let sharedExpenses = [];

    try {
      [balances, sharedExpenses] = await Promise.all([
        getGroupBalances(g.id),
        listSharedExpenses(g.id)
      ]);
    } catch {
      // Ignored
    }

    const totalSpentPaise = (sharedExpenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    const balancesObj = balances && typeof balances === 'object' ? balances : {};
    const myBalance = typeof balancesObj[user.id] === 'number' ? balancesObj[user.id] : 0;
    totalNetOwedPaise += myBalance;

    const hasOpenDebts = Object.values(balancesObj).some((val) => Math.abs(val) > 0);

    // Build avatars
    const avatarEls = (g.members || []).map((m, idx) => {
      const color = m.userId === user.id ? 'var(--primary)' : AVATAR_COLORS[idx % AVATAR_COLORS.length];
      return createEl('span', {
        className: 'avatar sm',
        style: { '--avatar': color },
        title: m.name || m.email || 'Member',
        'aria-hidden': 'true',
        textContent: getInitials(m.name || m.email)
      });
    });

    const balanceSpan = createEl('span', {
      className: myBalance > 0 ? 'balance-pos num' : myBalance < 0 ? 'balance-neg num' : 'balance-zero',
      textContent: myBalance > 0
        ? `+${formatINR(myBalance)}`
        : myBalance < 0
        ? `−${formatINR(Math.abs(myBalance))}`
        : 'Settled'
    });

    const statusBadge = createEl('span', {
      className: `badge ${hasOpenDebts ? 'badge-warning' : 'badge-success'}`,
      textContent: hasOpenDebts ? 'Open debts' : 'All settled'
    });

    const card = createEl('article', { className: 'card group-card' }, [
      createEl('div', { className: 'card-header' }, [
        createEl('div', { className: 'flex items-center gap-3' }, [
          createEl('span', { className: 'cat-icon', style: { '--cat': 'var(--cat-travel)' } }, [
            createEl('i', { className: 'fa-solid fa-users', 'aria-hidden': 'true' })
          ]),
          createEl('div', {}, [
            createEl('h2', { className: 'card-title', textContent: g.name }),
            createEl('p', { className: 'text-xs', textContent: g.description || `${g.members?.length || 1} members` })
          ])
        ])
      ]),
      createEl('div', { className: 'card-body' }, [
        createEl('div', { className: 'avatar-stack' }, avatarEls),
        createEl('dl', { className: 'group-stats' }, [
          createEl('div', {}, [
            createEl('dt', { textContent: 'Members' }),
            createEl('dd', { textContent: String(g.members?.length || 1) })
          ]),
          createEl('div', {}, [
            createEl('dt', { textContent: 'Total spent' }),
            createEl('dd', { className: 'num', textContent: formatINR(totalSpentPaise) })
          ]),
          createEl('div', {}, [
            createEl('dt', { textContent: 'Your balance' }),
            createEl('dd', {}, [balanceSpan])
          ]),
          createEl('div', {}, [
            createEl('dt', { textContent: 'Status' }),
            createEl('dd', {}, [statusBadge])
          ])
        ])
      ]),
      createEl('div', { className: 'card-footer' }, [
        createEl('a', {
          className: 'btn btn-secondary btn-sm',
          href: `group-detail.html?id=${encodeURIComponent(g.id)}`,
          textContent: 'Open group'
        }),
        createEl('a', {
          className: 'btn btn-ghost btn-sm',
          href: `settlements.html?groupId=${encodeURIComponent(g.id)}`,
          textContent: 'Settle up'
        })
      ])
    ]);

    container.appendChild(card);
  }

  // Update header summary paragraph
  const headerP = qs('.page-header p');
  if (headerP) {
    if (totalNetOwedPaise > 0) {
      headerP.innerHTML = '';
      headerP.append('Trips, flatmates and teams. Overall, you are owed ');
      headerP.appendChild(createEl('strong', { className: 'text-success', textContent: formatINR(totalNetOwedPaise) }));
      headerP.append('.');
    } else if (totalNetOwedPaise < 0) {
      headerP.innerHTML = '';
      headerP.append('Trips, flatmates and teams. Overall, you owe ');
      headerP.appendChild(createEl('strong', { className: 'text-danger', textContent: formatINR(Math.abs(totalNetOwedPaise)) }));
      headerP.append('.');
    } else {
      headerP.textContent = 'Trips, flatmates and teams. All group balances are settled.';
    }
  }
}

/**
 * Initialize groups page.
 */
export async function init() {
  const container = qs('main#main .grid.grid-3');
  setLoading(container, true);

  try {
    const [groups, user] = await Promise.all([
      listGroups(),
      currentUser()
    ]);

    await renderGroupCards(groups || [], user);
  } catch (err) {
    console.warn('[SplitStack] Error loading groups:', err);
  } finally {
    setLoading(container, false);
  }
}
