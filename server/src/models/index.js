/**
 * SplitStack Mongoose Models Index (Review 3, Step P10).
 * Re-exports all domain schemas, models, and shared validation utilities.
 */

export { User } from './User.js';
export { Category } from './Category.js';
export { Expense } from './Expense.js';
export { Income } from './Income.js';
export { Budget } from './Budget.js';
export { Recurring } from './Recurring.js';
export { Group } from './Group.js';
export { SharedExpense } from './SharedExpense.js';
export { Settlement } from './Settlement.js';
export { ShoppingList } from './ShoppingList.js';
export { Receipt } from './Receipt.js';
export { Insight } from './Insight.js';

export {
  nonNegativeIntegerPaise,
  positiveIntegerPaise,
  emailValidator,
} from './validators.js';

export default {
  User: (await import('./User.js')).User,
  Category: (await import('./Category.js')).Category,
  Expense: (await import('./Expense.js')).Expense,
  Income: (await import('./Income.js')).Income,
  Budget: (await import('./Budget.js')).Budget,
  Recurring: (await import('./Recurring.js')).Recurring,
  Group: (await import('./Group.js')).Group,
  SharedExpense: (await import('./SharedExpense.js')).SharedExpense,
  Settlement: (await import('./Settlement.js')).Settlement,
  ShoppingList: (await import('./ShoppingList.js')).ShoppingList,
  Receipt: (await import('./Receipt.js')).Receipt,
  Insight: (await import('./Insight.js')).Insight,
};
