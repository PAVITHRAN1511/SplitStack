/**
 * Categories page module (Review 2, Steps P3 & P4).
 * Connects categories.html to api.js to render custom user categories
 * and default system categories, wires the new category creation form,
 * and handles category deletion with confirmation.
 */

import { listCategories, createCategory, removeCategory } from '../data/api.js';
import { qs, on, createEl } from '../core/dom.js';
import { setLoading, clearElement } from '../core/render.js';
import { confirmDialog } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import {
  clearFieldErrors,
  showFieldError,
  setButtonLoading,
  focusFirstInvalid
} from '../ui/forms.js';

/**
 * Render custom categories list.
 * @param {Array} customCats
 * @param {Function} [onRefresh]
 */
function renderCustomCategories(customCats, onRefresh) {
  const ul = qs('section[aria-labelledby="custom-title"] ul.list');
  if (!ul) return;

  clearElement(ul);

  if (customCats.length === 0) {
    ul.appendChild(createEl('li', { className: 'text-dim p-4 text-center', textContent: 'No custom categories created yet.' }));
    return;
  }

  for (const cat of customCats) {
    const delBtn = createEl('button', {
      className: 'icon-btn sm danger',
      type: 'submit',
      'aria-label': `Delete ${cat.name} category`
    }, [
      createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
    ]);

    const delForm = createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [delBtn]);

    on(delForm, 'submit', async (e) => {
      e.preventDefault();
      const confirmed = await confirmDialog({
        title: 'Delete category',
        message: `Delete custom category "${cat.name}"? This action cannot be undone.`,
        confirmText: 'Delete'
      });
      if (!confirmed) return;
      try {
        await removeCategory(cat.id);
        showToast(`Category "${cat.name}" deleted`, 'info');
        if (onRefresh) await onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to delete category', 'danger');
      }
    });

    const li = createEl('li', { className: 'list-item' }, [
      createEl('span', {
        className: 'cat-icon',
        style: { '--cat': cat.color || '#6366f1' }
      }, [
        createEl('i', { className: `fa-solid fa-${cat.icon || 'tag'}`, 'aria-hidden': 'true' })
      ]),
      createEl('span', { className: 'grow' }, [
        createEl('span', { className: 'list-title', textContent: cat.name }),
        createEl('span', {
          className: 'list-sub',
          textContent: `${cat.type === 'income' ? 'Income' : 'Expense'} · Custom`
        })
      ]),
      delForm
    ]);

    ul.appendChild(li);
  }
}

/**
 * Render default categories grid.
 * @param {Array} defaultCats
 */
function renderDefaultCategories(defaultCats) {
  const ul = qs('section[aria-labelledby="default-title"] ul.grid.grid-3.list-plain');
  if (!ul) return;

  clearElement(ul);

  for (const cat of defaultCats) {
    const li = createEl('li', { className: 'flex items-center gap-3' }, [
      createEl('span', {
        className: 'cat-icon',
        style: { '--cat': `var(--cat-${cat.id}, ${cat.color || 'var(--cat-other)'})` }
      }, [
        createEl('i', { className: `fa-solid fa-${cat.icon || 'tag'}`, 'aria-hidden': 'true' })
      ]),
      createEl('span', {}, [
        createEl('span', { className: 'list-title', textContent: cat.name }),
        createEl('span', { className: 'list-sub', textContent: cat.type === 'income' ? 'Income' : 'Expense' })
      ])
    ]);

    ul.appendChild(li);
  }
}

/**
 * Fetch and render all categories.
 */
async function loadAndRenderCategories() {
  const cats = await listCategories();
  const defaultCats = cats.filter((c) => !c.userId || c.userId === 'system');
  const customCats = cats.filter((c) => Boolean(c.userId) && c.userId !== 'system');

  renderCustomCategories(customCats, loadAndRenderCategories);
  renderDefaultCategories(defaultCats);
}

/**
 * Initialize categories page.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  try {
    await loadAndRenderCategories();

    // Wire new category form
    const form = qs('aside[aria-labelledby="new-cat-title"] form');
    if (form) {
      const submitBtn = qs('button[type="submit"]', form);
      const nameInput = qs('#c-name', form);
      const iconSelect = qs('#c-icon', form);
      const colorInput = qs('#c-color', form);

      on(form, 'submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);

        const nameVal = nameInput?.value.trim() || '';
        const typeVal = form.querySelector('input[name="type"]:checked')?.value || 'expense';
        const iconVal = iconSelect?.value || 'tag';
        const colorVal = colorInput?.value || '#6366f1';

        if (!nameVal) {
          showFieldError(nameInput, 'Category name is required');
          focusFirstInvalid(form);
          return;
        }

        setButtonLoading(submitBtn, true, 'Adding category...');

        try {
          await createCategory({
            name: nameVal,
            type: typeVal,
            icon: iconVal,
            color: colorVal
          });

          showToast(`Category "${nameVal}" created!`, 'success');
          form.reset();
          await loadAndRenderCategories();
        } catch (err) {
          showFieldError(nameInput, err.message || 'Failed to create category');
          focusFirstInvalid(form);
        } finally {
          setButtonLoading(submitBtn, false);
        }
      });
    }
  } catch (err) {
    console.warn('[SplitStack] Error loading categories:', err);
  } finally {
    setLoading(main, false);
  }
}
