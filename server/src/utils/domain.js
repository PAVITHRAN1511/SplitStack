/**
 * SplitStack Server Domain Module Wrapper (Review 3, Step P11).
 * Reuses the authoritative domain algorithms from the client domain layer
 * to ensure 100% computational parity across client and server.
 */

import {
  calculateEqualSplit,
  validateCustomShares,
} from '../../../client/js/domain/splits.js';

import {
  calculateNetBalances,
  simplifyDebts,
} from '../../../client/js/domain/settle.js';

import {
  calculateForecast,
  assessBudgetRisk,
} from '../../../client/js/domain/forecast.js';

import {
  generateInsights,
} from '../../../client/js/domain/insights.js';

export {
  calculateEqualSplit,
  validateCustomShares,
  calculateNetBalances,
  simplifyDebts,
  calculateForecast,
  assessBudgetRisk,
  generateInsights,
};
