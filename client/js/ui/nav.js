/**
 * Accessible mobile navigation drawer.
 * Replaces the CSS-only checkbox toggle with an accessible button with aria-expanded,
 * focus trapping, Escape key dismiss, and focus restoration.
 * The page remains fully usable without JavaScript through CSS :has(#nav-toggle:checked).
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Initialize accessible mobile navigation drawer.
 */
export function initNav() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return; // Pages without sidebar (e.g. landing, login) don't need drawer logic

  const navToggleCheckbox = document.getElementById('nav-toggle');
  const existingMenuLabel = document.querySelector('label.menu-btn[for="nav-toggle"], .menu-btn');
  const scrim = document.querySelector('.scrim');

  // Create real accessible button to replace or wrap label
  let menuBtn;
  if (existingMenuLabel) {
    menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'menu-btn';
    menuBtn.id = 'menu-btn';
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-controls', 'sidebar');
    menuBtn.setAttribute('aria-label', 'Open navigation menu');
    menuBtn.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';

    existingMenuLabel.parentNode.replaceChild(menuBtn, existingMenuLabel);
  } else {
    menuBtn = document.getElementById('menu-btn');
  }

  if (!menuBtn) return;

  let isOpen = false;

  function getFocusableElements() {
    return Array.from(sidebar.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null
    );
  }

  function open() {
    if (isOpen) return;
    isOpen = true;

    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close navigation menu');
    document.body.classList.add('nav-open');
    if (navToggleCheckbox) navToggleCheckbox.checked = true;

    // Focus first interactive element inside sidebar
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      setTimeout(() => focusable[0].focus(), 50);
    }
  }

  function close(restoreFocus = true) {
    if (!isOpen) return;
    isOpen = false;

    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open navigation menu');
    document.body.classList.remove('nav-open');
    if (navToggleCheckbox) navToggleCheckbox.checked = false;

    if (restoreFocus) {
      menuBtn.focus();
    }
  }

  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  // Toggle button click
  menuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  // Scrim click to dismiss
  if (scrim) {
    scrim.addEventListener('click', (e) => {
      e.preventDefault();
      close();
    });
  }

  // Nav link click to close on navigation
  sidebar.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
      close(false);
    }
  });

  // Keyboard navigation: Escape key and Focus Trap
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || document.activeElement === menuBtn) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  });

  // Auto-close on viewport resize back to desktop width
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && isOpen) {
      close(false);
    }
  });
}
