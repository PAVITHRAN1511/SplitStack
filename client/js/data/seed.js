/**
 * Seed data transcribed from the Review 1 static HTML pages.
 * User: Priya Raman (demo@splitstack.app)
 * Month: October 2026 (+ 5 historical months for analytics)
 * Amounts stored as integer paise everywhere (e.g. ₹100 = 10000 paise).
 */

// Demo password hash for "Demo@1234" with salt "splitstack_demo_salt"
// SHA-256("splitstack_demo_salt:Demo@1234")
// NOTE: Client-side SHA-256 hashing is strictly for demo/localStorage mode.
// Review 3 Express + MongoDB backend must replace this with bcrypt (cost factor 12).
export const DEMO_SALT = 'splitstack_demo_salt';
export const DEMO_PASSWORD_HASH = 'ab43b00d4ac7588b530cee14d402eb14ea1db54980b32d263fddce87c452e059';

export function getInitialSeedData() {
  return {
    users: [
      {
        id: 'u_priya',
        name: 'Priya Raman',
        email: 'demo@splitstack.app',
        passwordHash: DEMO_PASSWORD_HASH,
        salt: DEMO_SALT,
        preferences: { theme: 'dark', currency: 'INR' },
        createdAt: '2026-05-01T00:00:00Z'
      },
      {
        id: 'u_rohan',
        name: 'Rohan Das',
        email: 'rohan.das@example.com',
        avatarColor: '#d97706',
        initials: 'RD',
        createdAt: '2026-05-01T00:00:00Z'
      },
      {
        id: 'u_kavya',
        name: 'Kavya Nair',
        email: 'kavya.nair@example.com',
        avatarColor: '#10b981',
        initials: 'KN',
        createdAt: '2026-05-01T00:00:00Z'
      },
      {
        id: 'u_arjun',
        name: 'Arjun Mehta',
        email: 'arjun.mehta@example.com',
        avatarColor: '#0ea5e9',
        initials: 'AM',
        createdAt: '2026-05-01T00:00:00Z'
      }
    ],

    categories: [
      // Expense categories
      { id: 'cat_food', userId: null, name: 'Food & Dining', type: 'expense', icon: 'mug-hot', color: '#f59e0b' },
      { id: 'cat_transport', userId: null, name: 'Transportation', type: 'expense', icon: 'car', color: '#3b82f6' },
      { id: 'cat_shopping', userId: null, name: 'Shopping', type: 'expense', icon: 'bag-shopping', color: '#ec4899' },
      { id: 'cat_bills', userId: null, name: 'Bills & Utilities', type: 'expense', icon: 'file-invoice', color: '#ef4444' },
      { id: 'cat_entertainment', userId: null, name: 'Entertainment', type: 'expense', icon: 'film', color: '#8b5cf6' },
      { id: 'cat_education', userId: null, name: 'Education', type: 'expense', icon: 'graduation-cap', color: '#10b981' },
      { id: 'cat_health', userId: null, name: 'Healthcare', type: 'expense', icon: 'heart-pulse', color: '#06b6d4' },
      { id: 'cat_travel', userId: null, name: 'Travel', type: 'expense', icon: 'plane', color: '#6366f1' },
      { id: 'cat_other', userId: null, name: 'Other', type: 'expense', icon: 'ellipsis', color: '#64748b' },
      // Income categories
      { id: 'cat_salary', userId: null, name: 'Salary', type: 'income', icon: 'briefcase', color: '#10b981' },
      { id: 'cat_freelance', userId: null, name: 'Freelance', type: 'income', icon: 'laptop-code', color: '#3b82f6' },
      { id: 'cat_investments', userId: null, name: 'Investments', type: 'income', icon: 'chart-line', color: '#8b5cf6' }
    ],

    expenses: [
      // October 2026 expenses (matching expenses.html and dashboard total ₹31,840 = 3,184,000 paise)
      { id: 'exp_1', userId: 'u_priya', categoryId: 'cat_food', amount: 84000, date: '2026-10-24', description: 'Swiggy · dinner', paymentMethod: 'UPI', notes: 'Dinner with family', createdAt: '2026-10-24T20:30:00Z' },
      { id: 'exp_2', userId: 'u_priya', categoryId: 'cat_transport', amount: 50000, date: '2026-10-23', description: 'Metro card recharge', paymentMethod: 'UPI', notes: '', createdAt: '2026-10-23T09:15:00Z' },
      { id: 'exp_3', userId: 'u_priya', categoryId: 'cat_bills', amount: 245000, date: '2026-10-22', description: 'TNEB electricity bill', paymentMethod: 'Net banking', notes: 'Consumer #09281', createdAt: '2026-10-22T14:00:00Z' },
      { id: 'exp_4', userId: 'u_priya', categoryId: 'cat_shopping', amount: 429900, date: '2026-10-20', description: 'Running shoes · Myntra', paymentMethod: 'Card', notes: 'Nike Pegasus', createdAt: '2026-10-20T18:45:00Z' },
      { id: 'exp_5', userId: 'u_priya', categoryId: 'cat_entertainment', amount: 112000, date: '2026-10-19', description: 'PVR · movie night', paymentMethod: 'UPI', notes: '2 tickets + popcorn', createdAt: '2026-10-19T21:00:00Z' },
      { id: 'exp_6', userId: 'u_priya', categoryId: 'cat_health', amount: 68000, date: '2026-10-18', description: 'Apollo Pharmacy', paymentMethod: 'Cash', notes: 'Vitamins', createdAt: '2026-10-18T11:20:00Z' },
      { id: 'exp_7', userId: 'u_priya', categoryId: 'cat_food', amount: 341000, date: '2026-10-17', description: 'Groceries · BigBasket', paymentMethod: 'Card', notes: 'Bi-weekly staples', createdAt: '2026-10-17T16:10:00Z' },
      { id: 'exp_8', userId: 'u_priya', categoryId: 'cat_transport', amount: 72000, date: '2026-10-15', description: 'Uber to airport', paymentMethod: 'UPI', notes: 'Morning flight', createdAt: '2026-10-15T05:30:00Z' },
      { id: 'exp_9', userId: 'u_priya', categoryId: 'cat_travel', amount: 185000, date: '2026-10-12', description: 'Weekend trip · bus tickets', paymentMethod: 'UPI', notes: 'KSRTC sleeper', createdAt: '2026-10-12T19:00:00Z' },
      { id: 'exp_10', userId: 'u_priya', categoryId: 'cat_bills', amount: 117900, date: '2026-10-10', description: 'Jio Fiber broadband', paymentMethod: 'UPI', notes: 'Monthly recharge', createdAt: '2026-10-10T10:00:00Z' },
      { id: 'exp_11', userId: 'u_priya', categoryId: 'cat_food', amount: 247000, date: '2026-10-08', description: 'Supermarket essentials', paymentMethod: 'Card', notes: '', createdAt: '2026-10-08T17:30:00Z' },
      { id: 'exp_12', userId: 'u_priya', categoryId: 'cat_bills', amount: 185100, date: '2026-10-06', description: 'Gas cylinder & utilities', paymentMethod: 'Net banking', notes: '', createdAt: '2026-10-06T12:00:00Z' },
      { id: 'exp_13', userId: 'u_priya', categoryId: 'cat_shopping', amount: 198100, date: '2026-10-05', description: 'Stationery and home desk decor', paymentMethod: 'UPI', notes: '', createdAt: '2026-10-05T14:20:00Z' },
      { id: 'exp_14', userId: 'u_priya', categoryId: 'cat_transport', amount: 163000, date: '2026-10-03', description: 'Petrol fill up', paymentMethod: 'UPI', notes: '', createdAt: '2026-10-03T08:45:00Z' },
      { id: 'exp_15', userId: 'u_priya', categoryId: 'cat_entertainment', amount: 133000, date: '2026-10-02', description: 'Board games cafe', paymentMethod: 'Cash', notes: '', createdAt: '2026-10-02T19:00:00Z' },
      { id: 'exp_16', userId: 'u_priya', categoryId: 'cat_food', amount: 544000, date: '2026-10-01', description: 'Organic farm basket', paymentMethod: 'UPI', notes: 'Monthly veggies', createdAt: '2026-10-01T10:00:00Z' },

      // Historical expenses (September 2026: ₹29,800)
      { id: 'exp_h1', userId: 'u_priya', categoryId: 'cat_food', amount: 720000, date: '2026-09-22', description: 'Monthly groceries', paymentMethod: 'Card', notes: '', createdAt: '2026-09-22T12:00:00Z' },
      { id: 'exp_h2', userId: 'u_priya', categoryId: 'cat_bills', amount: 560000, date: '2026-09-15', description: 'Electricity & water', paymentMethod: 'Net banking', notes: '', createdAt: '2026-09-15T12:00:00Z' },
      { id: 'exp_h3', userId: 'u_priya', categoryId: 'cat_transport', amount: 350000, date: '2026-09-10', description: 'Fuel & metro', paymentMethod: 'UPI', notes: '', createdAt: '2026-09-10T12:00:00Z' },
      { id: 'exp_h4', userId: 'u_priya', categoryId: 'cat_shopping', amount: 480000, date: '2026-09-05', description: 'Clothing sale', paymentMethod: 'Card', notes: '', createdAt: '2026-09-05T12:00:00Z' },
      { id: 'exp_h5', userId: 'u_priya', categoryId: 'cat_entertainment', amount: 870000, date: '2026-09-02', description: 'Concert tickets', paymentMethod: 'UPI', notes: '', createdAt: '2026-09-02T12:00:00Z' },

      // August 2026: ₹27,500
      { id: 'exp_h6', userId: 'u_priya', categoryId: 'cat_food', amount: 810000, date: '2026-08-18', description: 'Groceries & dining', paymentMethod: 'Card', notes: '', createdAt: '2026-08-18T12:00:00Z' },
      { id: 'exp_h7', userId: 'u_priya', categoryId: 'cat_bills', amount: 620000, date: '2026-08-12', description: 'Broadband & electricity', paymentMethod: 'Net banking', notes: '', createdAt: '2026-08-12T12:00:00Z' },
      { id: 'exp_h8', userId: 'u_priya', categoryId: 'cat_travel', amount: 1320000, date: '2026-08-04', description: 'Coorg road trip', paymentMethod: 'UPI', notes: '', createdAt: '2026-08-04T12:00:00Z' },

      // July 2026: ₹32,100
      { id: 'exp_h9', userId: 'u_priya', categoryId: 'cat_food', amount: 890000, date: '2026-07-20', description: 'Groceries', paymentMethod: 'Card', notes: '', createdAt: '2026-07-20T12:00:00Z' },
      { id: 'exp_h10', userId: 'u_priya', categoryId: 'cat_shopping', amount: 1450000, date: '2026-07-14', description: 'Ergonomic chair', paymentMethod: 'Card', notes: '', createdAt: '2026-07-14T12:00:00Z' },
      { id: 'exp_h11', userId: 'u_priya', categoryId: 'cat_bills', amount: 870000, date: '2026-07-08', description: 'Quarterly insurance', paymentMethod: 'Net banking', notes: '', createdAt: '2026-07-08T12:00:00Z' },

      // June 2026: ₹28,400
      { id: 'exp_h12', userId: 'u_priya', categoryId: 'cat_food', amount: 780000, date: '2026-06-25', description: 'Staples & dining', paymentMethod: 'UPI', notes: '', createdAt: '2026-06-25T12:00:00Z' },
      { id: 'exp_h13', userId: 'u_priya', categoryId: 'cat_bills', amount: 560000, date: '2026-06-15', description: 'Utilities', paymentMethod: 'Net banking', notes: '', createdAt: '2026-06-15T12:00:00Z' },
      { id: 'exp_h14', userId: 'u_priya', categoryId: 'cat_education', amount: 1500000, date: '2026-06-05', description: 'Web Dev certification course', paymentMethod: 'Card', notes: '', createdAt: '2026-06-05T12:00:00Z' },

      // May 2026: ₹26,900
      { id: 'exp_h15', userId: 'u_priya', categoryId: 'cat_food', amount: 760000, date: '2026-05-20', description: 'Monthly groceries', paymentMethod: 'UPI', notes: '', createdAt: '2026-05-20T12:00:00Z' },
      { id: 'exp_h16', userId: 'u_priya', categoryId: 'cat_bills', amount: 530000, date: '2026-05-12', description: 'Broadband and power', paymentMethod: 'Net banking', notes: '', createdAt: '2026-05-12T12:00:00Z' },
      { id: 'exp_h17', userId: 'u_priya', categoryId: 'cat_transport', amount: 1400000, date: '2026-05-02', description: 'Car annual servicing', paymentMethod: 'Card', notes: '', createdAt: '2026-05-02T12:00:00Z' }
    ],

    income: [
      // October 2026 income (matching income.html and dashboard: ₹73,500 = 7,350,000 paise)
      { id: 'inc_1', userId: 'u_priya', categoryId: 'cat_salary', amount: 6500000, date: '2026-10-01', source: 'Monthly salary', paymentMethod: 'Net banking', notes: 'Tech Corp India Ltd', createdAt: '2026-10-01T08:00:00Z' },
      { id: 'inc_2', userId: 'u_priya', categoryId: 'cat_freelance', amount: 850000, date: '2026-10-14', source: 'Logo design project', paymentMethod: 'UPI', notes: 'Design sprint client', createdAt: '2026-10-14T15:30:00Z' },

      // Historical income
      { id: 'inc_h1', userId: 'u_priya', categoryId: 'cat_salary', amount: 6500000, date: '2026-09-01', source: 'Monthly salary', paymentMethod: 'Net banking', notes: '', createdAt: '2026-09-01T08:00:00Z' },
      { id: 'inc_h2', userId: 'u_priya', categoryId: 'cat_investments', amount: 320000, date: '2026-09-18', source: 'Mutual fund dividend', paymentMethod: 'Net banking', notes: '', createdAt: '2026-09-18T10:00:00Z' },
      { id: 'inc_h3', userId: 'u_priya', categoryId: 'cat_salary', amount: 6500000, date: '2026-08-01', source: 'Monthly salary', paymentMethod: 'Net banking', notes: '', createdAt: '2026-08-01T08:00:00Z' },
      { id: 'inc_h4', userId: 'u_priya', categoryId: 'cat_salary', amount: 6500000, date: '2026-07-01', source: 'Monthly salary', paymentMethod: 'Net banking', notes: '', createdAt: '2026-07-01T08:00:00Z' },
      { id: 'inc_h5', userId: 'u_priya', categoryId: 'cat_freelance', amount: 500000, date: '2026-07-15', source: 'Website copywriting', paymentMethod: 'UPI', notes: '', createdAt: '2026-07-15T12:00:00Z' },
      { id: 'inc_h6', userId: 'u_priya', categoryId: 'cat_salary', amount: 6500000, date: '2026-06-01', source: 'Monthly salary', paymentMethod: 'Net banking', notes: '', createdAt: '2026-06-01T08:00:00Z' },
      { id: 'inc_h7', userId: 'u_priya', categoryId: 'cat_salary', amount: 6500000, date: '2026-05-01', source: 'Monthly salary', paymentMethod: 'Net banking', notes: '', createdAt: '2026-05-01T08:00:00Z' }
    ],

    budgets: [
      // October 2026 category limits (matching budgets.html)
      { id: 'b_overall', userId: 'u_priya', categoryId: null, month: 10, year: 2026, limit: 4000000 },
      { id: 'b_food', userId: 'u_priya', categoryId: 'cat_food', month: 10, year: 2026, limit: 1000000 },
      { id: 'b_shopping', userId: 'u_priya', categoryId: 'cat_shopping', month: 10, year: 2026, limit: 500000 },
      { id: 'b_transport', userId: 'u_priya', categoryId: 'cat_transport', month: 10, year: 2026, limit: 400000 },
      { id: 'b_bills', userId: 'u_priya', categoryId: 'cat_bills', month: 10, year: 2026, limit: 600000 },
      { id: 'b_entertainment', userId: 'u_priya', categoryId: 'cat_entertainment', month: 10, year: 2026, limit: 350000 },
      { id: 'b_health', userId: 'u_priya', categoryId: 'cat_health', month: 10, year: 2026, limit: 300000 }
    ],

    recurring: [
      // Recurring payments (matching recurring.html)
      { id: 'rec_1', userId: 'u_priya', name: 'Flat rent', amount: 1800000, categoryId: 'cat_bills', frequency: 'monthly', startDate: '2026-01-01', nextDueDate: '2026-11-01', active: true },
      { id: 'rec_2', userId: 'u_priya', name: 'Jio Fiber broadband', amount: 117900, categoryId: 'cat_bills', frequency: 'monthly', startDate: '2026-03-10', nextDueDate: '2026-11-10', active: true },
      { id: 'rec_3', userId: 'u_priya', name: 'Netflix', amount: 64900, categoryId: 'cat_entertainment', frequency: 'monthly', startDate: '2026-02-14', nextDueDate: '2026-11-14', active: true },
      { id: 'rec_4', userId: 'u_priya', name: 'Gym membership', amount: 250000, categoryId: 'cat_health', frequency: 'monthly', startDate: '2026-04-20', nextDueDate: '2026-11-20', active: false },
      { id: 'rec_5', userId: 'u_priya', name: 'Car insurance', amount: 840000, categoryId: 'cat_transport', frequency: 'yearly', startDate: '2026-01-18', nextDueDate: '2027-01-18', active: true },
      { id: 'rec_6', userId: 'u_priya', name: 'Amazon Prime', amount: 149900, categoryId: 'cat_shopping', frequency: 'yearly', startDate: '2026-03-12', nextDueDate: '2027-03-12', active: true }
    ],

    groups: [
      {
        id: 'grp_goa',
        name: 'Goa Trip 2026',
        description: 'Weekend getaway with college gang',
        createdBy: 'u_priya',
        createdAt: '2026-10-10T10:00:00Z',
        members: [
          { userId: 'u_priya', name: 'Priya Raman', email: 'demo@splitstack.app', role: 'admin', joinedAt: '2026-10-10T10:00:00Z' },
          { userId: 'u_rohan', name: 'Rohan Das', email: 'rohan.das@example.com', role: 'member', joinedAt: '2026-10-10T10:05:00Z' },
          { userId: 'u_kavya', name: 'Kavya Nair', email: 'kavya.nair@example.com', role: 'member', joinedAt: '2026-10-10T10:10:00Z' },
          { userId: 'u_arjun', name: 'Arjun Mehta', email: 'arjun.mehta@example.com', role: 'member', joinedAt: '2026-10-10T10:15:00Z' }
        ]
      },
      {
        id: 'grp_flat',
        name: 'Flat 402 - Indiranagar',
        description: 'Rent, broadband and household bills',
        createdBy: 'u_priya',
        createdAt: '2026-06-01T00:00:00Z',
        members: [
          { userId: 'u_priya', name: 'Priya Raman', email: 'demo@splitstack.app', role: 'admin', joinedAt: '2026-06-01T00:00:00Z' },
          { userId: 'u_kavya', name: 'Kavya Nair', email: 'kavya.nair@example.com', role: 'member', joinedAt: '2026-06-01T00:00:00Z' }
        ]
      },
      {
        id: 'grp_office',
        name: 'Office Lunch Club',
        description: 'Weekday team lunches and coffee runs',
        createdBy: 'u_priya',
        createdAt: '2026-07-01T00:00:00Z',
        members: [
          { userId: 'u_priya', name: 'Priya Raman', email: 'demo@splitstack.app', role: 'admin', joinedAt: '2026-07-01T00:00:00Z' },
          { userId: 'u_arjun', name: 'Arjun Mehta', email: 'arjun.mehta@example.com', role: 'member', joinedAt: '2026-07-01T00:00:00Z' },
          { userId: 'u_rohan', name: 'Rohan Das', email: 'rohan.das@example.com', role: 'member', joinedAt: '2026-07-01T00:00:00Z' }
        ]
      }
    ],

    sharedExpenses: [
      // Goa Trip shared expenses (matching group-detail.html)
      {
        id: 'sexp_1',
        groupId: 'grp_goa',
        title: 'Hotel, 2 nights',
        amount: 1400000,
        paidBy: 'u_priya',
        categoryId: 'cat_travel',
        date: '2026-10-11',
        splitType: 'equal',
        shares: [
          { userId: 'u_priya', amount: 350000 },
          { userId: 'u_rohan', amount: 350000 },
          { userId: 'u_kavya', amount: 350000 },
          { userId: 'u_arjun', amount: 350000 }
        ]
      },
      {
        id: 'sexp_2',
        groupId: 'grp_goa',
        title: 'Parasailing',
        amount: 480000,
        paidBy: 'u_rohan',
        categoryId: 'cat_entertainment',
        date: '2026-10-12',
        splitType: 'equal',
        shares: [
          { userId: 'u_priya', amount: 120000 },
          { userId: 'u_rohan', amount: 120000 },
          { userId: 'u_kavya', amount: 120000 },
          { userId: 'u_arjun', amount: 120000 }
        ]
      },
      {
        id: 'sexp_3',
        groupId: 'grp_goa',
        title: 'Scooter rental',
        amount: 320000,
        paidBy: 'u_arjun',
        categoryId: 'cat_transport',
        date: '2026-10-12',
        splitType: 'equal',
        shares: [
          { userId: 'u_priya', amount: 80000 },
          { userId: 'u_rohan', amount: 80000 },
          { userId: 'u_kavya', amount: 80000 },
          { userId: 'u_arjun', amount: 80000 }
        ]
      },
      {
        id: 'sexp_4',
        groupId: 'grp_goa',
        title: 'Beach shack dinner',
        amount: 560000,
        paidBy: 'u_kavya',
        categoryId: 'cat_food',
        date: '2026-10-12',
        splitType: 'equal',
        shares: [
          { userId: 'u_priya', amount: 140000 },
          { userId: 'u_rohan', amount: 140000 },
          { userId: 'u_kavya', amount: 140000 },
          { userId: 'u_arjun', amount: 140000 }
        ]
      }
    ],

    settlements: [
      // Simplified settlement plan matching settlements.html:
      // Rohan pays Kavya ₹4,900
      // Arjun pays Priya ₹1,700
      // Arjun pays Kavya ₹800
      { id: 'stl_1', groupId: 'grp_goa', payerId: 'u_rohan', payeeId: 'u_kavya', amount: 490000, status: 'pending', completedAt: null },
      { id: 'stl_2', groupId: 'grp_goa', payerId: 'u_arjun', payeeId: 'u_priya', amount: 170000, status: 'pending', completedAt: null },
      { id: 'stl_3', groupId: 'grp_goa', payerId: 'u_arjun', payeeId: 'u_kavya', amount: 80000, status: 'pending', completedAt: null }
    ],

    shoppingLists: [
      {
        id: 'shop_1',
        ownerId: 'u_priya',
        groupId: null,
        name: 'Weekly Groceries',
        budget: 350000,
        convertedExpenseId: null,
        createdAt: '2026-10-22T10:00:00Z',
        items: [
          { id: 'item_1', name: 'Basmati rice, 5 kg', quantity: 1, estimatedPrice: 65000, actualPrice: 69000, purchased: true, assignedTo: null },
          { id: 'item_2', name: 'Toor dal, 1 kg', quantity: 2, estimatedPrice: 32000, actualPrice: 31000, purchased: true, assignedTo: null },
          { id: 'item_3', name: 'Milk, 1 L', quantity: 6, estimatedPrice: 33600, actualPrice: 33600, purchased: true, assignedTo: null },
          { id: 'item_4', name: 'Eggs, tray of 12', quantity: 2, estimatedPrice: 18000, actualPrice: 16800, purchased: true, assignedTo: null },
          { id: 'item_5', name: 'Tomatoes, 1 kg', quantity: 2, estimatedPrice: 8000, actualPrice: 9600, purchased: true, assignedTo: null },
          { id: 'item_6', name: 'Onions, 1 kg', quantity: 3, estimatedPrice: 10500, actualPrice: 9900, purchased: true, assignedTo: null },
          { id: 'item_7', name: 'Sunflower oil, 1 L', quantity: 2, estimatedPrice: 34000, actualPrice: 35200, purchased: true, assignedTo: null },
          { id: 'item_8', name: 'Brown bread', quantity: 2, estimatedPrice: 9000, actualPrice: 9000, purchased: true, assignedTo: null },
          { id: 'item_9', name: 'Bananas, dozen', quantity: 1, estimatedPrice: 6000, actualPrice: 5500, purchased: true, assignedTo: null },
          { id: 'item_10', name: 'Paneer, 200 g', quantity: 2, estimatedPrice: 19000, actualPrice: null, purchased: false, assignedTo: null },
          { id: 'item_11', name: 'Curd, 500 g', quantity: 2, estimatedPrice: 7000, actualPrice: null, purchased: false, assignedTo: null },
          { id: 'item_12', name: 'Filter coffee powder', quantity: 1, estimatedPrice: 24000, actualPrice: null, purchased: false, assignedTo: null },
          { id: 'item_13', name: 'Dish wash liquid', quantity: 1, estimatedPrice: 14000, actualPrice: null, purchased: false, assignedTo: null },
          { id: 'item_14', name: 'Whole wheat atta, 5 kg', quantity: 1, estimatedPrice: 28000, actualPrice: null, purchased: false, assignedTo: null }
        ]
      },
      {
        id: 'shop_2',
        ownerId: 'u_priya',
        groupId: 'grp_goa',
        name: 'Goa packing list',
        budget: 500000,
        convertedExpenseId: null,
        createdAt: '2026-10-10T10:00:00Z',
        items: [
          { id: 'item_g1', name: 'Sunscreen SPF 50', quantity: 2, estimatedPrice: 90000, actualPrice: 85000, purchased: true, assignedTo: 'u_priya' },
          { id: 'item_g2', name: 'Beach towels', quantity: 4, estimatedPrice: 120000, actualPrice: 120000, purchased: true, assignedTo: 'u_rohan' },
          { id: 'item_g3', name: 'First aid kit', quantity: 1, estimatedPrice: 50000, actualPrice: null, purchased: false, assignedTo: 'u_kavya' }
        ]
      },
      {
        id: 'shop_3',
        ownerId: 'u_priya',
        groupId: null,
        name: 'Diwali home decor',
        budget: 400000,
        convertedExpenseId: null,
        createdAt: '2026-10-20T10:00:00Z',
        items: [
          { id: 'item_d1', name: 'Clay diyas, pack of 20', quantity: 2, estimatedPrice: 40000, actualPrice: null, purchased: false, assignedTo: null },
          { id: 'item_d2', name: 'Fairy lights, warm white', quantity: 4, estimatedPrice: 120000, actualPrice: null, purchased: false, assignedTo: null }
        ]
      }
    ],

    receipts: [
      {
        id: 'rec_sample_1',
        userId: 'u_priya',
        merchant: 'Organic Harvest Market',
        date: '2026-10-24',
        amount: 84000,
        rawText: 'ORGANIC HARVEST MARKET\nDate: 24/10/2026\nTOTAL: INR 840.00',
        confidence: 0.94,
        status: 'confirmed',
        imageUrl: '../assets/sample-receipt.webp'
      }
    ],

    insights: [
      {
        id: 'ins_1',
        userId: 'u_priya',
        kind: 'warning',
        message: 'Shopping is over budget by ₹1,280 (126% of ₹5,000 monthly limit).',
        read: false,
        createdAt: '2026-10-24T10:00:00Z'
      },
      {
        id: 'ins_2',
        userId: 'u_priya',
        kind: 'info',
        message: 'Upcoming bill: Flat rent ₹18,000 due in 8 days on 1 Nov.',
        read: false,
        createdAt: '2026-10-24T09:00:00Z'
      },
      {
        id: 'ins_3',
        userId: 'u_priya',
        kind: 'primary',
        message: 'Goa Trip settlement pending: Arjun owes you ₹1,700.',
        read: false,
        createdAt: '2026-10-24T08:00:00Z'
      }
    ]
  };
}
