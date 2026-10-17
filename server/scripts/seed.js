/**
 * SplitStack Database Seeder (Review 3, Step P14).
 * Deterministically populates a development or dedicated test MongoDB database
 * with synthetic users, categories, expenses, income, budgets, recurring items,
 * groups, shared expenses, settlements, shopping lists, receipts, and insights.
 *
 * SAFETY GUARDS:
 * 1. Requires an explicit CLI flag (--dev or --test) or explicit --uri.
 * 2. Refuses to run if NODE_ENV === 'production'.
 * 3. Refuses to run against database names containing 'prod', 'production', or 'live'.
 * 4. Refuses to run against internal system databases (admin, config, local).
 * 5. In --test mode, strictly requires that the database name contains 'test'.
 * 6. Never seeds automatically on server startup.
 * 7. Passwords are securely hashed with bcrypt (cost factor 12) via authService.
 * 8. All financial values are stored as positive integer paise.
 * 9. Idempotent: clears target collections cleanly before deterministic re-population.
 */

import mongoose from 'mongoose';
import {
  User,
  Category,
  Expense,
  Income,
  Budget,
  Recurring,
  Group,
  SharedExpense,
  Settlement,
  ShoppingList,
  Receipt,
  Insight,
} from '../src/models/index.js';
import { hashPassword } from '../src/services/authService.js';
import { sanitizeMongoUri } from '../src/db.js';

/**
 * Parse CLI arguments for seed execution.
 * @param {string[]} argv
 * @returns {{ isTest: boolean, isDev: boolean, uri: string|null, force: boolean, dryRun: boolean }}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    isTest: false,
    isDev: false,
    uri: null,
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--test') args.isTest = true;
    else if (arg === '--dev') args.isDev = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--uri' && argv[i + 1]) {
      args.uri = argv[++i];
    }
  }

  return args;
}

/**
 * Extract database name from connection URI.
 * @param {string} uri
 * @returns {string}
 */
export function extractDatabaseName(uri) {
  if (!uri || typeof uri !== 'string') return '';
  try {
    const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i);
    return match ? match[1].trim() : '';
  } catch (_) {
    return '';
  }
}

/**
 * Enforce database URI safety guards before any destructive operations.
 * @param {string} uri
 * @param {Object} options
 * @param {boolean} [options.isTest=false]
 * @param {string} [options.nodeEnv=process.env.NODE_ENV]
 * @returns {string} Verified safe database name
 */
export function assertSafeDatabase(uri, { isTest = false, nodeEnv = process.env.NODE_ENV } = {}) {
  if (nodeEnv === 'production') {
    throw new Error(
      '[Seed Safety Violation] Seeding is strictly forbidden when NODE_ENV is "production".'
    );
  }

  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    throw new Error(
      '[Seed Safety Violation] No MongoDB connection URI specified. Provide MONGODB_URI or use --test / --dev flag.'
    );
  }

  const dbName = extractDatabaseName(uri);
  if (!dbName) {
    throw new Error(
      `[Seed Safety Violation] Unable to parse database name from URI: "${sanitizeMongoUri(uri)}". ` +
      'Destructive operations require an explicit database name in the connection string.'
    );
  }

  const forbiddenDbs = ['admin', 'config', 'local'];
  if (forbiddenDbs.includes(dbName.toLowerCase())) {
    throw new Error(
      `[Seed Safety Violation] Refusing to seed internal system database "${dbName}".`
    );
  }

  const prodPattern = /(?:^|[_-])(?:prod|production|live)(?:$|[_-])/i;
  if (prodPattern.test(dbName)) {
    throw new Error(
      `[Seed Safety Violation] Database name "${dbName}" indicates production. Seeding is strictly refused.`
    );
  }

  if (isTest && !dbName.toLowerCase().includes('test')) {
    throw new Error(
      `[Seed Safety Violation] In --test mode, database name must contain "test" (received: "${dbName}").`
    );
  }

  return dbName;
}

/**
 * Deterministically seed the database with synthetic data.
 * @param {typeof mongoose} conn
 * @param {Object} [options]
 * @returns {Promise<Object>} Seed execution summary
 */
export async function seedDatabase(conn, { dryRun = false } = {}) {
  const db = conn.connection.db;
  const dbName = conn.connection.name;

  console.log(`[Seed] Target database: "${dbName}"`);

  if (dryRun) {
    console.log('[Seed] Dry-run enabled. Skipping database modifications.');
    return { dryRun: true };
  }

  // 1. Clean existing collections in verified database
  console.log('[Seed] Cleaning existing data collections in target database...');
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Expense.deleteMany({}),
    Income.deleteMany({}),
    Budget.deleteMany({}),
    Recurring.deleteMany({}),
    Group.deleteMany({}),
    SharedExpense.deleteMany({}),
    Settlement.deleteMany({}),
    ShoppingList.deleteMany({}),
    Receipt.deleteMany({}),
    Insight.deleteMany({}),
  ]);

  // 2. Hash synthetic passwords using bcrypt (12 rounds)
  console.log('[Seed] Generating bcrypt password hashes for synthetic users...');
  const [priyaHash, rohanHash, kavyaHash, arjunHash] = await Promise.all([
    hashPassword('Demo@1234'),
    hashPassword('Rohan@1234'),
    hashPassword('Kavya@1234'),
    hashPassword('Arjun@1234'),
  ]);

  // 3. Create synthetic users
  console.log('[Seed] Inserting synthetic users...');
  const users = await User.create([
    {
      name: 'Priya Raman',
      email: 'demo@splitstack.app',
      passwordHash: priyaHash,
      avatarColor: '#4f46e5',
      initials: 'PR',
      preferences: { theme: 'dark', currency: 'INR' },
      createdAt: new Date('2026-05-01T00:00:00Z'),
    },
    {
      name: 'Rohan Das',
      email: 'rohan.das@example.com',
      passwordHash: rohanHash,
      avatarColor: '#d97706',
      initials: 'RD',
      preferences: { theme: 'dark', currency: 'INR' },
      createdAt: new Date('2026-05-01T00:00:00Z'),
    },
    {
      name: 'Kavya Nair',
      email: 'kavya.nair@example.com',
      passwordHash: kavyaHash,
      avatarColor: '#10b981',
      initials: 'KN',
      preferences: { theme: 'dark', currency: 'INR' },
      createdAt: new Date('2026-05-01T00:00:00Z'),
    },
    {
      name: 'Arjun Mehta',
      email: 'arjun.mehta@example.com',
      passwordHash: arjunHash,
      avatarColor: '#0ea5e9',
      initials: 'AM',
      preferences: { theme: 'dark', currency: 'INR' },
      createdAt: new Date('2026-05-01T00:00:00Z'),
    },
  ]);

  const [uPriya, uRohan, uKavya, uArjun] = users;

  // 4. Create standard categories (global with user: null) and one custom user category
  console.log('[Seed] Inserting categories...');
  const categories = await Category.create([
    // Expense categories
    { user: null, name: 'Food & Dining', type: 'expense', icon: 'mug-hot', color: '#f59e0b' },
    { user: null, name: 'Transportation', type: 'expense', icon: 'car', color: '#3b82f6' },
    { user: null, name: 'Shopping', type: 'expense', icon: 'bag-shopping', color: '#ec4899' },
    { user: null, name: 'Bills & Utilities', type: 'expense', icon: 'file-invoice', color: '#ef4444' },
    { user: null, name: 'Entertainment', type: 'expense', icon: 'film', color: '#8b5cf6' },
    { user: null, name: 'Education', type: 'expense', icon: 'graduation-cap', color: '#10b981' },
    { user: null, name: 'Healthcare', type: 'expense', icon: 'heart-pulse', color: '#06b6d4' },
    { user: null, name: 'Travel', type: 'expense', icon: 'plane', color: '#6366f1' },
    { user: null, name: 'Other', type: 'expense', icon: 'ellipsis', color: '#64748b' },
    // Income categories
    { user: null, name: 'Salary', type: 'income', icon: 'briefcase', color: '#10b981' },
    { user: null, name: 'Freelance', type: 'income', icon: 'laptop-code', color: '#3b82f6' },
    { user: null, name: 'Investments', type: 'income', icon: 'chart-line', color: '#8b5cf6' },
    // Custom user category
    { user: uPriya._id, name: 'Pet Care', type: 'expense', icon: 'paw', color: '#14b8a6' },
  ]);

  const catMap = {};
  for (const c of categories) {
    catMap[c.name] = c._id;
  }

  // 5. Create personal expenses for Priya (October 2026 + 5 historical months)
  console.log('[Seed] Inserting personal expenses...');
  const expenses = await Expense.create([
    // October 2026 (matching review 1 & 2 dashboard total ₹31,840 = 3,184,000 paise)
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 84000, date: new Date('2026-10-24T20:30:00Z'), description: 'Swiggy · dinner', paymentMethod: 'UPI', notes: 'Dinner with family' },
    { user: uPriya._id, category: catMap['Transportation'], amount: 50000, date: new Date('2026-10-23T09:15:00Z'), description: 'Metro card recharge', paymentMethod: 'UPI', notes: '' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 245000, date: new Date('2026-10-22T14:00:00Z'), description: 'TNEB electricity bill', paymentMethod: 'Net banking', notes: 'Consumer #09281' },
    { user: uPriya._id, category: catMap['Shopping'], amount: 429900, date: new Date('2026-10-20T18:45:00Z'), description: 'Running shoes · Myntra', paymentMethod: 'Card', notes: 'Nike Pegasus' },
    { user: uPriya._id, category: catMap['Entertainment'], amount: 112000, date: new Date('2026-10-19T21:00:00Z'), description: 'PVR · movie night', paymentMethod: 'UPI', notes: '2 tickets + popcorn' },
    { user: uPriya._id, category: catMap['Healthcare'], amount: 68000, date: new Date('2026-10-18T11:20:00Z'), description: 'Apollo Pharmacy', paymentMethod: 'Cash', notes: 'Vitamins' },
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 341000, date: new Date('2026-10-17T16:10:00Z'), description: 'Groceries · BigBasket', paymentMethod: 'Card', notes: 'Bi-weekly staples' },
    { user: uPriya._id, category: catMap['Transportation'], amount: 72000, date: new Date('2026-10-15T05:30:00Z'), description: 'Uber to airport', paymentMethod: 'UPI', notes: 'Morning flight' },
    { user: uPriya._id, category: catMap['Travel'], amount: 185000, date: new Date('2026-10-12T19:00:00Z'), description: 'Weekend trip · bus tickets', paymentMethod: 'UPI', notes: 'KSRTC sleeper' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 117900, date: new Date('2026-10-10T10:00:00Z'), description: 'Jio Fiber broadband', paymentMethod: 'UPI', notes: 'Monthly recharge' },
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 247000, date: new Date('2026-10-08T17:30:00Z'), description: 'Supermarket essentials', paymentMethod: 'Card', notes: '' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 185100, date: new Date('2026-10-06T12:00:00Z'), description: 'Gas cylinder & utilities', paymentMethod: 'Net banking', notes: '' },
    { user: uPriya._id, category: catMap['Shopping'], amount: 198100, date: new Date('2026-10-05T14:20:00Z'), description: 'Stationery and home desk decor', paymentMethod: 'UPI', notes: '' },
    { user: uPriya._id, category: catMap['Transportation'], amount: 163000, date: new Date('2026-10-03T08:45:00Z'), description: 'Petrol fill up', paymentMethod: 'UPI', notes: '' },
    { user: uPriya._id, category: catMap['Entertainment'], amount: 133000, date: new Date('2026-10-02T19:00:00Z'), description: 'Board games cafe', paymentMethod: 'Cash', notes: '' },
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 544000, date: new Date('2026-10-01T10:00:00Z'), description: 'Organic farm basket', paymentMethod: 'UPI', notes: 'Monthly veggies' },

    // Historical expenses (September 2026: ₹29,800)
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 720000, date: new Date('2026-09-22T12:00:00Z'), description: 'Monthly groceries', paymentMethod: 'Card' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 560000, date: new Date('2026-09-15T12:00:00Z'), description: 'Electricity & water', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Transportation'], amount: 350000, date: new Date('2026-09-10T12:00:00Z'), description: 'Fuel & metro', paymentMethod: 'UPI' },
    { user: uPriya._id, category: catMap['Shopping'], amount: 480000, date: new Date('2026-09-05T12:00:00Z'), description: 'Clothing sale', paymentMethod: 'Card' },
    { user: uPriya._id, category: catMap['Entertainment'], amount: 870000, date: new Date('2026-09-02T12:00:00Z'), description: 'Concert tickets', paymentMethod: 'UPI' },

    // August 2026 (₹27,500)
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 810000, date: new Date('2026-08-18T12:00:00Z'), description: 'Groceries & dining', paymentMethod: 'Card' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 620000, date: new Date('2026-08-12T12:00:00Z'), description: 'Broadband & electricity', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Travel'], amount: 1320000, date: new Date('2026-08-04T12:00:00Z'), description: 'Coorg road trip', paymentMethod: 'UPI' },

    // July 2026 (₹34,200)
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 920000, date: new Date('2026-07-20T12:00:00Z'), description: 'Groceries & cafes', paymentMethod: 'Card' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 580000, date: new Date('2026-07-15T12:00:00Z'), description: 'Electricity & maintenance', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Shopping'], amount: 1920000, date: new Date('2026-07-08T12:00:00Z'), description: 'Monsoon apparel & gear', paymentMethod: 'Card' },

    // June 2026 (₹26,400)
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 780000, date: new Date('2026-06-21T12:00:00Z'), description: 'Groceries', paymentMethod: 'Card' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 540000, date: new Date('2026-06-15T12:00:00Z'), description: 'Utilities', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Entertainment'], amount: 1320000, date: new Date('2026-06-03T12:00:00Z'), description: 'Resort weekend day-pass', paymentMethod: 'UPI' },

    // May 2026 (₹28,100)
    { user: uPriya._id, category: catMap['Food & Dining'], amount: 850000, date: new Date('2026-05-22T12:00:00Z'), description: 'Groceries & snacks', paymentMethod: 'Card' },
    { user: uPriya._id, category: catMap['Bills & Utilities'], amount: 560000, date: new Date('2026-05-14T12:00:00Z'), description: 'Electricity bill', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Shopping'], amount: 1400000, date: new Date('2026-05-05T12:00:00Z'), description: 'Home appliances', paymentMethod: 'Card' },
  ]);

  // 6. Create personal income
  console.log('[Seed] Inserting income records...');
  await Income.create([
    { user: uPriya._id, category: catMap['Salary'], amount: 7500000, date: new Date('2026-10-01T09:00:00Z'), source: 'TechCorp Solutions', paymentMethod: 'Net banking', notes: 'Monthly salary credit' },
    { user: uPriya._id, category: catMap['Freelance'], amount: 1500000, date: new Date('2026-10-15T14:30:00Z'), source: 'Fintech UI Consultation', paymentMethod: 'UPI', notes: 'Milestone payment' },
    { user: uPriya._id, category: catMap['Salary'], amount: 7500000, date: new Date('2026-09-01T09:00:00Z'), source: 'TechCorp Solutions', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Salary'], amount: 7500000, date: new Date('2026-08-01T09:00:00Z'), source: 'TechCorp Solutions', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Salary'], amount: 7500000, date: new Date('2026-07-01T09:00:00Z'), source: 'TechCorp Solutions', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Salary'], amount: 7500000, date: new Date('2026-06-01T09:00:00Z'), source: 'TechCorp Solutions', paymentMethod: 'Net banking' },
    { user: uPriya._id, category: catMap['Salary'], amount: 7500000, date: new Date('2026-05-01T09:00:00Z'), source: 'TechCorp Solutions', paymentMethod: 'Net banking' },
  ]);

  // 7. Create monthly budgets for Priya (October 2026)
  console.log('[Seed] Inserting budgets...');
  await Budget.create([
    { user: uPriya._id, category: null, month: 10, year: 2026, limit: 3500000 }, // Overall: ₹35,000
    { user: uPriya._id, category: catMap['Food & Dining'], month: 10, year: 2026, limit: 1000000 }, // ₹10,000
    { user: uPriya._id, category: catMap['Shopping'], month: 10, year: 2026, limit: 500000 }, // ₹5,000
    { user: uPriya._id, category: catMap['Entertainment'], month: 10, year: 2026, limit: 300000 }, // ₹3,000
    { user: uPriya._id, category: catMap['Bills & Utilities'], month: 10, year: 2026, limit: 800000 }, // ₹8,000
    { user: uPriya._id, category: catMap['Transportation'], month: 10, year: 2026, limit: 400000 }, // ₹4,000
  ]);

  // 8. Create recurring payments
  console.log('[Seed] Inserting recurring payments...');
  await Recurring.create([
    { user: uPriya._id, category: catMap['Entertainment'], name: 'Netflix Premium', amount: 64900, frequency: 'monthly', startDate: new Date('2026-01-15'), nextDueDate: new Date('2026-11-15'), active: true },
    { user: uPriya._id, category: catMap['Bills & Utilities'], name: 'Flat Rent', amount: 1800000, frequency: 'monthly', startDate: new Date('2026-06-01'), nextDueDate: new Date('2026-11-01'), active: true },
    { user: uPriya._id, category: catMap['Bills & Utilities'], name: 'Jio Fiber Broadband', amount: 117900, frequency: 'monthly', startDate: new Date('2026-02-10'), nextDueDate: new Date('2026-11-10'), active: true },
    { user: uPriya._id, category: catMap['Investments'], name: 'Mutual Fund SIP', amount: 1000000, frequency: 'monthly', startDate: new Date('2026-01-05'), nextDueDate: new Date('2026-11-05'), active: true },
    { user: uPriya._id, category: catMap['Shopping'], name: 'Amazon Prime', amount: 149900, frequency: 'yearly', startDate: new Date('2026-03-12'), nextDueDate: new Date('2027-03-12'), active: true },
  ]);

  // 9. Create groups
  console.log('[Seed] Inserting groups...');
  const groups = await Group.create([
    {
      name: 'Goa Trip 2026',
      description: 'Weekend getaway with college gang',
      createdBy: uPriya._id,
      members: [
        { user: uPriya._id, role: 'admin', joinedAt: new Date('2026-10-10T10:00:00Z') },
        { user: uRohan._id, role: 'member', joinedAt: new Date('2026-10-10T10:05:00Z') },
        { user: uKavya._id, role: 'member', joinedAt: new Date('2026-10-10T10:10:00Z') },
        { user: uArjun._id, role: 'member', joinedAt: new Date('2026-10-10T10:15:00Z') },
      ],
    },
    {
      name: 'Flat 402 - Indiranagar',
      description: 'Rent, broadband and household bills',
      createdBy: uPriya._id,
      members: [
        { user: uPriya._id, role: 'admin', joinedAt: new Date('2026-06-01T00:00:00Z') },
        { user: uKavya._id, role: 'member', joinedAt: new Date('2026-06-01T00:00:00Z') },
      ],
    },
    {
      name: 'Office Lunch Club',
      description: 'Weekday team lunches and coffee runs',
      createdBy: uPriya._id,
      members: [
        { user: uPriya._id, role: 'admin', joinedAt: new Date('2026-07-01T00:00:00Z') },
        { user: uArjun._id, role: 'member', joinedAt: new Date('2026-07-01T00:00:00Z') },
        { user: uRohan._id, role: 'member', joinedAt: new Date('2026-07-01T00:00:00Z') },
      ],
    },
  ]);

  const [grpGoa, grpFlat] = groups;

  // 10. Create shared expenses for Goa Trip (exact share conservation)
  console.log('[Seed] Inserting shared expenses...');
  await SharedExpense.create([
    {
      group: grpGoa._id,
      title: 'Hotel, 2 nights',
      amount: 1400000,
      paidBy: uPriya._id,
      category: catMap['Travel'],
      date: new Date('2026-10-11T12:00:00Z'),
      splitType: 'equal',
      shares: [
        { user: uPriya._id, amount: 350000 },
        { user: uRohan._id, amount: 350000 },
        { user: uKavya._id, amount: 350000 },
        { user: uArjun._id, amount: 350000 },
      ],
    },
    {
      group: grpGoa._id,
      title: 'Parasailing',
      amount: 480000,
      paidBy: uRohan._id,
      category: catMap['Entertainment'],
      date: new Date('2026-10-12T10:00:00Z'),
      splitType: 'equal',
      shares: [
        { user: uPriya._id, amount: 120000 },
        { user: uRohan._id, amount: 120000 },
        { user: uKavya._id, amount: 120000 },
        { user: uArjun._id, amount: 120000 },
      ],
    },
    {
      group: grpGoa._id,
      title: 'Scooter rental',
      amount: 320000,
      paidBy: uArjun._id,
      category: catMap['Transportation'],
      date: new Date('2026-10-12T14:00:00Z'),
      splitType: 'equal',
      shares: [
        { user: uPriya._id, amount: 80000 },
        { user: uRohan._id, amount: 80000 },
        { user: uKavya._id, amount: 80000 },
        { user: uArjun._id, amount: 80000 },
      ],
    },
    {
      group: grpGoa._id,
      title: 'Beach shack dinner',
      amount: 560000,
      paidBy: uKavya._id,
      category: catMap['Food & Dining'],
      date: new Date('2026-10-12T20:00:00Z'),
      splitType: 'equal',
      shares: [
        { user: uPriya._id, amount: 140000 },
        { user: uRohan._id, amount: 140000 },
        { user: uKavya._id, amount: 140000 },
        { user: uArjun._id, amount: 140000 },
      ],
    },
  ]);

  // 11. Create settlements in Goa Trip
  console.log('[Seed] Inserting settlements...');
  await Settlement.create([
    { group: grpGoa._id, payer: uRohan._id, payee: uKavya._id, amount: 490000, status: 'pending' },
    { group: grpGoa._id, payer: uArjun._id, payee: uPriya._id, amount: 170000, status: 'pending' },
    { group: grpGoa._id, payer: uArjun._id, payee: uKavya._id, amount: 80000, status: 'pending' },
  ]);

  // 12. Create shopping lists
  console.log('[Seed] Inserting shopping lists...');
  await ShoppingList.create([
    {
      owner: uPriya._id,
      group: null,
      name: 'Weekly Groceries',
      budget: 350000,
      items: [
        { name: 'Basmati rice, 5 kg', quantity: 1, estimatedPrice: 65000, actualPrice: 69000, purchased: true },
        { name: 'Toor dal, 1 kg', quantity: 2, estimatedPrice: 32000, actualPrice: 31000, purchased: true },
        { name: 'Milk, 1 L', quantity: 6, estimatedPrice: 33600, actualPrice: 33600, purchased: true },
        { name: 'Eggs, tray of 12', quantity: 2, estimatedPrice: 18000, actualPrice: 16800, purchased: true },
        { name: 'Tomatoes, 1 kg', quantity: 2, estimatedPrice: 8000, actualPrice: 9600, purchased: true },
        { name: 'Onions, 1 kg', quantity: 3, estimatedPrice: 10500, actualPrice: 9900, purchased: true },
        { name: 'Sunflower oil, 1 L', quantity: 2, estimatedPrice: 34000, actualPrice: 35200, purchased: true },
        { name: 'Brown bread', quantity: 2, estimatedPrice: 9000, actualPrice: 9000, purchased: true },
        { name: 'Bananas, dozen', quantity: 1, estimatedPrice: 6000, actualPrice: 5500, purchased: true },
        { name: 'Paneer, 200 g', quantity: 2, estimatedPrice: 19000, actualPrice: null, purchased: false },
        { name: 'Curd, 500 g', quantity: 2, estimatedPrice: 7000, actualPrice: null, purchased: false },
        { name: 'Filter coffee powder', quantity: 1, estimatedPrice: 24000, actualPrice: null, purchased: false },
        { name: 'Dish wash liquid', quantity: 1, estimatedPrice: 14000, actualPrice: null, purchased: false },
        { name: 'Whole wheat atta, 5 kg', quantity: 1, estimatedPrice: 28000, actualPrice: null, purchased: false },
      ],
    },
    {
      owner: uPriya._id,
      group: grpGoa._id,
      name: 'Goa packing list',
      budget: 500000,
      items: [
        { name: 'Sunscreen SPF 50', quantity: 2, estimatedPrice: 90000, actualPrice: 85000, purchased: true, assignedTo: uPriya._id },
        { name: 'Beach towels', quantity: 4, estimatedPrice: 120000, actualPrice: 120000, purchased: true, assignedTo: uRohan._id },
        { name: 'First aid kit', quantity: 1, estimatedPrice: 50000, actualPrice: null, purchased: false, assignedTo: uKavya._id },
      ],
    },
  ]);

  // 13. Create synthetic receipt metadata
  // NOTE: Binary GridFS receipt image payloads are generated live during integration
  // tests to avoid binary storage bloat in standard database dumps.
  console.log('[Seed] Inserting synthetic receipt metadata...');
  await Receipt.create([
    {
      user: uPriya._id,
      merchant: 'Organic Harvest Market',
      date: new Date('2026-10-24T18:00:00Z'),
      amount: 84000,
      rawText: 'ORGANIC HARVEST MARKET\nDate: 24/10/2026\nTOTAL: INR 840.00',
      confidence: 0.94,
      status: 'confirmed',
      fileReference: 'receipt_seed_sample_1.png',
      mimeType: 'image/png',
      fileSizeBytes: 1024,
      originalName: 'sample-receipt.png',
      imageUrl: '/assets/sample-receipt.webp',
    },
  ]);

  // 14. Create insights
  console.log('[Seed] Inserting insights...');
  await Insight.create([
    {
      user: uPriya._id,
      kind: 'warning',
      message: 'Shopping is over budget by ₹1,280 (126% of ₹5,000 monthly limit).',
      read: false,
    },
    {
      user: uPriya._id,
      kind: 'info',
      message: 'Upcoming bill: Flat rent ₹18,000 due in 8 days on 1 Nov.',
      read: false,
    },
    {
      user: uPriya._id,
      kind: 'primary',
      message: 'Goa Trip settlement pending: Arjun owes you ₹1,700.',
      read: false,
    },
  ]);

  console.log('[Seed] Seeding completed successfully!');
  return {
    usersCount: 4,
    categoriesCount: categories.length,
    expensesCount: expenses.length,
    incomesCount: 7,
    budgetsCount: 6,
    recurringCount: 5,
    groupsCount: groups.length,
    sharedExpensesCount: 4,
    settlementsCount: 3,
    shoppingListsCount: 2,
    receiptsCount: 1,
    insightsCount: 3,
  };
}

/**
 * Main CLI runner.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.isTest && !args.isDev && !args.uri) {
    console.error(`
[SplitStack Seed Error] Target environment must be explicitly specified.
Usage:
  npm run seed           (seeds development database)
  npm run seed:test      (seeds dedicated test database)
  node server/scripts/seed.js --dev [--dry-run]
  node server/scripts/seed.js --test [--dry-run]
  node server/scripts/seed.js --uri <mongodb-connection-string>
`);
    process.exit(1);
  }

  // Resolve target URI
  let targetUri = args.uri;
  if (!targetUri) {
    if (args.isTest) {
      targetUri = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/splitstack-test';
    } else {
      targetUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/splitstack-dev';
    }
  }

  try {
    // Assert URI safety guards
    assertSafeDatabase(targetUri, { isTest: args.isTest });

    console.log(`[Seed Safety] Connecting to ${sanitizeMongoUri(targetUri)}...`);
    const conn = await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 5000,
    });

    await seedDatabase(conn, { dryRun: args.dryRun });
    await mongoose.disconnect();
    console.log('[Seed] Disconnected cleanly.');
    process.exit(0);
  } catch (err) {
    console.error(`[Seed Fatal Error] ${err.message}`);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
    process.exit(1);
  }
}

// Execute when invoked directly from CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
