/**
 * DOM utility helpers for vanilla JavaScript.
 * Follows SplitStack principles: no framework, lightweight, accessible.
 */

/**
 * Query a single element.
 * @param {string} selector - CSS selector
 * @param {ParentNode} [scope=document] - Scope element
 * @returns {Element|null}
 */
export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

/**
 * Query multiple elements as a proper Array.
 * @param {string} selector - CSS selector
 * @param {ParentNode} [scope=document] - Scope element
 * @returns {Element[]}
 */
export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

/**
 * Add an event listener to an element with automatic cleanup helper.
 * @param {EventTarget} target - Target element or window
 * @param {string} event - Event name
 * @param {EventListener} handler - Event handler callback
 * @param {boolean|AddEventListenerOptions} [options] - Event listener options
 * @returns {() => void} Unbind function
 */
export function on(target, event, handler, options) {
  if (!target) return () => {};
  target.addEventListener(event, handler, options);
  return () => target.removeEventListener(event, handler, options);
}

/**
 * Delegated event listener.
 * @param {ParentNode} parent - Container element to attach listener to
 * @param {string} selector - CSS selector to match target against
 * @param {string} event - Event name
 * @param {(e: Event, matchedEl: Element) => void} handler - Callback
 * @param {boolean|AddEventListenerOptions} [options] - Listener options
 * @returns {() => void} Unbind function
 */
export function delegate(parent, selector, event, handler, options) {
  if (!parent) return () => {};
  const listener = (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const match = target.closest(selector);
    if (match && parent.contains(match)) {
      handler(e, match);
    }
  };
  parent.addEventListener(event, listener, options);
  return () => parent.removeEventListener(event, listener, options);
}

/**
 * Create a DOM element with attributes, properties and children.
 * Safe against XSS: does not use innerHTML.
 * @param {string} tag - HTML tag name
 * @param {Record<string, any>} [attrs={}] - Attributes and properties
 * @param {(Node|string)[]} [children=[]] - Child nodes or text
 * @returns {HTMLElement}
 */
export function createEl(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;

    if (key === 'className' || key === 'class') {
      el.className = String(value);
    } else if (key === 'textContent' || key === 'text') {
      el.textContent = String(value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }

  return el;
}
