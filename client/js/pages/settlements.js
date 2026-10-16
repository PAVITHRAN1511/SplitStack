/**
 * Settlements page module (Review 2, Step P3).
 * Connects settlements.html to api.js to render debt simplification statistics,
 * optimised transfer payment plan, member net balances, and settlement history.
 */

import { getGroup, getGroupBalances, getSettlements, recordSettlement } from '../data/api.js';
import { qs, createEl, on } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { getInitials } from '../ui/user.js';
import { setLoading, clearElement, renderEmptyState, renderErrorState } from '../core/render.js';

const AVATAR_COLORS = ['#0ea5e9', '#db2777', '#d97706', '#059669', '#7c3aed', '#e11d48'];

/**
 * Compute greedy debt simplification transfers between creditors and debtors.
 * @param {Array} members
 * @param {Record<string, number>} balancesRecord
 * @returns {Array} List of transfers { from, fromName, to, toName, amount }
 */
function computeTransfers(members, balancesRecord) {
  const creditors = [];
  const debtors = [];

  for (const m of members) {
    const bal = balancesRecord[m.userId] || 0;
    if (bal > 0) {
      creditors.push({ userId: m.userId, name: m.name, amount: bal });
    } else if (bal < 0) {
      debtors.push({ userId: m.userId, name: m.name, amount: -bal });
    }
  }

  // Sort descending by amount
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const cred = creditors[cIdx];
    const debt = debtors[dIdx];
    const settledAmount = Math.min(cred.amount, debt.amount);

    if (settledAmount > 0) {
      transfers.push({
        from: debt.userId,
        fromName: debt.name,
        to: cred.userId,
        toName: cred.name,
        amount: settledAmount
      });
    }

    cred.amount -= settledAmount;
    debt.amount -= settledAmount;

    if (cred.amount <= 0) cIdx++;
    if (debt.amount <= 0) dIdx++;
  }

  return transfers;
}

/**
 * Render debt optimization KPI cards.
 * @param {number} pairwiseCount
 * @param {number} optimizedCount
 * @param {number} savedPercent
 */
function renderStats(pairwiseCount, optimizedCount, savedPercent) {
  const pairwiseVal = qs('.efficiency .tone-danger .stat-value');
  if (pairwiseVal) pairwiseVal.textContent = String(pairwiseCount);

  const optVal = qs('.efficiency .tone-success .stat-value');
  if (optVal) optVal.textContent = String(optimizedCount);

  const savedVal = qs('.efficiency .tone-primary .stat-value');
  if (savedVal) savedVal.textContent = `${savedPercent}%`;
}

/**
 * Render payment plan transfers list.
 * @param {Array} transfers
 * @param {string} groupId
 * @param {() => void} onRefresh
 */
function renderPaymentPlan(transfers, groupId, onRefresh) {
  const container = qs('section[aria-labelledby="plan-title"] .card-body');
  if (!container) return;

  clearElement(container);

  if (transfers.length === 0) {
    renderEmptyState(container, {
      icon: 'fa-handshake',
      title: 'All debts settled!',
      message: 'No open balances remain in this group.'
    });
    return;
  }

  for (const t of transfers) {
    const payerName = t.fromName || t.from;
    const payeeName = t.toName || t.to;

    const markPaidBtn = createEl('button', {
      className: 'btn btn-success btn-sm',
      type: 'button'
    }, [
      createEl('i', { className: 'fa-solid fa-check', 'aria-hidden': 'true' }),
      'Mark paid'
    ]);

    on(markPaidBtn, 'click', async () => {
      try {
        await recordSettlement(groupId, {
          payerId: t.from,
          payeeId: t.to,
          amount: t.amount
        });
        onRefresh();
      } catch (err) {
        console.warn('[SplitStack] Failed to record settlement:', err);
      }
    });

    const transferDiv = createEl('div', { className: 'transfer' }, [
      createEl('div', { className: 'party' }, [
        createEl('span', {
          className: 'avatar',
          style: { '--avatar': AVATAR_COLORS[2] },
          title: payerName,
          'aria-hidden': 'true',
          textContent: getInitials(payerName)
        }),
        createEl('span', { textContent: payerName })
      ]),
      createEl('div', { className: 'arrow' }, [
        createEl('strong', { className: 'num', textContent: formatINR(t.amount) }),
        createEl('i', { className: 'fa-solid fa-arrow-right-long', 'aria-hidden': 'true' }),
        createEl('span', { className: 'visually-hidden', textContent: 'pays' })
      ]),
      createEl('div', { className: 'party' }, [
        createEl('span', {
          className: 'avatar',
          style: { '--avatar': AVATAR_COLORS[1] },
          title: payeeName,
          'aria-hidden': 'true',
          textContent: getInitials(payeeName)
        }),
        createEl('span', { textContent: payeeName })
      ]),
      createEl('div', {}, [markPaidBtn])
    ]);

    container.appendChild(transferDiv);
  }
}

/**
 * Render net balances sidebar list.
 * @param {Array} members
 * @param {Record<string, number>} balancesRecord
 */
function renderNetBalances(members, balancesRecord) {
  const ul = qs('section[aria-labelledby="net-title"] ul.list');
  if (!ul) return;

  clearElement(ul);

  for (const m of members) {
    const net = balancesRecord[m.userId] || 0;
    const balanceSpan = createEl('span', {
      className: net > 0 ? 'balance-pos num' : net < 0 ? 'balance-neg num' : 'balance-zero',
      textContent: net > 0
        ? `+${formatINR(net)}`
        : net < 0
        ? `−${formatINR(Math.abs(net))}`
        : '₹0'
    });

    const li = createEl('li', { className: 'list-item' }, [
      createEl('span', {
        className: 'avatar sm',
        style: { '--avatar': AVATAR_COLORS[3] },
        title: m.name,
        'aria-hidden': 'true',
        textContent: getInitials(m.name)
      }),
      createEl('span', { className: 'grow list-title', textContent: m.name }),
      balanceSpan
    ]);

    ul.appendChild(li);
  }
}

/**
 * Render settlement history.
 * @param {Array} history
 * @param {Map<string, string>} memberNameMap
 */
function renderHistory(history, memberNameMap) {
  const container = qs('section[aria-labelledby="hist-title"] .card-body');
  if (!container) return;

  clearElement(container);

  if (!history || history.length === 0) {
    renderEmptyState(container, {
      icon: 'fa-handshake',
      title: 'No settlements yet',
      message: 'Payments you mark as paid appear here.'
    });
    return;
  }

  const ul = createEl('ul', { className: 'list' });
  for (const h of history) {
    const payer = memberNameMap.get(h.payerId) || h.payerId;
    const payee = memberNameMap.get(h.payeeId) || h.payeeId;

    const li = createEl('li', { className: 'list-item' }, [
      createEl('span', { className: 'grow' }, [
        createEl('span', { className: 'list-title', textContent: `${payer} paid ${payee}` }),
        createEl('span', { className: 'list-sub', textContent: formatINR(h.amount) })
      ]),
      createEl('span', { className: 'badge badge-success', textContent: 'Completed' })
    ]);
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

/**
 * Load and render settlements page content.
 */
async function loadSettlements() {
  const main = qs('main#main');
  const url = new URL(window.location.href);
  const groupId = url.searchParams.get('groupId') || 'grp_goa';

  setLoading(main, true);

  try {
    const [group, balances, history] = await Promise.all([
      getGroup(groupId),
      getGroupBalances(groupId),
      getSettlements(groupId)
    ]);

    const memberNameMap = new Map((group.members || []).map((m) => [m.userId, m.name]));

    // Update breadcrumb
    const groupLink = qs('.breadcrumbs li:nth-child(2) a');
    if (groupLink && group) {
      groupLink.textContent = group.name;
      groupLink.href = `group-detail.html?id=${encodeURIComponent(group.id)}`;
    }

    const memberCount = group.members?.length || 1;
    const pairwiseDebtsCount = memberCount > 1 ? (memberCount * (memberCount - 1)) / 2 : 0;
    const transfers = computeTransfers(group.members || [], balances || {});
    const optimizedCount = transfers.length;
    const savedPercent = pairwiseDebtsCount > 0
      ? Math.max(0, Math.round(((pairwiseDebtsCount - optimizedCount) / pairwiseDebtsCount) * 100))
      : 0;

    renderStats(pairwiseDebtsCount, optimizedCount, savedPercent);
    renderPaymentPlan(transfers, groupId, loadSettlements);
    renderNetBalances(group.members || [], balances || {});
    renderHistory(history || [], memberNameMap);
  } catch (err) {
    console.warn('[SplitStack] Error loading settlements:', err);
    clearElement(main);
    renderErrorState(main, `Could not load settlements for group "${groupId}".`, () => {
      window.location.href = 'groups.html';
    });
  } finally {
    setLoading(main, false);
  }
}

/**
 * Initialize settlements page.
 */
export async function init() {
  await loadSettlements();
}
