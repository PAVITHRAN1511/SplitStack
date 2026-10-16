/**
 * In-app notifications UI component (Review 2, Step P6).
 * Wires the topbar bell icon to live notifications derived from smart insights
 * and financial events, with unread badge indicator, dropdown panel, and
 * read-state persistence in localStorage via api.js.
 */

import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../data/api.js';
import { qs, on, createEl } from '../core/dom.js';

let notifDropdownEl = null;

/**
 * Format relative or short date string for notifications.
 * @param {string} isoString
 * @returns {string}
 */
function formatTime(isoString) {
  if (!isoString) return 'Just now';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Recently';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Update the topbar bell icon unread indicator and aria-label.
 * @param {HTMLElement} bellBtn
 * @param {number} unreadCount
 */
export function updateBellBadge(bellBtn, unreadCount) {
  if (!bellBtn) return;

  let dot = bellBtn.querySelector('.dot');

  if (unreadCount > 0) {
    if (!dot) {
      dot = createEl('span', { className: 'dot' });
      bellBtn.appendChild(dot);
    }
    dot.style.display = '';
    bellBtn.setAttribute('aria-label', `Notifications, ${unreadCount} new`);
    bellBtn.setAttribute('title', `Notifications (${unreadCount} unread)`);
  } else {
    if (dot) {
      dot.style.display = 'none';
    }
    bellBtn.setAttribute('aria-label', 'Notifications');
    bellBtn.setAttribute('title', 'Notifications');
  }
}

/**
 * Close the notifications dropdown panel.
 * @param {HTMLElement} [bellBtn]
 */
export function closeNotifications(bellBtn) {
  if (notifDropdownEl && notifDropdownEl.parentNode) {
    notifDropdownEl.parentNode.removeChild(notifDropdownEl);
  }
  notifDropdownEl = null;
  if (bellBtn) {
    bellBtn.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Render and toggle the notifications dropdown panel.
 * @param {HTMLElement} bellBtn
 */
export async function toggleNotifications(bellBtn) {
  if (notifDropdownEl) {
    closeNotifications(bellBtn);
    return;
  }

  const { notifications, unreadCount } = await getNotifications();
  updateBellBadge(bellBtn, unreadCount);

  const container = bellBtn.parentElement;
  if (!container) return;

  notifDropdownEl = createEl('div', {
    className: 'notifications-dropdown',
    role: 'dialog',
    'aria-label': 'Notifications panel'
  });

  // Header
  const markAllBtn = createEl('button', {
    className: 'btn btn-ghost btn-sm',
    type: 'button',
    textContent: 'Mark all as read'
  });

  const header = createEl('div', { className: 'notif-header' }, [
    createEl('h3', { textContent: 'Notifications' }),
    unreadCount > 0 ? markAllBtn : null
  ].filter(Boolean));

  on(markAllBtn, 'click', async () => {
    await markAllNotificationsRead();
    updateBellBadge(bellBtn, 0);
    const items = notifDropdownEl?.querySelectorAll('.notif-item');
    items?.forEach((it) => it.classList.add('is-read'));
    markAllBtn.remove();
  });

  // List
  const listEl = createEl('ul', { className: 'notif-list' });

  if (!notifications || notifications.length === 0) {
    listEl.appendChild(createEl('li', {
      className: 'notif-empty',
      textContent: 'You have no notifications.'
    }));
  } else {
    for (const item of notifications) {
      const tone = item.kind === 'danger' ? 'danger' :
                   item.kind === 'warning' ? 'warning' :
                   item.kind === 'info' ? 'info' : 'success';

      const iconClass = tone === 'danger' || tone === 'warning' ? 'fa-triangle-exclamation' :
                        tone === 'info' ? 'fa-arrow-trend-up' : 'fa-piggy-bank';

      const li = createEl('li', {
        className: `notif-item ${item.read ? 'is-read' : ''}`
      }, [
        createEl('span', { className: `notif-icon tone-${tone}` }, [
          createEl('i', { className: `fa-solid ${iconClass}`, 'aria-hidden': 'true' })
        ]),
        createEl('div', { className: 'notif-body' }, [
          createEl('div', { className: 'notif-title', textContent: item.title }),
          createEl('div', { className: 'notif-msg', textContent: item.message }),
          createEl('div', { className: 'notif-time', textContent: formatTime(item.timestamp) })
        ])
      ]);

      on(li, 'click', async () => {
        if (!item.read) {
          await markNotificationRead(item.id);
          li.classList.add('is-read');
          item.read = true;
          const remaining = notifications.filter((n) => !n.read).length;
          updateBellBadge(bellBtn, remaining);
          if (remaining === 0 && markAllBtn.parentNode) {
            markAllBtn.remove();
          }
        }
      });

      listEl.appendChild(li);
    }
  }

  notifDropdownEl.append(header, listEl);
  container.appendChild(notifDropdownEl);
  bellBtn.setAttribute('aria-expanded', 'true');
}

/**
 * Initialize notifications UI and bell click listener.
 */
export async function initNotifications() {
  const bellBtn = qs('.topbar-actions a.icon-btn[href*="insights"], .topbar-actions a.icon-btn[aria-label*="Notifications"]');
  if (!bellBtn) return;

  // Set initial state
  try {
    const { unreadCount } = await getNotifications();
    updateBellBadge(bellBtn, unreadCount);
  } catch (err) {
    console.warn('[SplitStack] Error loading notifications:', err);
  }

  bellBtn.setAttribute('aria-haspopup', 'dialog');
  bellBtn.setAttribute('aria-expanded', 'false');

  on(bellBtn, 'click', (e) => {
    e.preventDefault();
    toggleNotifications(bellBtn);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (notifDropdownEl && !notifDropdownEl.contains(e.target) && !bellBtn.contains(e.target)) {
      closeNotifications(bellBtn);
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifDropdownEl) {
      closeNotifications(bellBtn);
      bellBtn.focus();
    }
  });
}
