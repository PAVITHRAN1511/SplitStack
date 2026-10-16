/**
 * Global search UI component (Review 2, Step P6).
 * Enhances the topbar search input with live autocomplete dropdown,
 * 200ms debounce, ARIA combobox pattern, keyboard navigation (ArrowUp/Down, Enter, Esc),
 * and case-insensitive matching across expenses, income, groups, and shopping lists.
 */

import { search as searchApi } from '../data/api.js';
import { formatINR } from '../core/format.js';
import { qs, on, createEl } from '../core/dom.js';

let debounceTimer = null;
let currentResults = [];
let activeIndex = -1;
let dropdownEl = null;

/**
 * Debounce a callback function.
 * @param {Function} fn
 * @param {number} delayMs
 * @returns {Function}
 */
export function debounce(fn, delayMs = 200) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Close the search dropdown.
 * @param {HTMLInputElement} input
 */
export function closeDropdown(input) {
  if (dropdownEl && dropdownEl.parentNode) {
    dropdownEl.parentNode.removeChild(dropdownEl);
  }
  dropdownEl = null;
  activeIndex = -1;
  currentResults = [];
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
}

/**
 * Update the active option highlight and aria-activedescendant.
 * @param {HTMLInputElement} input
 * @param {number} newIndex
 */
function setActiveOption(input, newIndex) {
  if (!dropdownEl) return;
  const options = dropdownEl.querySelectorAll('.search-option');
  if (options.length === 0) return;

  options.forEach((opt, idx) => {
    if (idx === newIndex) {
      opt.classList.add('is-active');
      opt.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', opt.id);
      opt.scrollIntoView({ block: 'nearest' });
    } else {
      opt.classList.remove('is-active');
      opt.setAttribute('aria-selected', 'false');
    }
  });

  activeIndex = newIndex;
}

/**
 * Render search results dropdown.
 * @param {HTMLInputElement} input
 * @param {Object} results
 * @param {string} query
 */
function renderResults(input, results, query) {
  const container = input.closest('.search');
  if (!container) return;

  // Remove existing dropdown
  if (dropdownEl && dropdownEl.parentNode) {
    dropdownEl.parentNode.removeChild(dropdownEl);
  }

  dropdownEl = createEl('div', {
    id: 'global-search-listbox',
    className: 'search-dropdown',
    role: 'listbox',
    'aria-label': 'Search results'
  });

  currentResults = [];
  activeIndex = -1;

  const total = results?.total || 0;

  if (total === 0) {
    dropdownEl.appendChild(createEl('div', {
      className: 'search-empty',
      textContent: `No matching results for "${query}"`
    }));
    container.appendChild(dropdownEl);
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  let optCounter = 0;

  const addSection = (title, items, getMeta) => {
    if (!items || items.length === 0) return;

    dropdownEl.appendChild(createEl('div', {
      className: 'search-section-header',
      textContent: `${title} (${items.length})`
    }));

    for (const item of items) {
      const optId = `search-opt-${optCounter++}`;
      const meta = getMeta(item);

      const optEl = createEl('a', {
        id: optId,
        className: 'search-option',
        role: 'option',
        href: meta.href,
        'aria-selected': 'false'
      }, [
        createEl('div', { className: 'search-option-info' }, [
          createEl('span', { className: 'search-option-title', textContent: meta.title }),
          createEl('span', { className: 'search-option-meta', textContent: meta.subtitle })
        ]),
        meta.badge
          ? createEl('span', { className: `num ${meta.badgeClass || ''}`, textContent: meta.badge })
          : null
      ].filter(Boolean));

      on(optEl, 'click', () => {
        closeDropdown(input);
      });

      dropdownEl.appendChild(optEl);
      currentResults.push({ id: optId, href: meta.href, el: optEl });
    }
  };

  addSection('Expenses', results.expenses, (e) => ({
    title: e.description,
    subtitle: `${e.date || ''} · ${e.categoryName || e.categoryId || ''}`,
    badge: `−${formatINR(e.amount)}`,
    badgeClass: 'text-danger',
    href: `expenses.html?q=${encodeURIComponent(query)}`
  }));

  addSection('Income', results.income, (i) => ({
    title: i.source || i.description,
    subtitle: `${i.date || ''} · ${i.categoryName || i.categoryId || ''}`,
    badge: `+${formatINR(i.amount)}`,
    badgeClass: 'text-success',
    href: `income.html?q=${encodeURIComponent(query)}`
  }));

  addSection('Groups', results.groups, (g) => ({
    title: g.name,
    subtitle: `${g.members?.length || 1} members`,
    badge: null,
    href: `group-detail.html?id=${encodeURIComponent(g.id)}`
  }));

  addSection('Shopping Lists', results.shopping, (s) => ({
    title: s.name,
    subtitle: `${s.items?.length || 0} items`,
    badge: null,
    href: `shopping.html?id=${encodeURIComponent(s.id)}`
  }));

  container.appendChild(dropdownEl);
  input.setAttribute('aria-expanded', 'true');
}

/**
 * Initialize global search combobox and keyboard controls.
 */
export function initSearch() {
  const searchInput = qs('#global-search');
  if (!searchInput) return;

  const form = searchInput.closest('form.search');

  // Set up ARIA combobox pattern
  searchInput.setAttribute('role', 'combobox');
  searchInput.setAttribute('aria-autocomplete', 'list');
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.setAttribute('aria-controls', 'global-search-listbox');
  searchInput.setAttribute('aria-haspopup', 'listbox');

  const performSearch = debounce(async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      closeDropdown(searchInput);
      return;
    }

    try {
      const results = await searchApi(trimmed);
      renderResults(searchInput, results, trimmed);
    } catch (err) {
      console.warn('[SplitStack] Global search error:', err);
    }
  }, 200);

  on(searchInput, 'input', (e) => {
    performSearch(e.target.value);
  });

  on(searchInput, 'keydown', (e) => {
    if (!dropdownEl) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeIndex < currentResults.length - 1 ? activeIndex + 1 : 0;
      setActiveOption(searchInput, next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = activeIndex > 0 ? activeIndex - 1 : currentResults.length - 1;
      setActiveOption(searchInput, prev);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < currentResults.length) {
        e.preventDefault();
        const selected = currentResults[activeIndex];
        if (selected?.href) {
          closeDropdown(searchInput);
          window.location.href = selected.href;
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown(searchInput);
    }
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) {
      closeDropdown(searchInput);
    }
  });
}
