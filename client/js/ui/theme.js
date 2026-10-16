/**
 * Theme toggle management: dark / light / system.
 * Persists user preference in localStorage under 'splitstack_theme'.
 * Manages <html data-theme> and theme toggle buttons.
 */

const STORAGE_KEY = 'splitstack_theme';
const THEMES = ['dark', 'light', 'system'];

/**
 * Safely retrieve saved theme from localStorage.
 * @returns {'dark'|'light'|'system'}
 */
export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(saved)) {
      return saved;
    }
  } catch (_) {
    // Private browsing or quota exceeded
  }
  return 'system';
}

/**
 * Determine the currently active theme (resolves 'system' to actual appearance).
 * @returns {'dark'|'light'}
 */
export function getEffectiveTheme() {
  const saved = getSavedTheme();
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/**
 * Apply a theme setting to <html data-theme>.
 * @param {'dark'|'light'|'system'} theme
 */
export function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'system';

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {
    // Silently continue if localStorage is inaccessible
  }

  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Update all theme toggle buttons on the page
  const buttons = document.querySelectorAll('#theme-toggle, .theme-toggle');
  buttons.forEach((btn) => updateButtonUI(btn, theme));
}

/**
 * Cycle through themes: dark -> light -> system -> dark.
 * @returns {'dark'|'light'|'system'} New theme
 */
export function cycleTheme() {
  const current = getSavedTheme();
  const nextIndex = (THEMES.indexOf(current) + 1) % THEMES.length;
  const nextTheme = THEMES[nextIndex];
  applyTheme(nextTheme);
  return nextTheme;
}

/**
 * Update button icon, aria-label, and title.
 * @param {HTMLButtonElement} btn
 * @param {'dark'|'light'|'system'} theme
 */
function updateButtonUI(btn, theme) {
  const effective = getEffectiveTheme();
  const iconClass =
    theme === 'system'
      ? 'fa-circle-half-stroke'
      : effective === 'light'
      ? 'fa-sun'
      : 'fa-moon';

  btn.setAttribute(
    'aria-label',
    `Theme: ${theme}. Click to change.`
  );
  btn.setAttribute('title', `Theme: ${theme}`);

  const icon = btn.querySelector('i');
  if (icon) {
    icon.className = `fa-solid ${iconClass}`;
  } else {
    btn.innerHTML = `<i class="fa-solid ${iconClass}" aria-hidden="true"></i>`;
  }
}

/**
 * Initialize theme listeners, apply saved theme, and bind/inject UI buttons.
 */
export function initTheme() {
  const initialTheme = getSavedTheme();
  applyTheme(initialTheme);

  // Re-evaluate on OS scheme changes if set to system
  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', () => {
      if (getSavedTheme() === 'system') {
        const buttons = document.querySelectorAll('#theme-toggle, .theme-toggle');
        buttons.forEach((btn) => updateButtonUI(btn, 'system'));
      }
    });
  }

  // Find or create theme button in topbar-actions
  const topbarActions = document.querySelector('.topbar-actions');
  let themeBtn = document.querySelector('#theme-toggle, .theme-toggle');

  if (!themeBtn && topbarActions) {
    themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.id = 'theme-toggle';
    themeBtn.className = 'icon-btn theme-toggle';
    // Insert before profile avatar or notifications
    topbarActions.insertBefore(themeBtn, topbarActions.firstChild);
  }

  // Check public nav for landing/public pages
  const publicNav = document.querySelector('.public-nav');
  if (!themeBtn && publicNav) {
    themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.id = 'theme-toggle';
    themeBtn.className = 'icon-btn theme-toggle';
    publicNav.insertBefore(themeBtn, publicNav.firstChild);
  }

  // Bind click handler to all theme buttons
  const buttons = document.querySelectorAll('#theme-toggle, .theme-toggle');
  buttons.forEach((btn) => {
    updateButtonUI(btn, initialTheme);
    btn.addEventListener('click', () => {
      cycleTheme();
    });
  });
}
