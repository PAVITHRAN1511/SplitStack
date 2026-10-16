/**
 * SplitStack page rendering helpers.
 * Ensures strict XSS safety (no innerHTML with dynamic data), accessible aria-busy states,
 * and unified empty/error state components across all pages.
 */

import { createEl } from './dom.js';

/**
 * Set aria-busy loading attribute on a container element.
 * @param {HTMLElement|null} container
 * @param {boolean} isLoading
 */
export function setLoading(container, isLoading) {
  if (!container) return;
  if (isLoading) {
    container.setAttribute('aria-busy', 'true');
  } else {
    container.removeAttribute('aria-busy');
  }
}

/**
 * Safely remove all child nodes from a container.
 * @param {HTMLElement|null} el
 */
export function clearElement(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Render a standardized accessible empty state.
 * @param {HTMLElement} container - Parent element
 * @param {Object} options
 * @param {string} [options.icon='fa-folder-open'] - FontAwesome icon class
 * @param {string} [options.title='No items found'] - Main header message
 * @param {string} [options.message=''] - Secondary description
 * @param {string} [options.actionText=''] - Optional action button label
 * @param {() => void} [options.onAction=null] - Button click callback
 * @returns {HTMLElement}
 */
export function renderEmptyState(container, {
  icon = 'fa-folder-open',
  title = 'No items found',
  message = '',
  actionText = '',
  onAction = null
} = {}) {
  clearElement(container);

  const children = [
    createEl('i', { className: `fa-solid ${icon}`, 'aria-hidden': 'true' }),
    createEl('p', { className: 'font-semibold', textContent: title })
  ];

  if (message) {
    children.push(createEl('p', { className: 'text-dim', textContent: message }));
  }

  if (actionText && typeof onAction === 'function') {
    const btn = createEl('button', {
      className: 'btn btn-secondary btn-sm mt-2',
      type: 'button',
      textContent: actionText,
      onClick: onAction
    });
    children.push(btn);
  }

  const emptyDiv = createEl('div', { className: 'empty' }, children);
  container.appendChild(emptyDiv);
  return emptyDiv;
}

/**
 * Render an accessible error state into a container.
 * @param {HTMLElement} container
 * @param {string} [message='Failed to load data']
 * @param {() => void} [onRetry=null]
 * @returns {HTMLElement}
 */
export function renderErrorState(container, message = 'Failed to load data', onRetry = null) {
  clearElement(container);

  const children = [
    createEl('i', { className: 'fa-solid fa-circle-exclamation text-danger', 'aria-hidden': 'true' }),
    createEl('p', { className: 'font-semibold text-danger', textContent: message })
  ];

  if (typeof onRetry === 'function') {
    children.push(createEl('button', {
      className: 'btn btn-secondary btn-sm mt-2',
      type: 'button',
      textContent: 'Retry',
      onClick: onRetry
    }));
  }

  const errDiv = createEl('div', { className: 'empty' }, children);
  container.appendChild(errDiv);
  return errDiv;
}
