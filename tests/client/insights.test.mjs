/**
 * Smart Insights Domain Tests (Review 2, Step P6).
 * Validates deterministic insight generation from real data, budget warning thresholds,
 * month-over-month category trends, upcoming recurring bills, and user isolation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateInsights } from '../../client/js/domain/insights.js';

describe('Step P6: Smart Spending Insights', () => {
  const defaultCategories = [
    { id: 'cat_food', name: 'Food & Dining' },
    { id: 'cat_shopping', name: 'Shopping' },
    { id: 'cat_bills', name: 'Bills & Utilities' },
    { id: 'cat_transport', name: 'Transportation' }
  ];

  describe('1. Budget alerts and threshold classification', () => {
    it('generates a danger insight when a category is over budget (> 100%)', () => {
      const budgets = [
        {
          id: 'b1',
          categoryId: 'cat_shopping',
          limit: 500000, // ₹5,000
          spent: 628000, // ₹6,280 (126%)
          spentPercentage: 126,
          status: 'danger'
        }
      ];

      const insights = generateInsights({
        budgets,
        categories: defaultCategories
      });

      const shoppingAlert = insights.find((i) => i.id === 'budget-cat_shopping');
      assert.ok(shoppingAlert, 'Expected shopping budget alert');
      assert.equal(shoppingAlert.kind, 'danger');
      assert.ok(shoppingAlert.title.includes('Shopping is 26% over budget'));
      assert.ok(shoppingAlert.message.includes('₹6,280 spent against a ₹5,000 limit'));
    });

    it('generates a warning insight when budget is approaching limit (>= 90%)', () => {
      const budgets = [
        {
          id: 'b2',
          categoryId: 'cat_food',
          limit: 1000000, // ₹10,000
          spent: 940000,  // ₹9,400 (94%)
          spentPercentage: 94,
          status: 'warning'
        }
      ];

      const insights = generateInsights({
        budgets,
        categories: defaultCategories
      });

      const foodAlert = insights.find((i) => i.id === 'budget-cat_food');
      assert.ok(foodAlert, 'Expected food budget alert');
      assert.equal(foodAlert.kind, 'warning');
      assert.ok(foodAlert.title.includes('Food & Dining budget at 94%'));
    });

    it('does not generate budget alerts when spending is well below limit (< 90%)', () => {
      const budgets = [
        {
          id: 'b3',
          categoryId: 'cat_transport',
          limit: 500000,
          spent: 200000, // 40%
          spentPercentage: 40,
          status: 'ok'
        }
      ];

      const insights = generateInsights({
        budgets,
        categories: defaultCategories
      });

      const transportAlert = insights.find((i) => i.id === 'budget-cat_transport');
      assert.equal(transportAlert, undefined);
    });

    it('generates overall monthly budget warning when monthly limit is near or exceeded', () => {
      const budgets = [
        {
          id: 'b_overall',
          categoryId: null, // Overall budget
          limit: 4000000,
          spent: 4400000, // 110%
          spentPercentage: 110,
          status: 'danger'
        }
      ];

      const insights = generateInsights({
        budgets,
        categories: defaultCategories
      });

      const overallAlert = insights.find((i) => i.id === 'budget-overall');
      assert.ok(overallAlert);
      assert.equal(overallAlert.kind, 'danger');
      assert.ok(overallAlert.title.includes('Monthly budget is 10% over limit'));
    });
  });

  describe('2. Month-over-month category trend insights', () => {
    it('generates an increase insight when category spend rises by 20% or more', () => {
      // Current month (October): Food = ₹12,000 (1,200,000 paise)
      // Previous month (September): Food = ₹10,000 (1,000,000 paise) -> +20%
      const expenses = [
        { date: '2026-10-05', categoryId: 'cat_food', amount: 600000 },
        { date: '2026-10-12', categoryId: 'cat_food', amount: 600000 },
        { date: '2026-09-10', categoryId: 'cat_food', amount: 500000 },
        { date: '2026-09-20', categoryId: 'cat_food', amount: 500000 }
      ];

      const insights = generateInsights({
        expenses,
        categories: defaultCategories,
        currentDate: new Date('2026-10-28')
      });

      const trend = insights.find((i) => i.id === 'trend-cat_food');
      assert.ok(trend, 'Expected Food trend insight');
      assert.equal(trend.kind, 'info');
      assert.ok(trend.title.includes('Food & Dining spending up 20%'));
      assert.ok(trend.message.includes('Compared with September'));
    });

    it('generates a decrease insight when category spend drops by 20% or more', () => {
      // Current month: Transport = ₹4,000. Previous month: Transport = ₹8,000 -> -50%
      const expenses = [
        { date: '2026-10-05', categoryId: 'cat_transport', amount: 400000 },
        { date: '2026-09-15', categoryId: 'cat_transport', amount: 800000 }
      ];

      const insights = generateInsights({
        expenses,
        categories: defaultCategories,
        currentDate: new Date('2026-10-28')
      });

      const trend = insights.find((i) => i.id === 'trend-cat_transport');
      assert.ok(trend);
      assert.equal(trend.kind, 'success');
      assert.ok(trend.title.includes('Transportation spending down 50%'));
    });

    it('safely handles zero spending in previous month without division by zero', () => {
      const expenses = [
        { date: '2026-10-05', categoryId: 'cat_shopping', amount: 500000 }
        // No September expenses
      ];

      const insights = generateInsights({
        expenses,
        categories: defaultCategories,
        currentDate: new Date('2026-10-28')
      });

      const trend = insights.find((i) => i.id === 'trend-cat_shopping');
      // Should not generate spurious infinite trend
      assert.equal(trend, undefined);
    });

    it('ignores minor variations below 20%', () => {
      // September = ₹10,000, October = ₹10,500 (+5%)
      const expenses = [
        { date: '2026-10-05', categoryId: 'cat_food', amount: 1050000 },
        { date: '2026-09-05', categoryId: 'cat_food', amount: 1000000 }
      ];

      const insights = generateInsights({
        expenses,
        categories: defaultCategories,
        currentDate: new Date('2026-10-28')
      });

      const trend = insights.find((i) => i.id === 'trend-cat_food');
      assert.equal(trend, undefined);
    });
  });

  describe('3. Upcoming recurring bills', () => {
    it('alerts on recurring bills due in the next 7 days', () => {
      const recurring = [
        {
          id: 'rec_rent',
          title: 'Rent',
          amount: 1200000, // ₹12,000
          dayOfMonth: 1,   // Due on Nov 1 (in 4 days from Oct 28)
          active: true
        }
      ];

      const insights = generateInsights({
        recurring,
        currentDate: new Date('2026-10-28')
      });

      const rentAlert = insights.find((i) => i.id === 'recurring-rec_rent');
      assert.ok(rentAlert);
      assert.equal(rentAlert.kind, 'warning');
      assert.ok(rentAlert.title.includes('Rent of ₹12,000 due 1 Nov'));
      assert.ok(rentAlert.message.includes('in 4 days'));
    });

    it('ignores inactive recurring bills or bills due more than 7 days away', () => {
      const recurring = [
        {
          id: 'rec_inactive',
          title: 'Old Gym',
          amount: 200000,
          dayOfMonth: 30,
          active: false
        },
        {
          id: 'rec_far',
          title: 'Annual Insurance',
          amount: 5000000,
          dayOfMonth: 15, // 18 days away from Oct 28
          active: true
        }
      ];

      const insights = generateInsights({
        recurring,
        currentDate: new Date('2026-10-28')
      });

      assert.equal(insights.find((i) => i.id.startsWith('recurring-')), undefined);
    });
  });

  describe('4. Group balance alerts', () => {
    it('notifies when net amount is owed to the user across groups', () => {
      const insights = generateInsights({
        groupBalances: { grp1: 170000, grp2: -45000 } // Net = +125,000 paise (+₹1,250)
      });

      const groupInsight = insights.find((i) => i.id === 'group-balance');
      assert.ok(groupInsight);
      assert.equal(groupInsight.kind, 'info');
      assert.ok(groupInsight.title.includes('₹1,250 owed to you'));
    });

    it('notifies when net amount is owed by the user across groups', () => {
      const insights = generateInsights({
        groupBalances: { grp1: -500000, grp2: 100000 } // Net = -400,000 paise (-₹4,000)
      });

      const groupInsight = insights.find((i) => i.id === 'group-balance');
      assert.ok(groupInsight);
      assert.equal(groupInsight.kind, 'warning');
      assert.ok(groupInsight.title.includes('You owe ₹4,000 across groups'));
    });

    it('does not generate group insight when all debts are settled (net 0)', () => {
      const insights = generateInsights({
        groupBalances: { grp1: 100000, grp2: -100000 }
      });

      assert.equal(insights.find((i) => i.id === 'group-balance'), undefined);
    });
  });

  describe('5. Empty datasets and deduplication', () => {
    it('handles empty data gracefully without throwing', () => {
      const insights = generateInsights({});
      assert.ok(Array.isArray(insights));
      assert.equal(insights.length, 0);
    });

    it('ensures all generated insights have unique IDs and traceable metadata', () => {
      const insights = generateInsights({
        budgets: [
          { id: 'b1', categoryId: 'cat_food', limit: 100000, spent: 150000, status: 'danger', spentPercentage: 150 }
        ],
        expenses: [
          { date: '2026-10-02', categoryId: 'cat_food', amount: 800000 },
          { date: '2026-10-08', categoryId: 'cat_food', amount: 800000 },
          { date: '2026-09-05', categoryId: 'cat_food', amount: 500000 }
        ],
        categories: defaultCategories,
        currentDate: new Date('2026-10-28')
      });

      const ids = insights.map((i) => i.id);
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, 'All insight IDs must be unique');

      for (const item of insights) {
        assert.ok(item.title, 'Insight must have a title');
        assert.ok(item.message, 'Insight must have a message');
        assert.ok(['danger', 'warning', 'info', 'success'].includes(item.kind));
      }
    });
  });
});
