/**
 * Shopping list detail page module (Review 2, Step P3).
 * Connects shopping-detail.html to api.js to render items checklist,
 * live toggle purchased status, and recompute estimated vs actual totals.
 */

import { getShoppingList, toggleShoppingItem } from '../data/api.js';
import { qs, createEl, on } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement, renderErrorState } from '../core/render.js';

/**
 * Recompute and update summary stat cards.
 * @param {Array} items
 */
function updateTotals(items) {
  let estimatedTotal = 0;
  let estimateForBought = 0;
  let actuallyPaid = 0;
  let boughtCount = 0;

  for (const item of items) {
    const qty = item.quantity || 1;
    const est = (item.estimatedPrice || 0) * qty;
    estimatedTotal += est;

    if (item.purchased) {
      boughtCount++;
      estimateForBought += est;
      actuallyPaid += (item.actualPrice || item.estimatedPrice || 0) * qty;
    }
  }

  const variancePaise = actuallyPaid - estimateForBought;
  const isOver = variancePaise > 0;

  // Header subtitle
  const headerP = qs('.page-header p');
  if (headerP) {
    headerP.textContent = `${boughtCount} of ${items.length} items bought`;
  }

  // Cards
  const estTotalVal = qs('.stat.tone-primary .stat-value');
  const estTotalMeta = qs('.stat.tone-primary .stat-meta');
  if (estTotalVal) estTotalVal.textContent = formatINR(estimatedTotal);
  if (estTotalMeta) estTotalMeta.textContent = `All ${items.length} items`;

  const estBoughtVal = qs('.stat.tone-info .stat-value');
  const estBoughtMeta = qs('.stat.tone-info .stat-meta');
  if (estBoughtVal) estBoughtVal.textContent = formatINR(estimateForBought);
  if (estBoughtMeta) estBoughtMeta.textContent = `${boughtCount} items`;

  const actualPaidVal = qs('.stat.tone-success .stat-value');
  const actualPaidMeta = qs('.stat.tone-success .stat-meta');
  if (actualPaidVal) actualPaidVal.textContent = formatINR(actuallyPaid);
  if (actualPaidMeta) actualPaidMeta.textContent = `${boughtCount} items`;

  const varianceVal = qs('.stat.tone-danger .stat-value');
  const varianceMeta = qs('.stat.tone-danger .stat-meta');
  if (varianceVal) {
    varianceVal.className = `stat-value num ${isOver ? 'text-danger' : 'text-success'}`;
    const prefix = isOver ? '+' : '−';
    varianceVal.textContent = `${prefix}${formatINR(Math.abs(variancePaise))}`;
  }
  if (varianceMeta) {
    const pct = estimateForBought > 0 ? Math.abs((variancePaise / estimateForBought) * 100).toFixed(1) : '0.0';
    varianceMeta.textContent = `${pct}% ${isOver ? 'over estimate' : 'under estimate'}`;
  }
}

/**
 * Render items checklist.
 * @param {Object} shoppingList
 */
function renderChecklist(shoppingList) {
  const ul = qs('section[aria-labelledby="items-title"] ul.checklist');
  if (!ul) return;

  clearElement(ul);

  const items = shoppingList.items || [];
  if (items.length === 0) {
    ul.appendChild(createEl('li', { className: 'p-4 text-dim text-center', textContent: 'No items in this shopping list.' }));
    return;
  }

  items.forEach((item, index) => {
    const inputId = `item-${item.id || index}`;

    const checkbox = createEl('input', {
      type: 'checkbox',
      id: inputId,
      name: 'purchased',
      value: String(item.id || index),
      checked: Boolean(item.purchased)
    });

    on(checkbox, 'change', async () => {
      try {
        const updatedItem = await toggleShoppingItem(shoppingList.id, item.id);
        item.purchased = updatedItem.purchased;
        updateTotals(items);
      } catch (err) {
        console.warn('[SplitStack] Error toggling item:', err);
        checkbox.checked = !checkbox.checked;
      }
    });

    const li = createEl('li', { className: 'check-item' }, [
      checkbox,
      createEl('label', { for: inputId }, [
        createEl('span', { className: 'cell-main', textContent: item.name }),
        createEl('span', { className: 'cell-sub', textContent: `Qty ${item.quantity || 1}` })
      ]),
      createEl('span', {
        className: 'price num text-dim hide-sm',
        textContent: formatINR((item.estimatedPrice || 0) * (item.quantity || 1))
      }),
      createEl('span', {
        className: 'price num fw-600',
        textContent: formatINR((item.actualPrice || item.estimatedPrice || 0) * (item.quantity || 1))
      }),
      createEl('button', {
        className: 'icon-btn sm danger hide-sm',
        type: 'button',
        'aria-label': `Remove ${item.name}`
      }, [
        createEl('i', { className: 'fa-solid fa-xmark', 'aria-hidden': 'true' })
      ])
    ]);

    ul.appendChild(li);
  });
}

/**
 * Initialize shopping-detail page.
 */
export async function init() {
  const main = qs('main#main');
  const url = new URL(window.location.href);
  const listId = url.searchParams.get('id') || 'shop_1';

  setLoading(main, true);

  try {
    const shoppingList = await getShoppingList(listId);

    // Update breadcrumb and header title
    const breadcrumbCurrent = qs('.breadcrumbs li[aria-current="page"]');
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = shoppingList.name;

    const h1 = qs('.page-header h1');
    if (h1) h1.textContent = shoppingList.name;

    renderChecklist(shoppingList);
    updateTotals(shoppingList.items || []);
  } catch (err) {
    console.warn('[SplitStack] Error loading shopping list detail:', err);
    clearElement(main);
    renderErrorState(main, `Shopping list "${listId}" not found.`, () => {
      window.location.href = 'shopping.html';
    });
  } finally {
    setLoading(main, false);
  }
}
