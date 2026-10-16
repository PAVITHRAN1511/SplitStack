/**
 * Currency and date formatting helpers.
 * Adheres to Indian locale formatting rules and integer paise convention.
 */

/**
 * Format integer paise into Indian Rupee currency string.
 * @param {number} paise - Amount in integer paise (e.g. 10000 = ₹100)
 * @param {Intl.NumberFormatOptions} [options={}] - Custom formatting options
 * @returns {string}
 */
export function formatINR(paise, options = {}) {
  const num = Number(paise);
  const safePaise = isNaN(num) ? 0 : Math.round(num);
  const rupees = safePaise / 100;
  const isWhole = Math.abs(safePaise) % 100 === 0;

  const defaultOpts = {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: isWhole ? 0 : 2,
    minimumFractionDigits: isWhole ? 0 : 2
  };

  return new Intl.NumberFormat('en-IN', { ...defaultOpts, ...options }).format(rupees);
}

/**
 * Format a Date object or ISO string into a clean date string.
 * @param {Date|string|number} date - Date to format
 * @param {Intl.DateTimeFormatOptions} [options={}] - Custom options
 * @returns {string}
 */
export function formatDate(date, options = {}) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const defaultOpts = {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  };

  return new Intl.DateTimeFormat('en-IN', { ...defaultOpts, ...options }).format(d);
}

/**
 * Format a date as a human-friendly relative string (e.g. "Today", "Yesterday", "In 3 days").
 * @param {Date|string|number} date - Date to format
 * @returns {string}
 */
export function formatRelativeDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffMs = startOfTarget.getTime() - startOfToday.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 30) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -30) return `${Math.abs(diffDays)} days ago`;

  return formatDate(d);
}
