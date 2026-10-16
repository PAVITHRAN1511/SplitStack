/**
 * Profile page module (Review 2, Step P3).
 * Connects profile.html to api.js to render account information,
 * summary counts, and the "Reset demo data" action.
 */

import { currentUser, listExpenses, listGroups, resetDemoData, logout } from '../data/api.js';
import { qs, on } from '../core/dom.js';
import { formatDate } from '../core/format.js';
import { getInitials } from '../ui/user.js';
import { showToast } from '../ui/toast.js';
import { setLoading } from '../core/render.js';

/**
 * Render user profile fields and statistics.
 * @param {Object} user
 * @param {number} expensesCount
 * @param {number} groupsCount
 */
function renderProfileData(user, expensesCount, groupsCount) {
  if (!user) return;

  // Header avatar, name, email
  const avatarEl = qs('.profile-head .avatar');
  const nameEl = qs('.profile-head .text-main');
  const emailEl = qs('.profile-head .text-sm');

  if (avatarEl) {
    avatarEl.textContent = getInitials(user.name);
    avatarEl.setAttribute('title', user.name);
  }
  if (nameEl) nameEl.textContent = user.name;
  if (emailEl) emailEl.textContent = user.email;

  // Form input defaults
  const nameInput = qs('#p-name');
  const emailInput = qs('#p-email');
  const budgetInput = qs('#p-budget');

  if (nameInput) nameInput.value = user.name || '';
  if (emailInput) emailInput.value = user.email || '';
  if (budgetInput && user.preferences?.monthlyBudget) {
    budgetInput.value = String(Math.round(user.preferences.monthlyBudget / 100));
  }

  // Account details stats (dl.kv)
  const memberSinceDd = qs('.card[aria-labelledby="stats-title"] dl.kv dd:nth-of-type(1)');
  const expensesDd = qs('.card[aria-labelledby="stats-title"] dl.kv dd:nth-of-type(2)');
  const groupsDd = qs('.card[aria-labelledby="stats-title"] dl.kv dd:nth-of-type(3)');

  if (memberSinceDd && user.createdAt) {
    memberSinceDd.textContent = formatDate(user.createdAt);
  }
  if (expensesDd) {
    expensesDd.textContent = String(expensesCount);
  }
  if (groupsDd) {
    groupsDd.textContent = String(groupsCount);
  }
}

/**
 * Initialize profile page module.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  try {
    const [user, expensesResult, groups] = await Promise.all([
      currentUser(),
      listExpenses({ limit: 1 }),
      listGroups()
    ]);

    renderProfileData(user, expensesResult?.total || 0, groups?.length || 0);

    // Reset demo data button handler
    const resetBtn = qs('#reset-demo-btn');
    if (resetBtn) {
      on(resetBtn, 'click', async () => {
        try {
          await resetDemoData();
          showToast('Demo data reset to initial sample seed.', 'success');
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } catch (err) {
          console.warn('[SplitStack] Error resetting demo data:', err);
          showToast('Failed to reset demo data.', 'error');
        }
      });
    }

    // Sign out button handler
    const signOutBtn = qs('.danger-zone a[href="login.html"]');
    if (signOutBtn) {
      on(signOutBtn, 'click', async (e) => {
        e.preventDefault();
        try {
          await logout();
        } catch {
          // Continue to login
        }
        window.location.href = 'login.html';
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading profile page:', err);
  } finally {
    setLoading(main, false);
  }
}
