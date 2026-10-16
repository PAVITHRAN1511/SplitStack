/**
 * Shopping list detail page module (Review 2, Steps P3 & P4).
 * Connects shopping-detail.html to api.js to render items checklist,
 * live toggle purchased status, recompute totals, add items with validation,
 * delete items, delete the list with confirmation, and convert the list to an expense.
 */

import {
  getShoppingList,
  toggleShoppingItem,
  addShoppingItem,
  removeShoppingItem,
  removeShoppingList,
  convertShoppingListToExpense
} from '../data/api.js';
import { qs, createEl, on } from '../core/dom.js';
import { formatINR } from '../core/format.js';
import { setLoading, clearElement, renderErrorState } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import {
  rupeesToPaise,
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

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

  // Estimated total card
  const estVal = qs('article[aria-label="List totals"] article.tone-primary .stat-value');
  const estMeta = qs('article[aria-label="List totals"] article.tone-primary .stat-meta');
  if (estVal) estVal.textContent = formatINR(estimatedTotal);
  if (estMeta) estMeta.textContent = `All ${items.length} items`;

  // Estimate for bought card
  const boughtEstVal = qs('article[aria-label="List totals"] article.tone-info .stat-value');
  const boughtEstMeta = qs('article[aria-label="List totals"] article.tone-info .stat-meta');
  if (boughtEstVal) boughtEstVal.textContent = formatINR(estimateForBought);
  if (boughtEstMeta) boughtEstMeta.textContent = `${boughtCount} items`;

  // Actually paid card
  const paidVal = qs('article[aria-label="List totals"] article.tone-success .stat-value');
  const paidMeta = qs('article[aria-label="List totals"] article.tone-success .stat-meta');
  if (paidVal) paidVal.textContent = formatINR(actuallyPaid);
  if (paidMeta) paidMeta.textContent = `${boughtCount} items`;

  // Variance card
  const varVal = qs('article[aria-label="List totals"] article.tone-danger .stat-value');
  const varMeta = qs('article[aria-label="List totals"] article.tone-danger .stat-meta');
  if (varVal) {
    varVal.className = `stat-value num ${isOver ? 'text-danger' : 'text-success'}`;
    varVal.textContent = `${isOver ? '+' : ''}${formatINR(variancePaise)}`;
  }
  if (varMeta) {
    const pct = estimateForBought > 0 ? ((Math.abs(variancePaise) / estimateForBought) * 100).toFixed(1) : '0.0';
    varMeta.textContent = `${pct}% ${isOver ? 'over' : 'under'} estimate`;
  }
}

/**
 * Render items checklist.
 * @param {Object} shoppingList
 * @param {Function} [onRefresh]
 */
function renderChecklist(shoppingList, onRefresh) {
  const ul = qs('ul.checklist');
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

    const removeBtn = createEl('button', {
      className: 'icon-btn sm danger hide-sm',
      type: 'button',
      'aria-label': `Remove ${item.name}`
    }, [
      createEl('i', { className: 'fa-solid fa-xmark', 'aria-hidden': 'true' })
    ]);

    on(removeBtn, 'click', async () => {
      try {
        await removeShoppingItem(shoppingList.id, item.id);
        showToast(`Removed "${item.name}"`, 'info');
        if (onRefresh) await onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to remove item', 'danger');
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
      removeBtn
    ]);

    ul.appendChild(li);
  });
}

/**
 * Fetch and render all shopping list details.
 * @param {string} listId
 */
async function loadAndRenderShoppingList(listId) {
  const shoppingList = await getShoppingList(listId);

  // Update header and breadcrumbs
  const breadcrumbCurrent = qs('.breadcrumbs li[aria-current="page"]');
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = shoppingList.name;

  const h1 = qs('.page-header h1');
  if (h1) h1.textContent = shoppingList.name;

  renderChecklist(shoppingList, () => loadAndRenderShoppingList(listId));
  updateTotals(shoppingList.items || []);

  return shoppingList;
}

/**
 * Initialize shopping-detail page.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  const url = new URL(window.location.href);
  const listId = url.searchParams.get('id') || 'shop_1';

  try {
    const shoppingList = await loadAndRenderShoppingList(listId);

    // Wire "Add an item" form
    const addItemForm = qs('aside[aria-labelledby="add-item-title"] form');
    if (addItemForm) {
      const nameInput = qs('#i-name', addItemForm);
      const qtyInput = qs('#i-qty', addItemForm);
      const priceInput = qs('#i-price', addItemForm);
      const assignSelect = qs('#i-assign', addItemForm);
      const submitBtn = qs('button[type="submit"]', addItemForm);

      on(addItemForm, 'submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(addItemForm);

        const nameVal = nameInput?.value.trim() || '';
        if (!nameVal) {
          showFieldError(nameInput, 'Item name is required');
          focusFirstInvalid(addItemForm);
          return;
        }

        const quantity = parseInt(qtyInput?.value || '1', 10) || 1;
        let estimatedPricePaise = 0;
        const priceVal = priceInput?.value.trim();
        if (priceVal) {
          try {
            estimatedPricePaise = rupeesToPaise(priceVal);
          } catch (err) {
            showFieldError(priceInput, err.message);
            focusFirstInvalid(addItemForm);
            return;
          }
        }

        const assignedTo = assignSelect?.value || null;

        setButtonLoading(submitBtn, true, 'Adding...');

        try {
          await addShoppingItem(listId, {
            name: nameVal,
            quantity,
            estimatedPrice: estimatedPricePaise,
            assignedTo
          });

          showToast(`Added "${nameVal}"!`, 'success');
          nameInput.value = '';
          if (qtyInput) qtyInput.value = '1';
          if (priceInput) priceInput.value = '';
          await loadAndRenderShoppingList(listId);
        } catch (err) {
          showFieldError(nameInput, err.message || 'Failed to add item');
          focusFirstInvalid(addItemForm);
        } finally {
          setButtonLoading(submitBtn, false);
        }
      });
    }

    // Wire "Convert to expense" button
    const convertForm = qs('.page-actions form[action="expenses.html"]');
    if (convertForm) {
      on(convertForm, 'submit', async (e) => {
        e.preventDefault();
        const confirmed = await confirmDialog({
          title: 'Convert to expense',
          message: 'Convert purchased items from this shopping list into an expense record?',
          confirmText: 'Convert',
          danger: false
        });
        if (!confirmed) return;

        try {
          await convertShoppingListToExpense(listId, 'cat_shopping');
          showToast('Converted shopping list to an expense!', 'success');
          setTimeout(() => {
            window.location.href = 'expenses.html';
          }, 600);
        } catch (err) {
          showToast(err.message || 'Failed to convert shopping list to expense', 'danger');
        }
      });
    }

    // Wire "Delete list" button
    const deleteListForm = qs('.page-actions form[action="shopping.html"]');
    if (deleteListForm) {
      on(deleteListForm, 'submit', async (e) => {
        e.preventDefault();
        const confirmed = await confirmDialog({
          title: 'Delete shopping list',
          message: `Delete shopping list "${shoppingList.name}"? This action cannot be undone.`,
          confirmText: 'Delete',
          danger: true
        });
        if (!confirmed) return;

        try {
          await removeShoppingList(listId);
          showToast('Shopping list deleted', 'info');
          setTimeout(() => {
            window.location.href = 'shopping.html';
          }, 500);
        } catch (err) {
          showToast(err.message || 'Failed to delete shopping list', 'danger');
        }
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading shopping list:', err);
    clearElement(main);
    renderErrorState(main, `Shopping list "${listId}" could not be found.`, () => {
      window.location.href = 'shopping.html';
    });
  } finally {
    setLoading(main, false);
  }
}
