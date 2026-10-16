/**
 * Updates topbar and sidebar user profile elements with active session data.
 */

import { currentUser } from '../data/api.js';
import { qs, qsa } from '../core/dom.js';

/**
 * Generate 1-2 character uppercase initials from a name.
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name) {
  if (!name || typeof name !== 'string') return 'SS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Initialize current user display across topbar, sidebar, and headers.
 * Safe to call on any page (no-op if user elements are not present).
 */
export async function initUser() {
  try {
    const user = await currentUser();
    if (!user) return;

    const initials = getInitials(user.name);

    // Sidebar footer
    const sidebarName = qs('.sidebar-footer .user-name');
    if (sidebarName) sidebarName.textContent = user.name;

    const sidebarEmail = qs('.sidebar-footer .user-email');
    if (sidebarEmail) sidebarEmail.textContent = user.email;

    const sidebarAvatar = qs('.sidebar-footer .avatar');
    if (sidebarAvatar) sidebarAvatar.textContent = initials;

    // Topbar avatar
    qsa('.topbar .avatar').forEach((el) => {
      el.textContent = initials;
      el.setAttribute('title', user.name);
      el.setAttribute('aria-label', `Your profile, ${user.name}`);
    });
  } catch (err) {
    console.warn('[SplitStack] Error initializing user header:', err);
  }
}
