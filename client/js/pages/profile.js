/**
 * Profile page module (Review 2, Steps P3 & P4).
 * Connects profile.html to api.js to render account information,
 * update profile details, change passwords with validation,
 * and handle session sign out and demo data resets.
 */

import {
  currentUser,
  listExpenses,
  listGroups,
  resetDemoData,
  logout,
  updateProfile,
  changePassword
} from '../data/api.js';
import { qs, on } from '../core/dom.js';
import { formatDate } from '../core/format.js';
import { getInitials } from '../ui/user.js';
import { showToast } from '../ui/toast.js';
import { setLoading } from '../core/render.js';
import {
  rupeesToPaise,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

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

    // Wire Save profile form
    const profileForm = qs('section[aria-labelledby="acct-title"] form');
    if (profileForm) {
      const submitBtn = qs('button[type="submit"]', profileForm);
      const nameInput = qs('#p-name', profileForm);
      const emailInput = qs('#p-email', profileForm);
      const budgetInput = qs('#p-budget', profileForm);

      on(profileForm, 'submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(profileForm);

        const name = nameInput?.value.trim() || '';
        const email = emailInput?.value.trim() || '';
        let hasError = false;

        if (!name || name.length < 2) {
          showFieldError(nameInput, 'Full name must be at least 2 characters');
          hasError = true;
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showFieldError(emailInput, 'Please enter a valid email address');
          hasError = true;
        }

        let monthlyBudgetPaise = 0;
        const budgetVal = budgetInput?.value.trim();
        if (budgetVal) {
          try {
            monthlyBudgetPaise = rupeesToPaise(budgetVal);
          } catch (err) {
            showFieldError(budgetInput, err.message);
            hasError = true;
          }
        }

        if (hasError) {
          focusFirstInvalid(profileForm);
          return;
        }

        setButtonLoading(submitBtn, true, 'Saving...');

        try {
          const updatedUser = await updateProfile({
            name,
            email,
            preferences: {
              ...(user.preferences || {}),
              monthlyBudget: monthlyBudgetPaise
            }
          });

          showToast('Profile updated successfully!', 'success');
          renderProfileData(updatedUser, expensesResult?.total || 0, groups?.length || 0);
        } catch (err) {
          showFieldError(nameInput, err.message || 'Failed to update profile');
          focusFirstInvalid(profileForm);
        } finally {
          setButtonLoading(submitBtn, false);
        }
      });
    }

    // Wire Change password form
    const passwordForm = qs('section[aria-labelledby="pw-title"] form');
    if (passwordForm) {
      const submitBtn = qs('button[type="submit"]', passwordForm);
      const currentPwInput = qs('#pw-current', passwordForm);
      const newPwInput = qs('#pw-new', passwordForm);
      const confirmPwInput = qs('#pw-confirm', passwordForm);

      on(passwordForm, 'submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(passwordForm);

        const currentPassword = currentPwInput?.value || '';
        const newPassword = newPwInput?.value || '';
        const confirmPassword = confirmPwInput?.value || '';
        let hasError = false;

        if (!currentPassword) {
          showFieldError(currentPwInput, 'Current password is required');
          hasError = true;
        }

        if (!newPassword || newPassword.length < 8) {
          showFieldError(newPwInput, 'New password must be at least 8 characters');
          hasError = true;
        }

        if (newPassword !== confirmPassword) {
          showFieldError(confirmPwInput, 'Passwords do not match');
          hasError = true;
        }

        if (hasError) {
          focusFirstInvalid(passwordForm);
          return;
        }

        setButtonLoading(submitBtn, true, 'Updating...');

        try {
          await changePassword({ currentPassword, newPassword });
          showToast('Password changed successfully!', 'success');
          passwordForm.reset();
        } catch (err) {
          if (err.field === 'currentPassword') {
            showFieldError(currentPwInput, err.message);
          } else {
            showFieldError(newPwInput, err.message || 'Failed to change password');
          }
          focusFirstInvalid(passwordForm);
        } finally {
          setButtonLoading(submitBtn, false);
        }
      });
    }

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
