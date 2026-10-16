/**
 * Categories page module (Review 2, Step P3).
 * Connects categories.html to api.js to render custom user categories
 * and default system categories.
 */

import { listCategories } from '../data/api.js';
import { qs, createEl } from '../core/dom.js';
import { setLoading, clearElement } from '../core/render.js';

/**
 * Render custom categories list.
 * @param {Array} customCats
 */
function renderCustomCategories(customCats) {
  const ul = qs('section[aria-labelledby="custom-title"] ul.list');
  if (!ul) return;

  clearElement(ul);

  if (customCats.length === 0) {
    ul.appendChild(createEl('li', { className: 'text-dim p-4 text-center', textContent: 'No custom categories created yet.' }));
    return;
  }

  for (const cat of customCats) {
    const li = createEl('li', { className: 'list-item' }, [
      createEl('span', {
        className: 'cat-icon',
        style: { '--cat': cat.color || '#6366f1' }
      }, [
        createEl('i', { className: `fa-solid ${cat.icon || 'fa-tag'}`, 'aria-hidden': 'true' })
      ]),
      createEl('span', { className: 'grow' }, [
        createEl('span', { className: 'list-title', textContent: cat.name }),
        createEl('span', {
          className: 'list-sub',
          textContent: `${cat.type === 'income' ? 'Income' : 'Expense'} · Custom`
        })
      ]),
      createEl('form', { className: 'inline-form', action: '#', method: 'post' }, [
        createEl('button', {
          className: 'icon-btn sm danger',
          type: 'submit',
          'aria-label': `Delete ${cat.name} category`
        }, [
          createEl('i', { className: 'fa-solid fa-trash', 'aria-hidden': 'true' })
        ])
      ])
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
        createEl('i', { className: `fa-solid ${cat.icon || 'fa-tag'}`, 'aria-hidden': 'true' })
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
 * Initialize categories page.
 */
export async function init() {
  const main = qs('main#main');
  setLoading(main, true);

  try {
    const cats = await listCategories();
    const defaultCats = cats.filter((c) => !c.userId || c.userId === 'system');
    const customCats = cats.filter((c) => Boolean(c.userId) && c.userId !== 'system');

    renderCustomCategories(customCats);
    renderDefaultCategories(defaultCats);
  } catch (err) {
    console.warn('[SplitStack] Error loading categories:', err);
  } finally {
    setLoading(main, false);
  }
}
