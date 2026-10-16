/**
 * Forecast Domain and Analytics Tests (Review 2, Step P6).
 * Validates velocity-based spending projection, data sufficiency rules,
 * integer-paise calculations, calendar boundaries, and budget risk levels.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateForecast,
  assessBudgetRisk
} from '../../client/js/domain/forecast.js';

describe('Step P6: Spending Velocity Forecast & Budget Risk', () => {
  describe('1. Data sufficiency rules', () => {
    it('returns hasSufficientData: false when fewer than 3 transactions exist', () => {
      const expenses = [
        { date: '2026-10-05', amount: 50000 },
        { date: '2026-10-12', amount: 150000 }
      ];

      const fc = calculateForecast(expenses, {
        monthlyBudget: 4000000,
        currentDate: new Date('2026-10-15')
      });

      assert.equal(fc.hasSufficientData, false);
      assert.equal(fc.transactionCount, 2);
      assert.ok(fc.reason.includes('minimum 3 transactions'));
      assert.equal(fc.projectedSpend, 200000); // Current spend fallback
    });

    it('returns hasSufficientData: false when empty array is provided', () => {
      const fc = calculateForecast([], {
        monthlyBudget: 4000000,
        currentDate: new Date('2026-10-15')
      });

      assert.equal(fc.hasSufficientData, false);
      assert.equal(fc.transactionCount, 0);
      assert.equal(fc.totalSpent, 0);
      assert.equal(fc.projectedSpend, 0);
    });

    it('returns hasSufficientData: true when 3 or more transactions exist', () => {
      const expenses = [
        { date: '2026-10-02', amount: 30000 },
        { date: '2026-10-05', amount: 45000 },
        { date: '2026-10-10', amount: 25000 }
      ];

      const fc = calculateForecast(expenses, {
        monthlyBudget: 4000000,
        currentDate: new Date('2026-10-10')
      });

      assert.equal(fc.hasSufficientData, true);
      assert.equal(fc.transactionCount, 3);
      assert.equal(fc.totalSpent, 100000); // 1,000 rupees in paise
    });
  });

  describe('2. Linear velocity projection arithmetic', () => {
    it('projects monthly spend using linear daily velocity in integer paise', () => {
      // 10 days passed in October (31 days total). Spent ₹10,000 (1,000,000 paise).
      // Daily avg = 1,000,000 / 10 = 100,000 paise/day.
      // Projected total = 100,000 * 31 = 3,100,000 paise.
      const expenses = [
        { date: '2026-10-01', amount: 300000 },
        { date: '2026-10-04', amount: 400000 },
        { date: '2026-10-08', amount: 300000 }
      ];

      const fc = calculateForecast(expenses, {
        monthlyBudget: 4000000,
        currentDate: new Date('2026-10-10')
      });

      assert.equal(fc.daysPassed, 10);
      assert.equal(fc.daysInMonth, 31);
      assert.equal(fc.daysRemaining, 21);
      assert.equal(fc.totalSpent, 1000000);
      assert.equal(fc.dailyAverage, 100000);
      assert.equal(fc.projectedRemaining, 2100000);
      assert.equal(fc.projectedSpend, 3100000);
      assert.equal(fc.projectedPercentage, 78); // 3,100,000 / 4,000,000 = 77.5% => 78%
      assert.equal(fc.isOnTrack, true);
      assert.equal(fc.status, 'caution'); // >= 75%
    });

    it('enforces all financial totals and intermediate values are integers', () => {
      // 3 transactions with uneven amounts over 7 days in November (30 days)
      const expenses = [
        { date: '2026-11-01', amount: 33333 },
        { date: '2026-11-03', amount: 33333 },
        { date: '2026-11-05', amount: 33334 }
      ];

      const fc = calculateForecast(expenses, {
        monthlyBudget: 500000,
        currentDate: new Date('2026-11-07')
      });

      assert.equal(Number.isInteger(fc.totalSpent), true);
      assert.equal(Number.isInteger(fc.dailyAverage), true);
      assert.equal(Number.isInteger(fc.projectedSpend), true);
      assert.equal(Number.isInteger(fc.projectedRemaining), true);
      assert.equal(Number.isInteger(fc.projectedOverUnder), true);
    });

    it('handles February leap and non-leap year calendar boundaries', () => {
      const expenses = [
        { date: '2028-02-01', amount: 100000 },
        { date: '2028-02-05', amount: 100000 },
        { date: '2028-02-10', amount: 100000 }
      ];

      // 2028 is a leap year (29 days in Feb)
      const fc2028 = calculateForecast(expenses, {
        monthlyBudget: 1000000,
        currentDate: new Date('2028-02-10')
      });
      assert.equal(fc2028.daysInMonth, 29);
      assert.equal(fc2028.daysRemaining, 19);

      // 2026 is a standard year (28 days in Feb)
      const fc2026 = calculateForecast(expenses, {
        monthlyBudget: 1000000,
        currentDate: new Date('2026-02-10')
      });
      assert.equal(fc2026.daysInMonth, 28);
      assert.equal(fc2026.daysRemaining, 18);
    });
  });

  describe('3. Calendar edge cases', () => {
    it('handles day 1 of the month safely', () => {
      const expenses = [
        { date: '2026-10-01', amount: 10000 },
        { date: '2026-10-01', amount: 20000 },
        { date: '2026-10-01', amount: 30000 }
      ];

      const fc = calculateForecast(expenses, {
        monthlyBudget: 3000000,
        currentDate: new Date('2026-10-01')
      });

      assert.equal(fc.daysPassed, 1);
      assert.equal(fc.dailyAverage, 60000);
      assert.equal(fc.projectedSpend, 60000 * 31);
    });

    it('handles the last day of the month accurately', () => {
      const expenses = [
        { date: '2026-10-05', amount: 500000 },
        { date: '2026-10-15', amount: 500000 },
        { date: '2026-10-31', amount: 500000 }
      ];

      const fc = calculateForecast(expenses, {
        monthlyBudget: 2000000,
        currentDate: new Date('2026-10-31')
      });

      assert.equal(fc.daysPassed, 31);
      assert.equal(fc.daysRemaining, 0);
      assert.equal(fc.projectedSpend, 1500000);
      assert.equal(fc.projectedRemaining, 0);
    });

    it('filters out expenses from other months or future dates', () => {
      const expenses = [
        { date: '2026-09-30', amount: 999999 }, // Previous month
        { date: '2026-10-02', amount: 100000 },
        { date: '2026-10-05', amount: 100000 },
        { date: '2026-10-09', amount: 100000 },
        { date: '2026-10-25', amount: 888888 }, // Future date relative to currentDate
        { date: '2026-11-01', amount: 777777 }  // Next month
      ];

      const fc = calculateForecast(expenses, {
        monthlyBudget: 2000000,
        currentDate: new Date('2026-10-10')
      });

      assert.equal(fc.transactionCount, 3);
      assert.equal(fc.totalSpent, 300000);
    });
  });

  describe('4. Budget risk assessments', () => {
    it('classifies > 100% as danger (over budget)', () => {
      const risk = assessBudgetRisk(4500000, 4000000);
      assert.equal(risk.status, 'danger');
      assert.equal(risk.percentage, 113);
      assert.equal(risk.isOnTrack, false);
      assert.equal(risk.overUnderPaise, 500000);
      assert.ok(risk.message.includes('13% over'));
    });

    it('classifies 90% to 100% as warning (approaching limit)', () => {
      const risk = assessBudgetRisk(3700000, 4000000);
      assert.equal(risk.status, 'warning');
      assert.equal(risk.percentage, 93);
      assert.equal(risk.isOnTrack, true);
      assert.equal(risk.overUnderPaise, -300000);
    });

    it('classifies 75% to 89% as caution', () => {
      const risk = assessBudgetRisk(3200000, 4000000);
      assert.equal(risk.status, 'caution');
      assert.equal(risk.percentage, 80);
      assert.equal(risk.isOnTrack, true);
    });

    it('classifies < 75% as ok (well on track)', () => {
      const risk = assessBudgetRisk(2000000, 4000000);
      assert.equal(risk.status, 'ok');
      assert.equal(risk.percentage, 50);
      assert.equal(risk.isOnTrack, true);
    });

    it('handles zero or missing budget safely without division by zero', () => {
      const risk = assessBudgetRisk(100000, 0);
      assert.equal(risk.status, 'danger');
      assert.equal(risk.percentage, 100);
      assert.equal(risk.isOnTrack, false);
    });
  });
});
