/**
 * Receipt scan page module (Review 2, Step P7).
 * Connects receipt-scan.html to receipt domain logic:
 * client-side file validation (size, MIME), drag & drop with visual indicators,
 * temporary in-memory object URL preview, cancel/reset option,
 * honest OCR status messaging, and transition to confirmation review.
 */

import { qs, createEl, on } from '../core/dom.js';
import { showToast } from '../ui/toast.js';
import { validateReceiptFile, formatFileSize } from '../domain/receipt.js';
import { uploadReceipt, getApiMode } from '../data/api.js';
import { setButtonLoading } from '../ui/forms.js';

let currentObjectURL = null;
let selectedFile = null;

/**
 * Clean up existing object URL to prevent memory leaks.
 */
function cleanupObjectURL() {
  if (currentObjectURL && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }
}

/**
 * Clear the preview and restore the dropzone.
 * @param {HTMLInputElement} fileInput
 * @param {HTMLElement} previewContainer
 * @param {HTMLButtonElement} submitBtn
 */
function clearPreview(fileInput, previewContainer, submitBtn) {
  cleanupObjectURL();
  selectedFile = null;
  if (fileInput) fileInput.value = '';

  if (previewContainer) {
    previewContainer.innerHTML = '';
    previewContainer.hidden = true;
  }

  const dropzone = qs('.dropzone');
  if (dropzone) {
    dropzone.classList.remove('has-file');
    const dropzoneContent = qs('.dropzone-content', dropzone);
    if (dropzoneContent) dropzoneContent.hidden = false;
  }

  if (submitBtn) {
    submitBtn.disabled = false;
  }
}

/**
 * Display preview for a valid receipt image.
 * @param {File} file
 * @param {Object} details
 * @param {HTMLInputElement} fileInput
 * @param {HTMLElement} previewContainer
 * @param {HTMLButtonElement} submitBtn
 */
function showPreview(file, details, fileInput, previewContainer, submitBtn) {
  cleanupObjectURL();
  selectedFile = file;

  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    currentObjectURL = URL.createObjectURL(file);
  }

  const dropzone = qs('.dropzone');
  if (dropzone) {
    dropzone.classList.add('has-file');
    const dropzoneContent = qs('.dropzone-content', dropzone);
    if (dropzoneContent) dropzoneContent.hidden = true;
  }

  if (!previewContainer) return;

  previewContainer.innerHTML = '';
  previewContainer.hidden = false;

  const previewCard = createEl('div', { className: 'receipt-upload-preview mt-4' }, [
    currentObjectURL
      ? createEl('img', {
          src: currentObjectURL,
          alt: `Selected receipt: ${details.name}`,
          className: 'receipt-preview-thumb',
          loading: 'lazy'
        })
      : createEl('div', { className: 'p-4 text-center text-dim', textContent: 'Image ready for preview' }),
    createEl('div', { className: 'receipt-meta-box' }, [
      createEl('div', {}, [
        createEl('strong', { textContent: details.name }),
        createEl('span', { className: 'text-dim ml-2', textContent: `(${details.formattedSize})` })
      ]),
      createEl('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm text-danger',
        id: 'remove-receipt-btn',
        'aria-label': 'Remove selected receipt image'
      }, [
        createEl('i', { className: 'fa-solid fa-xmark mr-1', 'aria-hidden': 'true' }),
        createEl('span', { textContent: 'Remove' })
      ])
    ]),
    createEl('div', { className: 'alert alert-info mt-3' }, [
      createEl('i', { className: 'fa-solid fa-circle-info', 'aria-hidden': 'true' }),
      createEl('div', {}, [
        createEl('strong', {
          textContent: getApiMode() === 'api' ? 'Server-side OCR ready' : 'Client-side preview mode'
        }),
        createEl('p', {
          className: 'text-xs',
          textContent: getApiMode() === 'api'
            ? 'Click "Read receipt" to upload your image and extract merchant, amount, and date suggestions via server-side OCR.'
            : 'Automated OCR extraction is scheduled for Review 3. Click "Read receipt" to review and enter expense details manually.'
        })
      ])
    ])
  ]);

  previewContainer.appendChild(previewCard);

  const removeBtn = qs('#remove-receipt-btn', previewContainer);
  if (removeBtn) {
    on(removeBtn, 'click', (e) => {
      e.stopPropagation();
      clearPreview(fileInput, previewContainer, submitBtn);
      showToast('Receipt image removed', 'info');
    });
  }

  if (submitBtn) {
    submitBtn.disabled = false;
  }
}

/**
 * Handle incoming file (from input change or drop).
 * @param {File} file
 * @param {HTMLInputElement} fileInput
 * @param {HTMLElement} previewContainer
 * @param {HTMLButtonElement} submitBtn
 */
function handleFileSelection(file, fileInput, previewContainer, submitBtn) {
  const result = validateReceiptFile(file);

  if (!result.valid) {
    clearPreview(fileInput, previewContainer, submitBtn);
    showToast(result.error, 'danger');

    // Also display inline alert if container exists
    if (previewContainer) {
      previewContainer.hidden = false;
      previewContainer.innerHTML = '';
      previewContainer.appendChild(
        createEl('div', { className: 'alert alert-danger', role: 'alert' }, [
          createEl('i', { className: 'fa-solid fa-triangle-exclamation', 'aria-hidden': 'true' }),
          createEl('div', {}, [
            createEl('strong', { textContent: 'Invalid file' }),
            createEl('p', { textContent: result.error })
          ])
        ])
      );
    }
    return;
  }

  showPreview(file, result.details, fileInput, previewContainer, submitBtn);
  showToast(`Receipt "${result.details.name}" selected!`, 'success');
}

/**
 * Initialize receipt-scan page.
 */
export async function init() {
  const form = qs('form.form');
  const fileInput = qs('input#receipt', form);
  const dropzone = qs('.dropzone', form);
  const submitBtn = qs('button[type="submit"]', form);

  if (!form || !fileInput || !dropzone) return;

  // Wrap initial dropzone inner contents with a container for easy hide/show
  let dropzoneContent = qs('.dropzone-content', dropzone);
  if (!dropzoneContent) {
    dropzoneContent = createEl('div', { className: 'dropzone-content' });
    const children = Array.from(dropzone.children).filter((c) => c !== fileInput);
    for (const child of children) {
      dropzoneContent.appendChild(child);
    }
    dropzone.insertBefore(dropzoneContent, fileInput);
  }

  // Preview container inside or right below dropzone
  let previewContainer = qs('#receipt-preview-container', form);
  if (!previewContainer) {
    previewContainer = createEl('div', { id: 'receipt-preview-container', hidden: true });
    dropzone.insertAdjacentElement('afterend', previewContainer);
  }

  // Drag & drop event handlers
  ['dragenter', 'dragover'].forEach((eventName) => {
    on(dropzone, eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'dragend'].forEach((eventName) => {
    on(dropzone, eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-dragover');
    });
  });

  on(dropzone, 'drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('is-dragover');

    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      handleFileSelection(file, fileInput, previewContainer, submitBtn);
    }
  });

  // Native file input change
  on(fileInput, 'change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelection(fileInput.files[0], fileInput, previewContainer, submitBtn);
    }
  });

  // Form submission
  on(form, 'submit', async (e) => {
    e.preventDefault();

    if (!selectedFile && (!fileInput.files || fileInput.files.length === 0)) {
      showToast('Please select or drop a receipt image before proceeding.', 'warning');
      return;
    }

    const file = selectedFile || fileInput.files[0];
    const validation = validateReceiptFile(file);
    if (!validation.valid) {
      showToast(validation.error, 'danger');
      return;
    }

    // In API mode, upload receipt directly to server via POST /api/receipts/upload
    if (getApiMode() === 'api') {
      setButtonLoading(submitBtn, true, 'Uploading & scanning receipt...');
      try {
        const result = await uploadReceipt(file);
        const pendingData = {
          receiptId: result.receipt.id,
          fileName: validation.details.name,
          fileSize: validation.details.size,
          fileType: validation.details.type,
          formattedSize: validation.details.formattedSize,
          candidate: result.candidate,
          serverProcessed: true,
          timestamp: Date.now()
        };

        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('splitstack_pending_receipt', JSON.stringify(pendingData));
        }

        showToast('Receipt uploaded and scanned successfully!', 'success');
        window.location.href = 'receipt-confirm.html';
        return;
      } catch (err) {
        setButtonLoading(submitBtn, false);
        const msg = err.message || 'Failed to upload receipt. Please try again.';
        showToast(msg, 'danger');
        return;
      }
    }

    // Local / offline fallback preview mode
    const pendingData = {
      fileName: validation.details.name,
      fileSize: validation.details.size,
      fileType: validation.details.type,
      formattedSize: validation.details.formattedSize,
      serverProcessed: false,
      timestamp: Date.now()
    };

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('splitstack_pending_receipt', JSON.stringify(pendingData));
      }
    } catch (_) {}

    // Read small image thumbnail (< 1.5 MB) for seamless cross-page preview
    if (file.size <= 1.5 * 1024 * 1024 && typeof FileReader !== 'undefined') {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            sessionStorage.setItem('splitstack_pending_receipt_dataurl', reader.result);
          } catch (_) {}
          window.location.href = 'receipt-confirm.html';
        };
        reader.onerror = () => {
          window.location.href = 'receipt-confirm.html';
        };
        reader.readAsDataURL(file);
        return;
      } catch (_) {}
    }

    window.location.href = 'receipt-confirm.html';
  });
}
