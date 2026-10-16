/**
 * Accessible toast notifications.
 * Uses role="status" and aria-live="polite".
 * Includes auto-dismiss and keyboard-accessible dismiss buttons.
 */

let containerEl = null;

function getOrCreateContainer() {
  if (!containerEl || !document.body.contains(containerEl)) {
    containerEl = document.getElementById('toast-container');
    if (!containerEl) {
      containerEl = document.createElement('div');
      containerEl.id = 'toast-container';
      containerEl.className = 'toast-container';
      containerEl.setAttribute('aria-live', 'polite');
      containerEl.setAttribute('aria-atomic', 'true');
      document.body.appendChild(containerEl);
    }
  }
  return containerEl;
}

const ICON_MAP = {
  success: 'fa-circle-check',
  danger: 'fa-circle-exclamation',
  error: 'fa-circle-exclamation',
  warning: 'fa-triangle-exclamation',
  info: 'fa-circle-info'
};

/**
 * Display a toast notification.
 * @param {string} message - Message text to display (inserted as textContent)
 * @param {'success'|'danger'|'error'|'warning'|'info'} [type='info'] - Tone
 * @param {number} [duration=4000] - Duration in ms before auto-dismiss
 * @returns {HTMLDivElement} The toast element
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = getOrCreateContainer();
  const normalizedType = type === 'error' ? 'danger' : type;

  const toast = document.createElement('div');
  toast.className = `toast toast-${normalizedType}`;
  toast.setAttribute('role', 'status');

  const iconName = ICON_MAP[normalizedType] || ICON_MAP.info;

  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML = `<i class="fa-solid ${iconName}"></i>`;

  const msgEl = document.createElement('div');
  msgEl.className = 'toast-msg';
  msgEl.textContent = String(message);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

  toast.appendChild(iconEl);
  toast.appendChild(msgEl);
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  let timer = null;

  function dismiss() {
    if (timer) clearTimeout(timer);
    toast.classList.add('toast-exit');
    toast.addEventListener(
      'animationend',
      () => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      },
      { once: true }
    );
    // Fallback if animation doesn't fire
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    dismiss();
  });

  if (duration > 0) {
    timer = setTimeout(dismiss, duration);

    // Pause on hover
    toast.addEventListener('mouseenter', () => {
      if (timer) clearTimeout(timer);
    });
    toast.addEventListener('mouseleave', () => {
      timer = setTimeout(dismiss, 1500);
    });
  }

  return toast;
}

export const toast = {
  success: (msg, dur) => showToast(msg, 'success', dur),
  danger: (msg, dur) => showToast(msg, 'danger', dur),
  error: (msg, dur) => showToast(msg, 'danger', dur),
  warning: (msg, dur) => showToast(msg, 'warning', dur),
  info: (msg, dur) => showToast(msg, 'info', dur)
};
