/**
 * Accessible <dialog>-based confirmation modal.
 * Replaces window.confirm for destructive actions (delete buttons, forms).
 */

let dialogEl = null;
const confirmedButtons = new WeakSet();

function getOrCreateDialog() {
  if (!dialogEl || !document.body.contains(dialogEl)) {
    dialogEl = document.getElementById('confirm-modal');
    if (!dialogEl) {
      dialogEl = document.createElement('dialog');
      dialogEl.id = 'confirm-modal';
      dialogEl.className = 'confirm-dialog';
      dialogEl.setAttribute('aria-labelledby', 'confirm-modal-title');
      dialogEl.setAttribute('aria-describedby', 'confirm-modal-desc');

      dialogEl.innerHTML = `
        <form method="dialog" class="confirm-dialog-content">
          <div class="confirm-dialog-header">
            <span class="confirm-dialog-icon tone-danger" aria-hidden="true">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </span>
            <h2 class="confirm-dialog-title" id="confirm-modal-title">Confirm deletion</h2>
          </div>
          <p class="confirm-dialog-desc" id="confirm-modal-desc">Are you sure you want to delete this item? This action cannot be undone.</p>
          <div class="confirm-dialog-actions">
            <button type="button" class="btn btn-ghost" id="confirm-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-danger" id="confirm-submit-btn">Delete</button>
          </div>
        </form>
      `;

      document.body.appendChild(dialogEl);
    }
  }
  return dialogEl;
}

/**
 * Display a confirmation dialog.
 * @param {Object} options
 * @param {string} [options.title='Confirm deletion']
 * @param {string} [options.message='Are you sure you want to proceed?']
 * @param {string} [options.confirmText='Delete']
 * @param {string} [options.cancelText='Cancel']
 * @param {boolean} [options.danger=true]
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
export function confirmDialog(options = {}) {
  const {
    title = 'Confirm deletion',
    message = 'Are you sure you want to delete this item? This action cannot be undone.',
    confirmText = 'Delete',
    cancelText = 'Cancel',
    danger = true
  } = options;

  const dialog = getOrCreateDialog();
  const titleEl = dialog.querySelector('#confirm-modal-title');
  const descEl = dialog.querySelector('#confirm-modal-desc');
  const cancelBtn = dialog.querySelector('#confirm-cancel-btn');
  const submitBtn = dialog.querySelector('#confirm-submit-btn');

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = message;
  if (cancelBtn) cancelBtn.textContent = cancelText;
  if (submitBtn) {
    submitBtn.textContent = confirmText;
    submitBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
  }

  return new Promise((resolve) => {
    let resolved = false;

    function cleanup() {
      dialog.removeEventListener('close', onClose);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
    }

    function onCancel() {
      if (!resolved) {
        resolved = true;
        cleanup();
        dialog.close();
        resolve(false);
      }
    }

    function onClose() {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(dialog.returnValue === 'confirmed');
      }
    }

    dialog.addEventListener('close', onClose, { once: true });
    if (cancelBtn) {
      cancelBtn.addEventListener('click', onCancel, { once: true });
    }

    // Submit handler
    const form = dialog.querySelector('form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        resolved = true;
        cleanup();
        dialog.close('confirmed');
        resolve(true);
      };
    }

    // Open native dialog modal
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      // Focus cancel button by default for safety
      if (cancelBtn) cancelBtn.focus();
    } else {
      // Fallback for older browsers without HTML5 dialog
      const confirmed = window.confirm(`${title}\n\n${message}`);
      resolve(confirmed);
    }
  });
}

/**
 * Initialize automatic interception for delete buttons and forms.
 * Intercepts clicks on destructive buttons, prompts via <dialog>,
 * and on confirmation allows the original submit/click event to proceed
 * through standard HTML validation and event pipelines without fake side-effects.
 */
export function initConfirm() {
  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    // Check if clicked element or its parent is a delete/danger button
    const deleteBtn = target.closest(
      'button.danger, button.btn-danger, button[data-confirm], [data-confirm], button[aria-label*="Delete" i], button[aria-label*="Remove" i]'
    );

    if (!deleteBtn) return;

    // Don't intercept buttons inside the confirm dialog itself
    if (deleteBtn.closest('#confirm-modal')) return;

    // If already confirmed by the dialog, allow the natural event to proceed
    if (confirmedButtons.has(deleteBtn)) {
      confirmedButtons.delete(deleteBtn);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const customMessage = deleteBtn.getAttribute('data-confirm') ||
      (deleteBtn.getAttribute('aria-label') ? `Are you sure you want to ${deleteBtn.getAttribute('aria-label').toLowerCase()}?` : undefined);

    const confirmed = await confirmDialog({
      title: 'Confirm deletion',
      message: customMessage || 'Are you sure you want to delete this item? This action cannot be undone.',
      confirmText: 'Delete',
      danger: true
    });

    if (confirmed) {
      confirmedButtons.add(deleteBtn);

      const parentForm = deleteBtn.closest('form');
      if (parentForm && deleteBtn.type === 'submit') {
        // requestSubmit invokes HTML5 validation and submit event listeners without bypassing them
        if (typeof parentForm.requestSubmit === 'function') {
          parentForm.requestSubmit(deleteBtn);
        } else {
          deleteBtn.click();
        }
      } else {
        deleteBtn.click();
      }
    }
  });
}
