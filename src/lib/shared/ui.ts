import { $, $$ } from './dom';

/**
 * Toast minimalista. El nodo debe existir en el DOM con id="toast".
 * Tipos: 'success' | 'error' | '' (neutro).
 */
export function showToast(message: string, type: '' | 'success' | 'error' = ''): void {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast is-visible${type ? ' is-' + type : ''}`;
  clearTimeout((showToast as unknown as { _t?: number })._t);
  (showToast as unknown as { _t?: number })._t = window.setTimeout(() => {
    el.className = 'toast';
  }, 2800);
}

/**
 * Diálogo de confirmación con HTML nativo. Devuelve una promesa.
 * El nodo debe existir con id="confirmDialog".
 */
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = $('#confirmDialog') as HTMLDialogElement | null;
    if (!dlg) {
      // Fallback si no hay diálogo: usar confirm nativo
      resolve(window.confirm(message));
      return;
    }
    const msg = $('#confirmMsg', dlg);
    const okBtn = $('[data-confirm-ok]', dlg) as HTMLButtonElement | null;
    const cancelBtn = $('[data-confirm-cancel]', dlg) as HTMLButtonElement | null;
    if (msg) msg.textContent = message;

    const close = (value: boolean) => {
      dlg.removeEventListener('close', onClose);
      okBtn?.removeEventListener('click', onOk);
      cancelBtn?.removeEventListener('click', onCancel);
      dlg.close();
      resolve(value);
    };
    const onClose = () => resolve(false);
    const onOk = () => close(true);
    const onCancel = () => close(false);

    dlg.addEventListener('close', onClose);
    okBtn?.addEventListener('click', onOk);
    cancelBtn?.addEventListener('click', onCancel);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else {
      // Fallback navegadores sin <dialog>
      resolve(window.confirm(message));
    }
  });
}

/** Pone un botón en estado "cargando" (deshabilita + cambia texto). */
export function setLoading(
  btn: HTMLButtonElement | null,
  on: boolean,
  loadingLabel = '...',
): void {
  if (!btn) return;
  if (on) {
    btn.dataset.originalLabel = btn.dataset.originalLabel ?? btn.textContent ?? '';
    btn.disabled = true;
    btn.textContent = loadingLabel;
    btn.classList.add('is-loading');
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalLabel ?? btn.textContent ?? '';
    btn.classList.remove('is-loading');
    delete btn.dataset.originalLabel;
  }
}

/** Marca un campo con error y muestra mensaje; `null` lo limpia. */
export function setFieldError(input: HTMLElement | null, message: string | null): void {
  if (!input) return;
  const field = input.closest('.field');
  if (!field) return;
  const errorEl = field.querySelector('.field-error') as HTMLElement | null;
  if (message) {
    field.classList.add('has-error');
    if (errorEl) errorEl.textContent = message;
  } else {
    field.classList.remove('has-error');
    if (errorEl) errorEl.textContent = '';
  }
}

/** Quita el estado de error de todos los .field dentro de un root. */
export function clearFieldErrors(root: ParentNode = document): void {
  $$('.field.has-error', root).forEach((f) => {
    f.classList.remove('has-error');
    const err = f.querySelector('.field-error');
    if (err) err.textContent = '';
  });
}
