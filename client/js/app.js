/**
 * SplitStack application entry point.
 * Initializes shared UI components (theme, accessible navigation, confirm modal)
 * and dynamically loads the page-specific module when available.
 */

import { initTheme } from './ui/theme.js';
import { initNav } from './ui/nav.js';
import { initConfirm } from './ui/confirm.js';

async function bootstrap() {
  // Initialize shared UI
  initTheme();
  initNav();
  initConfirm();

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
