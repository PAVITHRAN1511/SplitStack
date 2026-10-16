/**
 * Shopping lists page module (Review 2, Step P3).
 * Connects shopping.html to api.js to render shopping list cards,
 * purchase progress, and estimated totals.
 */

import { listShoppingLists, listGroups } from '../data/api.js';
import { qs, createEl } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement, renderEmptyState } from '../core/render.js';

/**
 * Render shopping list cards.
 * @param {Array} lists
 * @param {Array} groups
 */
function renderShoppingCards(lists, groups) {
  const container = qs('main#main .grid.grid-3');
  if (!container) return;

  clearElement(container);

  if (lists.length === 0) {
    renderEmptyState(container, {
      icon: 'fa-cart-shopping',
      title: 'No shopping lists',
      message: 'Plan purchases, track items bought, and convert to expenses.',
      actionText: 'New list',
      onAction: () => {
        window.location.href = 'shopping-form.html';
      }
    });
    return;
  }

  const groupMap = new Map((groups || []).map((g) => [g.id, g]));

  for (const sl of lists) {
    const items = sl.items || [];
    const totalCount = items.length;
    const boughtCount = items.filter((i) => i.purchased).length;
    const percent = totalCount > 0 ? Math.round((boughtCount / totalCount) * 100) : 0;

    const estimatedPaise = items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * (i.quantity || 1), 0);

    const group = sl.groupId ? groupMap.get(sl.groupId) : null;
    const scopeSubtitle = group ? `Group · ${group.name}` : 'Personal';

    const card = createEl('a', {
      className: 'card group-card',
      href: `shopping-detail.html?id=${encodeURIComponent(sl.id)}`
    }, [
      createEl('div', { className: 'card-header' }, [
        createEl('div', { className: 'flex items-center gap-3' }, [
          createEl('span', { className: 'cat-icon', style: { '--cat': 'var(--cat-food)' } }, [
            createEl('i', { className: 'fa-solid fa-basket-shopping', 'aria-hidden': 'true' })
          ]),
          createEl('div', {}, [
            createEl('h2', { className: 'card-title', textContent: sl.name }),
            createEl('p', { className: 'text-xs', textContent: scopeSubtitle })
          ])
        ])
      ]),
      createEl('div', { className: 'card-body' }, [
        createEl('div', { className: 'flex justify-between text-sm' }, [
          createEl('span', { textContent: `${boughtCount} of ${totalCount} bought` }),
          createEl('span', { className: 'text-dim', textContent: `Est. ${formatINR(estimatedPaise)}` })
        ]),
        createEl('div', {
          className: 'meter',
          style: { '--fill': 'var(--success)' },
          role: 'progressbar',
          'aria-label': `${sl.name} progress`,
          'aria-valuemin': '0',
          'aria-valuemax': String(totalCount),
          'aria-valuenow': String(boughtCount)
        }, [
          createEl('span', { style: { '--value': `${percent}%` } })
        ])
      ])
    ]);

    container.appendChild(card);
  }
}

/**
 * Initialize shopping page.
 */
export async function init() {
  const container = qs('main#main .grid.grid-3');
  setLoading(container, true);

  try {
    const [lists, groups] = await Promise.all([
      listShoppingLists(),
      listGroups()
    ]);

    renderShoppingCards(lists || [], groups || []);
  } catch (err) {
    console.warn('[SplitStack] Error loading shopping lists:', err);
  } finally {
    setLoading(container, false);
  }
}
