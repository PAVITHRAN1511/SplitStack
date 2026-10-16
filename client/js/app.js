/**
 * SplitStack application entry point.
 * Initializes shared UI components (theme, accessible navigation, confirm modal, user header),
 * checks authentication on protected pages, and dynamically loads the page-specific module.
 */

import { initTheme } from './ui/theme.js';
import { initNav } from './ui/nav.js';
import { initConfirm } from './ui/confirm.js';
import { initUser } from './ui/user.js';
import { authGuard } from './ui/forms.js';
import { initSearch } from './ui/search.js';
import { initNotifications } from './ui/notifications.js';

async function bootstrap() {
  // Initialize shared UI
  initTheme();
  initNav();
  initConfirm();
  await initUser();

  // Route authentication guard
  const isAllowed = await authGuard();
  if (!isAllowed) return;

  // Initialize authenticated shell features (Review 2, Step P6)
  initSearch();
  initNotifications();

  // Read page name from body dataset
  const pageName = document.body.dataset.page;
  if (!pageName) return;

  try {
    // Dynamic import of page module
    const pageModule = await import(`./pages/${pageName}.js`);
    if (pageModule && typeof pageModule.init === 'function') {
      await pageModule.init();
    }
  } catch (err) {
    // A missing page module is not an error (P1 requirement)
    // Only log if there was an actual error inside an existing module
    const isModuleMissing =
      err.message?.includes('Failed to fetch dynamically imported module') ||
      err.message?.includes('Cannot find module') ||
      err.name === 'TypeError';

    if (!isModuleMissing) {
      console.warn(`[SplitStack] Notice: page module "${pageName}" error:`, err);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
