/**
 * Shopping list detail page module (Review 2, Steps P3, P4 & P7).
 * Connects shopping-detail.html to api.js to render items checklist,
 * optimistic live toggle of purchased status with error rollback,
 * live recalculation of estimated, actual and variance totals,
 * inline item editing (name, quantity, est & actual unit prices),
 * item deletion with confirmDialog, empty state handling,
 * list editing link, list deletion with confirmDialog,
 * and duplicate-protected conversion to expense.
 */

import {
  getShoppingList,
  toggleShoppingItem,
  addShoppingItem,
  updateShoppingItem,
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
 * Recompute and update summary stat cards and progress meter.
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
      actuallyPaid += (item.actualPrice !== null ? item.actualPrice : item.estimatedPrice || 0) * qty;
    }
  }

  const variancePaise = actuallyPaid - estimateForBought;
  const isOver = variancePaise > 0;
  const percent = items.length > 0 ? Math.round((boughtCount / items.length) * 100) : 0;

  // Header subtitle
  const headerP = qs('.page-header p');
  if (headerP) {
    headerP.textContent = `${boughtCount} of ${items.length} items bought (${percent}%)`;
  }

  // Progress meter
  const meter = qs('#list-progress-meter');
  if (meter) {
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(items.length));
    meter.setAttribute('aria-valuenow', String(boughtCount));
    const meterSpan = qs('span', meter);
    if (meterSpan) {
      meterSpan.style.setProperty('--value', `${percent}%`);
    }
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
 * Render items checklist with inline editing and confirmation.
 * @param {Object} shoppingList
 * @param {Function} [onRefresh]
 */
function renderChecklist(shoppingList, onRefresh) {
  const ul = qs('ul.checklist');
  if (!ul) return;

  clearElement(ul);

  const items = shoppingList.items || [];
  if (items.length === 0) {
    ul.appendChild(
      createEl('li', { className: 'p-6 text-dim text-center empty-checklist' }, [
        createEl('i', { className: 'fa-solid fa-cart-shopping text-2xl mb-2', 'aria-hidden': 'true' }),
        createEl('p', { className: 'fw-600', textContent: 'No items in this shopping list yet.' }),
        createEl('p', { className: 'text-xs text-dim', textContent: 'Use the "Add an item" form on the right to start building your checklist.' })
      ])
    );
    return;
  }

  items.forEach((item, index) => {
    const inputId = `item-${item.id || index}`;
    const li = createEl('li', { className: 'check-item', id: `row-${item.id || index}` });

    function renderRowView() {
      clearElement(li);
      li.className = 'check-item';

      const checkbox = createEl('input', {
        type: 'checkbox',
        id: inputId,
        name: 'purchased',
        value: String(item.id || index),
        checked: Boolean(item.purchased)
      });

      // Optimistic checkbox toggle with rollback on error
      on(checkbox, 'change', async () => {
        const prevPurchased = item.purchased;
        const prevActual = item.actualPrice;

        item.purchased = checkbox.checked;
        if (item.purchased && item.actualPrice === null) {
          item.actualPrice = item.estimatedPrice;
        }
        updateTotals(items);

        try {
          const updated = await toggleShoppingItem(shoppingList.id, item.id);
          item.purchased = updated.purchased;
          item.actualPrice = updated.actualPrice;
        } catch (err) {
          item.purchased = prevPurchased;
          item.actualPrice = prevActual;
          checkbox.checked = prevPurchased;
          updateTotals(items);
          showToast(err.message || 'Failed to update item status', 'danger');
        }
      });

      const editBtn = createEl('button', {
        className: 'icon-btn sm hide-sm',
        type: 'button',
        'aria-label': `Edit ${item.name}`,
        title: `Edit ${item.name}`
      }, [
        createEl('i', { className: 'fa-solid fa-pen', 'aria-hidden': 'true' })
      ]);

      on(editBtn, 'click', () => {
        renderRowEdit();
      });

      const removeBtn = createEl('button', {
        className: 'icon-btn sm danger hide-sm',
        type: 'button',
        'aria-label': `Remove ${item.name}`,
        title: `Remove ${item.name}`
      }, [
        createEl('i', { className: 'fa-solid fa-xmark', 'aria-hidden': 'true' })
      ]);

      on(removeBtn, 'click', async () => {
        const confirmed = await confirmDialog({
          title: 'Remove item',
          message: `Remove "${item.name}" from this shopping list?`,
          confirmText: 'Remove',
          danger: true
        });
        if (!confirmed) return;

        try {
          await removeShoppingItem(shoppingList.id, item.id);
          showToast(`Removed "${item.name}"`, 'info');
          if (onRefresh) await onRefresh();
        } catch (err) {
          showToast(err.message || 'Failed to remove item', 'danger');
        }
      });

      const estTotal = (item.estimatedPrice || 0) * (item.quantity || 1);
      const actualTotal = item.purchased
        ? (item.actualPrice !== null ? item.actualPrice : item.estimatedPrice || 0) * (item.quantity || 1)
        : null;

      li.append(
        checkbox,
        createEl('label', { for: inputId }, [
          createEl('span', { className: 'cell-main', textContent: item.name }),
          createEl('span', { className: 'cell-sub', textContent: `Qty ${item.quantity || 1}` })
        ]),
        createEl('span', {
          className: 'price num text-dim hide-sm',
          textContent: formatINR(estTotal)
        }),
        createEl('span', {
          className: 'price num fw-600',
          textContent: actualTotal !== null ? formatINR(actualTotal) : '—'
        }),
        createEl('div', { className: 'flex items-center gap-1' }, [editBtn, removeBtn])
      );
    }

    function renderRowEdit() {
      clearElement(li);
      li.className = 'check-item is-editing';

      const editForm = createEl('form', { className: 'check-item-edit-form' });

      const nameInp = createEl('input', {
        className: 'input input-sm',
        type: 'text',
        value: item.name,
        required: true,
        'aria-label': 'Item name'
      });

      const qtyInp = createEl('input', {
        className: 'input input-sm',
        type: 'number',
        min: '1',
        step: '1',
        value: String(item.quantity || 1),
        required: true,
        'aria-label': 'Quantity'
      });

      const estPriceInp = createEl('input', {
        className: 'input input-sm',
        type: 'number',
        min: '0',
        step: '0.01',
        value: String(((item.estimatedPrice || 0) / 100).toFixed(2)),
        'aria-label': 'Estimated unit price'
      });

      const actualPriceInp = createEl('input', {
        className: 'input input-sm',
        type: 'number',
        min: '0',
        step: '0.01',
        placeholder: 'Actual (optional)',
        value: item.actualPrice !== null ? String((item.actualPrice / 100).toFixed(2)) : '',
        'aria-label': 'Actual unit price'
      });

      const saveBtn = createEl('button', {
        type: 'submit',
        className: 'btn btn-primary btn-sm'
      }, [createEl('span', { textContent: 'Save' })]);

      const cancelBtn = createEl('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm'
      }, [createEl('span', { textContent: 'Cancel' })]);

      on(cancelBtn, 'click', () => {
        renderRowView();
      });

      on(editForm, 'submit', async (e) => {
        e.preventDefault();
        const newName = nameInp.value.trim();
        if (!newName) {
          showToast('Item name is required', 'warning');
          nameInp.focus();
          return;
        }

        const newQty = parseInt(qtyInp.value, 10) || 1;
        let newEstPaise = 0;
        let newActualPaise = null;

        try {
          if (estPriceInp.value.trim()) {
            newEstPaise = rupeesToPaise(estPriceInp.value.trim());
          }
          if (actualPriceInp.value.trim()) {
            newActualPaise = rupeesToPaise(actualPriceInp.value.trim());
          }
        } catch (err) {
          showToast(err.message, 'danger');
          return;
        }

        setButtonLoading(saveBtn, true, 'Saving...');

        try {
          const updated = await updateShoppingItem(shoppingList.id, item.id, {
            name: newName,
            quantity: newQty,
            estimatedPrice: newEstPaise,
            actualPrice: newActualPaise
          });

          Object.assign(item, updated);
          showToast(`Updated "${item.name}"`, 'success');
          updateTotals(items);
          renderRowView();
        } catch (err) {
          setButtonLoading(saveBtn, false);
          showToast(err.message || 'Failed to update item', 'danger');
        }
      });

      editForm.append(
        nameInp,
        qtyInp,
        estPriceInp,
        actualPriceInp,
        createEl('div', { className: 'flex gap-1' }, [saveBtn, cancelBtn])
      );

      li.appendChild(editForm);
      nameInp.focus();
    }

    renderRowView();
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

  // Ensure "Edit list" button link points to shopping-form with id
  const editListBtn = qs('#edit-list-btn') || qs('.page-actions a.btn-secondary');
  if (editListBtn) {
    editListBtn.href = `shopping-form.html?id=${encodeURIComponent(listId)}`;
  }

  // Handle converted expense state
  const convertBtn = qs('.page-actions form[action="expenses.html"] button');
  if (convertBtn) {
    if (shoppingList.convertedExpenseId) {
      convertBtn.disabled = true;
      convertBtn.className = 'btn btn-secondary';
      convertBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Converted to expense';
      convertBtn.title = 'This shopping list has already been converted to an expense';
    } else if (!shoppingList.items || shoppingList.items.length === 0) {
      convertBtn.disabled = true;
      convertBtn.title = 'Add items before converting to expense';
    } else {
      convertBtn.disabled = false;
      convertBtn.className = 'btn btn-primary';
      convertBtn.innerHTML = '<i class="fa-solid fa-file-invoice" aria-hidden="true"></i> Convert to expense';
      convertBtn.title = '';
    }
  }

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

        if (shoppingList.convertedExpenseId) {
          showToast('This shopping list has already been converted to an expense.', 'info');
          return;
        }

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
