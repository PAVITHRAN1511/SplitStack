/**
 * SplitStack Debt Calculation and Simplification Domain Module (Review 2, Step P5).
 * Implements authoritative net balance aggregation and the greedy minimum-cash-flow
 * debt simplification algorithm.
 *
 * All amounts are integer paise (1 Rupee = 100 paise).
 * No floating-point arithmetic is used for financial totals.
 *
 * Sign Convention:
 * - Positive balance (> 0): Creditor — member paid more than their share and is owed money by the group.
 * - Negative balance (< 0): Debtor — member paid less than their share and owes money to the group.
 * - Zero balance (= 0): Settled — member neither owes nor is owed money.
 *
 * Mathematical Invariant:
 * The sum of net balances across all members in a closed group is always strictly zero:
 *   Σ(netBalances) = Σ(paid) - Σ(shares) + Σ(settlementIn) - Σ(settlementOut) = 0
 */

/**
 * Calculate net member balances and per-member breakdown for a group.
 *
 * @param {Object} params
 * @param {Array<{userId: string, name?: string}|string>} params.members - Group members
 * @param {Array<Object>} [params.expenses=[]] - Group shared expenses
 * @param {Array<Object>} [params.settlements=[]] - Completed group settlements
 * @returns {{
 *   balances: Record<string, number>,
 *   memberStats: Record<string, { paid: number, share: number, net: number }>,
 *   netSum: number
 * }}
 */
export function calculateNetBalances({ members = [], expenses = [], settlements = [] }) {
  if (!Array.isArray(members)) {
    throw new Error('Members array is required');
  }

  const memberIds = members.map((m) => (typeof m === 'string' ? m : m.userId || m.id));
  const memberSet = new Set(memberIds);

  const balances = {};
  const memberStats = {};

  for (const uId of memberIds) {
    balances[uId] = 0;
    memberStats[uId] = { paid: 0, share: 0, net: 0 };
  }

  // 1. Aggregate shared expenses
  for (const exp of expenses) {
    const payerId = exp.paidBy;
    const amount = exp.amount;

    if (payerId && memberSet.has(payerId)) {
      memberStats[payerId].paid += amount;
      balances[payerId] += amount;
    }

    if (Array.isArray(exp.shares)) {
      for (const sh of exp.shares) {
        if (sh.userId && memberSet.has(sh.userId)) {
          const shareAmt = sh.amount || 0;
          memberStats[sh.userId].share += shareAmt;
          balances[sh.userId] -= shareAmt;
        }
      }
    }
  }

  // 2. Adjust for completed settlements
  // Payer paid debt -> their balance moves positively (towards 0 or positive)
  // Payee received debt -> their balance moves negatively (towards 0 or negative)
  for (const stl of settlements) {
    if (stl.status === 'completed' || !stl.status) {
      const amount = stl.amount || 0;
      if (stl.payerId && memberSet.has(stl.payerId)) {
        balances[stl.payerId] += amount;
      }
      if (stl.payeeId && memberSet.has(stl.payeeId)) {
        balances[stl.payeeId] -= amount;
      }
    }
  }

  // 3. Finalize net balances in stats
  for (const uId of memberIds) {
    memberStats[uId].net = balances[uId];
  }

  // 4. Verify zero-sum conservation invariant
  const netSum = Object.values(balances).reduce((acc, val) => acc + val, 0);
  if (Math.abs(netSum) > 0) {
    console.warn(`[SplitStack] Warning: non-zero net balance sum detected: ${netSum} paise`);
  }

  return { balances, memberStats, netSum };
}

/**
 * Greedy Minimum-Cash-Flow Debt Simplification Algorithm.
 *
 * Algorithm description:
 * 1. Filter out members with zero balance.
 * 2. Partition members into creditors (balance > 0) and debtors (balance < 0).
 * 3. Sort creditors descending by credit; sort debtors descending by absolute debt.
 * 4. In each step, match the largest outstanding debtor with the largest outstanding creditor.
 * 5. Create a transfer for min(debt, credit).
 * 6. Update both balances and re-match until all debts and credits are zero.
 *
 * Algorithmic note on optimality:
 * The greedy approach minimizes transaction count down to at most N - 1 transfers for N members
 * with O(N log N) time complexity. While it is optimal or near-optimal for practical expense sharing,
 * finding the globally minimum possible number of transactions across arbitrary subsets is an
 * NP-hard problem (equivalent to the subset-sum partition problem). The greedy simplification
 * algorithm is the established industry standard (used by Splitwise and similar applications).
 *
 * @param {Array<Object|string>} members - Group members
 * @param {Record<string, number>} balancesRecord - Net balance map { [userId]: paise }
 * @returns {{
 *   transfers: Array<{ from: string, fromName: string, to: string, toName: string, amount: number }>,
 *   pairwiseDebtsCount: number,
 *   optimizedCount: number,
 *   savedPercent: number
 * }}
 */
export function simplifyDebts(members = [], balancesRecord = {}) {
  const memberNameMap = new Map();
  for (const m of members) {
    const id = typeof m === 'string' ? m : m.userId || m.id;
    const name = typeof m === 'string' ? m : m.name || id;
    memberNameMap.set(id, name);
  }

  const creditors = [];
  const debtors = [];

  for (const [userId, bal] of Object.entries(balancesRecord)) {
    if (bal > 0) {
      creditors.push({
        userId,
        name: memberNameMap.get(userId) || userId,
        amount: bal
      });
    } else if (bal < 0) {
      debtors.push({
        userId,
        name: memberNameMap.get(userId) || userId,
        amount: -bal // Store absolute positive debt
      });
    }
  }

  // Active members with non-zero balance
  const activeMembersCount = creditors.length + debtors.length;
  const pairwiseDebtsCount = activeMembersCount > 1
    ? (activeMembersCount * (activeMembersCount - 1)) / 2
    : 0;

  // Stable sort descending by amount; tie-break deterministically on userId
  const sortDesc = (a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId);

  creditors.sort(sortDesc);
  debtors.sort(sortDesc);

  const transfers = [];

  while (creditors.length > 0 && debtors.length > 0) {
    const cred = creditors[0];
    const debt = debtors[0];

    const transferAmount = Math.min(cred.amount, debt.amount);

    if (transferAmount > 0) {
      transfers.push({
        from: debt.userId,
        fromName: debt.name,
        to: cred.userId,
        toName: cred.name,
        amount: transferAmount
      });
    }

    cred.amount -= transferAmount;
    debt.amount -= transferAmount;

    if (cred.amount === 0) {
      creditors.shift();
    }
    if (debt.amount === 0) {
      debtors.shift();
    }

    // Keep arrays sorted descending after deduction
    creditors.sort(sortDesc);
    debtors.sort(sortDesc);
  }

  const optimizedCount = transfers.length;
  const savedCount = Math.max(0, pairwiseDebtsCount - optimizedCount);
  const savedPercent = pairwiseDebtsCount > 0
    ? Math.round((savedCount / pairwiseDebtsCount) * 100)
    : 0;

  return {
    transfers,
    pairwiseDebtsCount,
    optimizedCount,
    savedPercent
  };
}
