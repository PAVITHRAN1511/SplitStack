/**
 * SplitStack Automated Tests — Step P5: Group Splitting and Debt Simplification.
 * Tests domain modules splits.js, settle.js, and api.js integration using Node.js test runner.
 * Run with: node --test tests/client/splits-settle.test.mjs
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock localStorage if running in Node environment
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MockLocalStorage();
}

// Import domain modules and data API
const {
  calculateEqualSplit,
  validateCustomShares
} = await import('../../client/js/domain/splits.js');

const {
  calculateNetBalances,
  simplifyDebts
} = await import('../../client/js/domain/settle.js');

const api = await import('../../client/js/data/api.js');

describe('Step P5: Group Splitting and Debt Simplification', () => {
  beforeEach(async () => {
    await api.resetDemoData();
  });

  // ===========================================================================
  // 1. SPLIT CALCULATIONS
  // ===========================================================================
  describe('1. Split calculations (domain & API)', () => {
    test('equal splits where amount divides evenly into whole paise', () => {
      const shares = calculateEqualSplit({
        amount: 300000, // ₹3,000.00
        participants: ['u_priya', 'u_arjun', 'u_kavya'],
        payerId: 'u_priya'
      });

      assert.equal(shares.length, 3);
      assert.deepEqual(shares, [
        { userId: 'u_priya', amount: 100000 },
        { userId: 'u_arjun', amount: 100000 },
        { userId: 'u_kavya', amount: 100000 }
      ]);
      const sum = shares.reduce((acc, s) => acc + s.amount, 0);
      assert.equal(sum, 300000);
    });

    test('equal splits with remainder paise assigns remainder to payer if participant', () => {
      // 1000 paise (₹10.00) among 3 members: base = 333, remainder = 1 paisa
      // Payer is 'u_priya', so priya receives 334, arjun receives 333, kavya receives 333
      const shares = calculateEqualSplit({
        amount: 1000,
        participants: ['u_priya', 'u_arjun', 'u_kavya'],
        payerId: 'u_priya'
      });

      assert.deepEqual(shares, [
        { userId: 'u_priya', amount: 334 },
        { userId: 'u_arjun', amount: 333 },
        { userId: 'u_kavya', amount: 333 }
      ]);

      const sum = shares.reduce((acc, s) => acc + s.amount, 0);
      assert.equal(sum, 1000);
    });

    test('equal splits with remainder paise assigns remainder to first participant if payer is not participating', () => {
      // 1000 paise among 3 members, payer is non-participating 'u_rohan'
      const shares = calculateEqualSplit({
        amount: 1000,
        participants: ['u_priya', 'u_arjun', 'u_kavya'],
        payerId: 'u_rohan'
      });

      assert.deepEqual(shares, [
        { userId: 'u_priya', amount: 334 },
        { userId: 'u_arjun', amount: 333 },
        { userId: 'u_kavya', amount: 333 }
      ]);

      const sum = shares.reduce((acc, s) => acc + s.amount, 0);
      assert.equal(sum, 1000);
    });

    test('custom splits with valid shares summing exactly to total amount', () => {
      const result = validateCustomShares({
        amount: 500000, // ₹5,000
        shares: [
          { userId: 'u_priya', amount: 200000 },
          { userId: 'u_arjun', amount: 150000 },
          { userId: 'u_kavya', amount: 150000 }
        ],
        allowedMemberIds: ['u_priya', 'u_arjun', 'u_kavya', 'u_rohan']
      });

      assert.equal(result.isValid, true);
      assert.equal(result.totalAssigned, 500000);
      assert.equal(result.remaining, 0);
      assert.equal(result.error, null);
    });

    test('custom splits rejecting shares that under-allocate or over-allocate total amount', () => {
      // Under-allocated: amount 500000 paise (₹5,000), allocated 300000 paise (₹3,000)
      const underRes = validateCustomShares({
        amount: 500000,
        shares: [
          { userId: 'u_priya', amount: 200000 },
          { userId: 'u_arjun', amount: 100000 }
        ]
      });
      assert.equal(underRes.isValid, false);
      assert.equal(underRes.remaining, 200000);
      assert.ok(underRes.error.includes('Custom shares sum to ₹3000.00, but total is ₹5000.00'));

      // Over-allocated: amount 500000 paise (₹5,000), allocated 600000 paise (₹6,000)
      const overRes = validateCustomShares({
        amount: 500000,
        shares: [
          { userId: 'u_priya', amount: 300000 },
          { userId: 'u_arjun', amount: 300000 }
        ]
      });
      assert.equal(overRes.isValid, false);
      assert.equal(overRes.remaining, -100000);
      assert.ok(overRes.error.includes('Custom shares sum to ₹6000.00, but total is ₹5000.00'));
    });

    test('rejects duplicate or invalid participant IDs in splits', () => {
      assert.throws(
        () => {
          calculateEqualSplit({
            amount: 1000,
            participants: ['u_priya', 'u_priya']
          });
        },
        /Duplicate participant "u_priya"/
      );

      assert.throws(
        () => {
          calculateEqualSplit({
            amount: 1000,
            participants: []
          });
        },
        /At least one participant is required/
      );
    });

    test('rejects out-of-group participants in custom split validation', () => {
      const res = validateCustomShares({
        amount: 2000,
        shares: [
          { userId: 'u_priya', amount: 1000 },
          { userId: 'intruder_user_999', amount: 1000 }
        ],
        allowedMemberIds: ['u_priya', 'u_arjun']
      });

      assert.equal(res.isValid, false);
      assert.ok(res.error.includes('intruder_user_999'));
    });

    test('rejects invalid, zero, or non-integer amounts in split calculation', () => {
      assert.throws(() => calculateEqualSplit({ amount: 0, participants: ['u_priya'] }), /positive integer/);
      assert.throws(() => calculateEqualSplit({ amount: -500, participants: ['u_priya'] }), /positive integer/);
      assert.throws(() => calculateEqualSplit({ amount: 100.5, participants: ['u_priya'] }), /positive integer/);
      assert.throws(() => calculateEqualSplit({ amount: '500', participants: ['u_priya'] }), /positive integer/);
    });

    test('API createSharedExpense enforces payer membership and participants validation', async () => {
      // Rejects non-member payer
      await assert.rejects(
        async () => {
          await api.createSharedExpense('grp_goa', {
            title: 'Unauthorized expense',
            amount: 10000,
            paidBy: 'non_member_user_xyz'
          });
        },
        (err) => err.status === 400 && err.message.includes('Payer must be a member')
      );

      // Rejects out-of-group participant in equal split
      await assert.rejects(
        async () => {
          await api.createSharedExpense('grp_goa', {
            title: 'Invalid participants',
            amount: 10000,
            splitType: 'equal',
            shares: [{ userId: 'u_priya' }, { userId: 'intruder_user_xyz' }]
          });
        },
        (err) => err.status === 400 && err.message.includes('not a member of this group')
      );
    });
  });

  // ===========================================================================
  // 2. BALANCE CALCULATIONS
  // ===========================================================================
  describe('2. Balance calculations and zero-sum invariant', () => {
    test('single payer and several equal participants', () => {
      const members = [{ userId: 'A' }, { userId: 'B' }, { userId: 'C' }];
      const expenses = [
        {
          id: 'exp1',
          paidBy: 'A',
          amount: 3000,
          shares: [
            { userId: 'A', amount: 1000 },
            { userId: 'B', amount: 1000 },
            { userId: 'C', amount: 1000 }
          ]
        }
      ];

      const { balances, memberStats, netSum } = calculateNetBalances({ members, expenses });

      assert.equal(balances['A'], 2000);  // Creditor: paid 3000, share 1000 -> +2000
      assert.equal(balances['B'], -1000); // Debtor: paid 0, share 1000 -> -1000
      assert.equal(balances['C'], -1000); // Debtor: paid 0, share 1000 -> -1000
      assert.equal(netSum, 0);            // Strict zero-sum invariant

      assert.deepEqual(memberStats['A'], { paid: 3000, share: 1000, net: 2000 });
      assert.deepEqual(memberStats['B'], { paid: 0, share: 1000, net: -1000 });
      assert.deepEqual(memberStats['C'], { paid: 0, share: 1000, net: -1000 });
    });

    test('several payers in the same group with mixed debtor/creditor balances', () => {
      const members = [{ userId: 'A' }, { userId: 'B' }, { userId: 'C' }, { userId: 'D' }];
      const expenses = [
        // A pays 4000 split equally among A, B, C, D (1000 each)
        {
          id: 'exp1',
          paidBy: 'A',
          amount: 4000,
          shares: [
            { userId: 'A', amount: 1000 },
            { userId: 'B', amount: 1000 },
            { userId: 'C', amount: 1000 },
            { userId: 'D', amount: 1000 }
          ]
        },
        // B pays 2000 split equally between B and C (1000 each)
        {
          id: 'exp2',
          paidBy: 'B',
          amount: 2000,
          shares: [
            { userId: 'B', amount: 1000 },
            { userId: 'C', amount: 1000 }
          ]
        }
      ];

      const { balances, netSum } = calculateNetBalances({ members, expenses });
      // A: paid 4000, share 1000 -> +3000
      // B: paid 2000, share 2000 -> 0 (zero-balance member)
      // C: paid 0, share 2000 -> -2000
      // D: paid 0, share 1000 -> -1000
      assert.equal(balances['A'], 3000);
      assert.equal(balances['B'], 0);
      assert.equal(balances['C'], -2000);
      assert.equal(balances['D'], -1000);
      assert.equal(netSum, 0);
    });

    test('groups without shared expenses return clean 0 balances for all members', () => {
      const members = [{ userId: 'X' }, { userId: 'Y' }];
      const { balances, netSum } = calculateNetBalances({ members, expenses: [] });
      assert.equal(balances['X'], 0);
      assert.equal(balances['Y'], 0);
      assert.equal(netSum, 0);
    });

    test('edited or deleted shared expenses update balances consistently', async () => {
      // 1. Initial Goa Trip balances from seed data
      const initialBalances = await api.getGroupBalances('grp_goa');
      assert.equal(initialBalances['u_priya'], 710000);
      assert.equal(initialBalances['u_rohan'], -210000);
      assert.equal(initialBalances['u_arjun'], -370000);
      assert.equal(initialBalances['u_kavya'], -130000);

      // 2. Add a new expense paid by Rohan (400000 paise, split 100000 to each 4 members)
      const newExp = await api.createSharedExpense('grp_goa', {
        title: 'Snacks & Fuel',
        amount: 400000,
        paidBy: 'u_rohan',
        splitType: 'equal'
      });

      const updatedBalances = await api.getGroupBalances('grp_goa');
      // Rohan paid 400000, share 100000 -> net change +300000 (-210000 + 300000 = +90000)
      assert.equal(updatedBalances['u_rohan'], 90000);
      // Priya, Arjun, Kavya shares each +100000 (net decrease 100000)
      assert.equal(updatedBalances['u_priya'], 610000);
      assert.equal(updatedBalances['u_arjun'], -470000);
      assert.equal(updatedBalances['u_kavya'], -230000);

      // Verify zero-sum invariant holds
      const sumAfterAdd = Object.values(updatedBalances).reduce((a, b) => a + b, 0);
      assert.equal(sumAfterAdd, 0);

      // 3. Delete the expense
      await api.removeSharedExpense(newExp.id);
      const revertedBalances = await api.getGroupBalances('grp_goa');
      assert.deepEqual(revertedBalances, initialBalances);
    });

    test('existing settlements reduce outstanding balances while keeping expense totals unchanged', () => {
      const members = [{ userId: 'A' }, { userId: 'B' }];
      const expenses = [
        {
          id: 'exp1',
          paidBy: 'A',
          amount: 2000,
          shares: [
            { userId: 'A', amount: 1000 },
            { userId: 'B', amount: 1000 }
          ]
        }
      ];
      // B owes A 1000. B pays A 600.
      const settlements = [
        {
          id: 'stl1',
          payerId: 'B',
          payeeId: 'A',
          amount: 600,
          status: 'completed'
        }
      ];

      const { balances, memberStats, netSum } = calculateNetBalances({ members, expenses, settlements });
      // A: was +1000, received 600 -> now owed +400
      // B: was -1000, paid 600 -> now owes -400
      assert.equal(balances['A'], 400);
      assert.equal(balances['B'], -400);
      assert.equal(netSum, 0);

      // Member stats: original expense paid and share remain strictly unchanged!
      assert.equal(memberStats['A'].paid, 2000);
      assert.equal(memberStats['A'].share, 1000);
      assert.equal(memberStats['B'].paid, 0);
      assert.equal(memberStats['B'].share, 1000);
    });
  });

  // ===========================================================================
  // 3. DEBT SIMPLIFICATION
  // ===========================================================================
  describe('3. Minimum-cash-flow debt simplification', () => {
    test('single debtor and single creditor produces exactly 1 transfer', () => {
      const members = [{ userId: 'u_debtor', name: 'Debtor' }, { userId: 'u_creditor', name: 'Creditor' }];
      const balances = { u_debtor: -5000, u_creditor: 5000 };

      const { transfers, optimizedCount } = simplifyDebts(members, balances);
      assert.equal(optimizedCount, 1);
      assert.deepEqual(transfers, [
        { from: 'u_debtor', fromName: 'Debtor', to: 'u_creditor', toName: 'Creditor', amount: 5000 }
      ]);
    });

    test('Goa Trip scenario simplification produces exactly 3 transfers', () => {
      // Net balances: Rohan: -4900, Arjun: -2500, Priya: +1700, Kavya: +5700
      const members = [
        { userId: 'u_priya', name: 'Priya Raman' },
        { userId: 'u_arjun', name: 'Arjun Mehta' },
        { userId: 'u_kavya', name: 'Kavya Iyer' },
        { userId: 'u_rohan', name: 'Rohan Das' }
      ];
      const balances = {
        u_priya: 170000,
        u_arjun: -250000,
        u_kavya: 570000,
        u_rohan: -490000
      };

      const { transfers, pairwiseDebtsCount, optimizedCount, savedPercent } = simplifyDebts(members, balances);

      // Pairwise debts: 4 active members -> 4 * 3 / 2 = 6 pairwise potential debts
      assert.equal(pairwiseDebtsCount, 6);
      assert.equal(optimizedCount, 3);
      assert.equal(savedPercent, 50); // 3 of 6 saved -> 50%

      // Verification of greedy matching:
      // Largest debtor: Rohan (4900) vs Largest creditor: Kavya (5700)
      // -> Rohan pays Kavya 4900. (Rohan: 0, Kavya: 800)
      // Next largest debtor: Arjun (2500) vs Largest creditor: Priya (1700)
      // -> Arjun pays Priya 1700. (Arjun: 800, Priya: 0)
      // Next: Arjun (800) vs Kavya (800)
      // -> Arjun pays Kavya 800. (Arjun: 0, Kavya: 0)
      assert.deepEqual(transfers, [
        { from: 'u_rohan', fromName: 'Rohan Das', to: 'u_kavya', toName: 'Kavya Iyer', amount: 490000 },
        { from: 'u_arjun', fromName: 'Arjun Mehta', to: 'u_priya', toName: 'Priya Raman', amount: 170000 },
        { from: 'u_arjun', fromName: 'Arjun Mehta', to: 'u_kavya', toName: 'Kavya Iyer', amount: 80000 }
      ]);

      // All transfers must be positive integer paise
      for (const t of transfers) {
        assert.ok(Number.isInteger(t.amount) && t.amount > 0);
        assert.notEqual(t.from, t.to);
      }

      // Verification: applying these transfers settles all balances to zero
      const simBalances = { ...balances };
      for (const t of transfers) {
        simBalances[t.from] += t.amount;
        simBalances[t.to] -= t.amount;
      }
      for (const bal of Object.values(simBalances)) {
        assert.equal(bal, 0);
      }
    });

    test('deterministic output across repeated executions with same balances', () => {
      const members = [
        { userId: 'u_1', name: 'User 1' },
        { userId: 'u_2', name: 'User 2' },
        { userId: 'u_3', name: 'User 3' },
        { userId: 'u_4', name: 'User 4' }
      ];
      const balances = { u_1: 1500, u_2: -1000, u_3: -500, u_4: 0 };

      const run1 = simplifyDebts(members, balances);
      const run2 = simplifyDebts(members, balances);
      const run3 = simplifyDebts(members, balances);

      assert.deepEqual(run1, run2);
      assert.deepEqual(run2, run3);
    });

    test('already settled group or empty group returns empty transfers list', () => {
      const members = [{ userId: 'A' }, { userId: 'B' }];
      const balances = { A: 0, B: 0 };

      const res = simplifyDebts(members, balances);
      assert.equal(res.transfers.length, 0);
      assert.equal(res.optimizedCount, 0);

      const emptyRes = simplifyDebts([], {});
      assert.equal(emptyRes.transfers.length, 0);
    });

    test('handles single-member group cleanly without self-transfers', () => {
      const members = [{ userId: 'Solo', name: 'Solo Member' }];
      const balances = { Solo: 0 };

      const res = simplifyDebts(members, balances);
      assert.equal(res.transfers.length, 0);
    });
  });

  // ===========================================================================
  // 4. SETTLEMENT RECORDING & AUDIT
  // ===========================================================================
  describe('4. Settlement recording and validation', () => {
    test('valid settlement records properly and updates net balances', async () => {
      // In seed grp_goa: Priya is +710000 (creditor), Rohan is -210000 (debtor).
      // Record a settlement of 100000 paise (₹1,000) from Rohan to Priya.
      const settlement = await api.recordSettlement('grp_goa', {
        payerId: 'u_rohan',
        payeeId: 'u_priya',
        amount: 100000
      });

      assert.ok(settlement.id);
      assert.equal(settlement.amount, 100000);
      assert.equal(settlement.status, 'completed');

      // Balances update:
      // Rohan was -210000, now -110000
      // Priya was +710000, now +610000
      const balances = await api.getGroupBalances('grp_goa');
      assert.equal(balances['u_rohan'], -110000);
      assert.equal(balances['u_priya'], 610000);
      assert.equal(balances['u_arjun'], -370000); // unaffected
      assert.equal(balances['u_kavya'], -130000); // unaffected

      // Appears in settlement history
      const history = await api.getSettlements('grp_goa');
      assert.ok(history.some((s) => s.id === settlement.id));
    });

    test('rejects zero, negative, or non-integer settlement amounts', async () => {
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'u_rohan', payeeId: 'u_priya', amount: 0 }),
        (err) => err.status === 400 && err.message.includes('positive integer paise')
      );
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'u_rohan', payeeId: 'u_priya', amount: -500 }),
        (err) => err.status === 400 && err.message.includes('positive integer paise')
      );
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'u_rohan', payeeId: 'u_priya', amount: 50.5 }),
        (err) => err.status === 400 && err.message.includes('positive integer paise')
      );
    });

    test('rejects self-settlement (same payer and payee)', async () => {
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'u_rohan', payeeId: 'u_rohan', amount: 1000 }),
        (err) => err.status === 400 && err.message.includes('same member')
      );
    });

    test('rejects settlements involving non-members or cross-group users', async () => {
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'non_member_123', payeeId: 'u_priya', amount: 1000 }),
        (err) => err.status === 400 && err.message.includes('must be members of the group')
      );
    });

    test('rejects settlement when payer is not in debt or payee is not owed money', async () => {
      // Priya is a creditor (+710000). Priya paying Rohan is invalid.
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'u_priya', payeeId: 'u_rohan', amount: 50000 }),
        (err) => err.status === 400 && err.message.includes('does not have an outstanding debt')
      );

      // Kavya is a debtor (-130000). Kavya receiving from Rohan is invalid.
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'u_rohan', payeeId: 'u_kavya', amount: 50000 }),
        (err) => err.status === 400 && err.message.includes('not owed money')
      );
    });

    test('rejects settlement amount exceeding the allowable debt transfer', async () => {
      // In seed grp_goa: Rohan owes 210000 paise, Priya is owed 710000 paise.
      // Maximum allowable transfer between Rohan and Priya is min(210000, 710000) = 210000 paise.
      // Attempting to pay 210001 must be rejected.
      await assert.rejects(
        () => api.recordSettlement('grp_goa', { payerId: 'u_rohan', payeeId: 'u_priya', amount: 210001 }),
        (err) => err.status === 400 && err.message.includes('exceeds maximum allowable debt transfer')
      );

      // Exactly 210000 succeeds
      const stl = await api.recordSettlement('grp_goa', { payerId: 'u_rohan', payeeId: 'u_priya', amount: 210000 });
      assert.ok(stl.id);
      assert.equal(stl.amount, 210000);
    });

    test('duplicate submission within debounce window is rejected', async () => {
      // First settlement: Rohan pays Priya 50000
      await api.recordSettlement('grp_goa', {
        payerId: 'u_rohan',
        payeeId: 'u_priya',
        amount: 50000
      });

      // Immediate identical second submission
      await assert.rejects(
        () => api.recordSettlement('grp_goa', {
          payerId: 'u_rohan',
          payeeId: 'u_priya',
          amount: 50000
        }),
        (err) => err.status === 409 && err.message.includes('Duplicate settlement')
      );
    });

    test('removing a settlement recalculates balances consistently', async () => {
      // Balances before settlement
      const before = await api.getGroupBalances('grp_goa');

      // Record a settlement
      const stl = await api.recordSettlement('grp_goa', {
        payerId: 'u_rohan',
        payeeId: 'u_priya',
        amount: 100000
      });

      // Balances changed
      const during = await api.getGroupBalances('grp_goa');
      assert.equal(during['u_rohan'], before['u_rohan'] + 100000);
      assert.equal(during['u_priya'], before['u_priya'] - 100000);

      // Remove the settlement
      await api.removeSettlement(stl.id);

      // Balances restored to exact before state
      const after = await api.getGroupBalances('grp_goa');
      assert.deepEqual(after, before);
    });
  });
});
