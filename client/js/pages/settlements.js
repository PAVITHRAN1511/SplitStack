/**
 * Settlements page module (Review 2, Steps P3 & P5).
 * Connects settlements.html to api.js to render debt simplification statistics,
 * canonical payment plan from greedy minimum-cash-flow, member net balances,
 * and settlement history with confirmation and deletion.
 */

import {
  getGroup,
  getGroupBalances,
  getSettlements,
  recordSettlement,
  removeSettlement,
  getSuggestedSettlements
} from '../data/api.js';
import { qs, createEl, on } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { getInitials } from '../ui/user.js';
import { setLoading, clearElement, renderEmptyState, renderErrorState } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';

const AVATAR_COLORS = ['#0ea5e9', '#db2777', '#d97706', '#059669', '#7c3aed', '#e11d48'];

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
 * @param {Array<{ from: string, fromName: string, to: string, toName: string, amount: number }>} transfers
 * @param {string} groupId
 * @param {() => Promise<void>} onRefresh
 */
function renderPaymentPlan(transfers, groupId, onRefresh) {
  const container = qs('section[aria-labelledby="plan-title"] .card-body');
  if (!container) return;

  clearElement(container);

  if (!transfers || transfers.length === 0) {
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
      const confirmed = await confirmDialog({
        title: 'Record settlement payment',
        message: `Confirm that ${payerName} paid ${formatINR(t.amount)} to ${payeeName}?`,
        confirmText: 'Record payment',
        confirmClass: 'btn-success'
      });
      if (!confirmed) return;

      markPaidBtn.disabled = true;
      markPaidBtn.setAttribute('aria-busy', 'true');
      const originalHtml = markPaidBtn.innerHTML;
      markPaidBtn.textContent = 'Recording...';

      try {
        await recordSettlement(groupId, {
          payerId: t.from,
          payeeId: t.to,
          amount: t.amount
        });
        showToast(`Settlement recorded: ${payerName} paid ${payeeName}`, 'success');
        await onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to record settlement', 'danger');
        markPaidBtn.disabled = false;
        markPaidBtn.removeAttribute('aria-busy');
        markPaidBtn.innerHTML = originalHtml;
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
 * @param {() => Promise<void>} onRefresh
 */
function renderHistory(history, memberNameMap, onRefresh, groupId) {
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

    const delBtn = createEl('button', {
      className: 'icon-btn sm danger',
      type: 'button',
      'aria-label': `Delete settlement: ${payer} paid ${payee}`
    }, [
      createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
    ]);

    on(delBtn, 'click', async () => {
      const confirmed = await confirmDialog({
        title: 'Delete settlement',
        message: `Remove this settlement of ${formatINR(h.amount)} from ${payer} to ${payee}? This will recalculate group balances.`,
        confirmText: 'Delete'
      });
      if (!confirmed) return;
      try {
        await removeSettlement(groupId || h.groupId, h.id);
        showToast('Settlement removed', 'info');
        await onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to remove settlement', 'danger');
      }
    });

    const li = createEl('li', { className: 'list-item' }, [
      createEl('span', { className: 'grow' }, [
        createEl('span', { className: 'list-title', textContent: `${payer} paid ${payee}` }),
        createEl('span', { className: 'list-sub', textContent: formatINR(h.amount) })
      ]),
      createEl('span', { className: 'badge badge-success mr-2', textContent: 'Completed' }),
      delBtn
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
    const [group, balances, history, suggested] = await Promise.all([
      getGroup(groupId),
      getGroupBalances(groupId),
      getSettlements(groupId),
      getSuggestedSettlements(groupId)
    ]);

    const memberNameMap = new Map((group.members || []).map((m) => [m.userId, m.name]));

    // Update breadcrumb
    const groupLink = qs('.breadcrumbs li:nth-child(2) a');
    if (groupLink && group) {
      groupLink.textContent = group.name;
      groupLink.href = `group-detail.html?id=${encodeURIComponent(group.id)}`;
    }

    renderStats(
      suggested.pairwiseDebtsCount,
      suggested.optimizedCount,
      suggested.savedPercent
    );
    renderPaymentPlan(suggested.transfers, groupId, loadSettlements);
    renderNetBalances(group.members || [], balances || {});
    renderHistory(history || [], memberNameMap, loadSettlements, groupId);
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
