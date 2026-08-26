/**
 * Shell del panel admin: orquesta auth, render de productos y handlers.
 * Patrón: HTML estático en admin.astro + cloneNode de <template>s. Nada de innerHTML con datos del backend.
 * El panel es solo de productos (sin pedidos).
 */

import { supabase } from '../supabase';
import { $, $$, clear, cloneTemplate, setText, toggleHidden } from '../shared/dom';
import {
  confirmAction,
  setLoading,
  showToast,
} from '../shared/ui';
import { formatCategoria, formatPrice, initials } from '../shared/format';
import {
  getCurrentUser,
  signIn as svcSignIn,
  signOut as svcSignOut,
  subscribeAuth,
  type SessionUser,
} from './auth';
import { listCategorias, type Categoria } from './categories';
import {
  createProduct,
  deleteProduct,
  listProducts,
  toggleActivo,
  updateProduct,
  type UpdateProductInput,
} from './products';
import { validateImage } from './storage';
import type { Producto } from '../types';

// -------------------- Estado UI --------------------

interface UIState {
  user: SessionUser | null;
  categorias: Categoria[];
  productos: Producto[];
  filterCat: string; // 'todo' | slug
  editingId: string | null;
  editingRemoveCurrent: boolean;
  editingFile: File | null;
  pendingFile: File | null;
}

const state: UIState = {
  user: null,
  categorias: [],
  productos: [],
  filterCat: 'todo',
  editingId: null,
  editingRemoveCurrent: false,
  editingFile: null,
  pendingFile: null,
};

// -------------------- Bootstrap --------------------

export async function init(): Promise<void> {
  state.user = await getCurrentUser();

  subscribeAuth((user) => {
    state.user = user;
    if (user) void showApp();
    else showLogin();
  });

  if (state.user) {
    await showApp();
  } else {
    showLogin();
  }

  bindLogin();
  bindLogout();
  bindFilters();
  bindProductForm();
  bindGridDelegation();
  bindEditModal();
  bindFileDrop();
  bindHashRouter();
}

function showLogin(): void {
  toggleHidden($('#appView'), true);
  toggleHidden($('#loginView'), false);
  setTimeout(() => $('#loginEmail')?.focus(), 60);
}

async function showApp(): Promise<void> {
  toggleHidden($('#loginView'), true);
  toggleHidden($('#appView'), false);
  if (state.user) setText('#userEmail', state.user.email);
  await ensureCategorias();
  await routeFromHash();
}

async function ensureCategorias(): Promise<void> {
  if (state.categorias.length > 0) return;
  state.categorias = await listCategorias();
  renderCategoriaSelect();
  renderCategoriaFilters();
}

// -------------------- Router por hash --------------------

function bindHashRouter(): void {
  window.addEventListener('hashchange', () => {
    void routeFromHash();
  });
}

async function routeFromHash(): Promise<void> {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [, query] = hash.split('?');
  const params = new URLSearchParams(query ?? '');
  state.filterCat = params.get('cat') ?? 'todo';
  await renderProductos();
}

// -------------------- Login --------------------

function bindLogin(): void {
  const form = $<HTMLFormElement>('#loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = $<HTMLInputElement>('#loginEmail');
    const passInput = $<HTMLInputElement>('#loginPass');
    const submitBtn = $<HTMLButtonElement>('#loginSubmit');

    const email = emailInput?.value ?? '';
    const pass = passInput?.value ?? '';

    if (!email || !email.includes('@')) {
      showToast('Ingresa un email válido.', 'error');
      $('#loginEmail')?.focus();
      return;
    }
    if (!pass || pass.length < 4) {
      showToast('La contraseña debe tener al menos 4 caracteres.', 'error');
      $('#loginPass')?.focus();
      return;
    }

    setLoading(submitBtn, true, 'Entrando...');
    const result = await svcSignIn(email, pass);
    setLoading(submitBtn, false);

    if (!result.ok) {
      showToast(result.error, 'error');
      if (result.error.toLowerCase().includes('email')) emailInput?.focus();
      else passInput?.focus();
      return;
    }
    showToast('Sesión iniciada', 'success');
    form.reset();
    state.user = result.data ?? null;
    await showApp();
  });

  form.addEventListener('input', () => {
    // Limpia cualquier estado de error al re-tipear.
  });
}

function bindLogout(): void {
  $('#logoutBtn')?.addEventListener('click', async () => {
    const result = await svcSignOut();
    if (!result.ok) showToast(result.error, 'error');
    else showToast('Sesión cerrada');
  });
}

// -------------------- Selects / Filtros --------------------

function renderCategoriaSelect(): void {
  for (const target of [$<HTMLSelectElement>('#productCategory'), $<HTMLSelectElement>('#editCategory')]) {
    if (!target) continue;
    const placeholder = target.querySelector('option[value=""]');
    target.innerHTML = '';
    if (placeholder) target.appendChild(placeholder);
    for (const cat of state.categorias) {
      const opt = document.createElement('option');
      opt.value = cat.slug;
      opt.textContent = cat.nombre;
      target.appendChild(opt);
    }
  }
}

function renderCategoriaFilters(): void {
  const wrap = $('#productFilters');
  if (!wrap) return;
  clear(wrap);
  const all = document.createElement('button');
  all.className = `filter ${state.filterCat === 'todo' ? 'is-active' : ''}`;
  all.dataset.cat = 'todo';
  all.type = 'button';
  all.textContent = 'Todo';
  all.setAttribute('role', 'tab');
  all.setAttribute('aria-selected', state.filterCat === 'todo' ? 'true' : 'false');
  wrap.appendChild(all);
  for (const cat of state.categorias) {
    const btn = document.createElement('button');
    btn.className = `filter ${state.filterCat === cat.slug ? 'is-active' : ''}`;
    btn.dataset.cat = cat.slug;
    btn.type = 'button';
    btn.textContent = cat.nombre;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', state.filterCat === cat.slug ? 'true' : 'false');
    wrap.appendChild(btn);
  }
}

function bindFilters(): void {
  $('#productFilters')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]');
    if (!btn) return;
    const cat = btn.dataset.cat ?? 'todo';
    if (cat === state.filterCat) return;
    const qs = new URLSearchParams({ cat }).toString();
    window.location.hash = `#/products?${qs}`;
  });
}

// -------------------- Productos · render --------------------

async function renderProductos(): Promise<void> {
  const grid = $('#adminGrid');
  if (!grid) return;
  setText('#productsCount', '0');

  state.productos = await listProducts({ categoria_slug: state.filterCat });

  // Sincronizar filtros visuales
  $$('#productFilters .filter').forEach((b) => {
    const active = b.dataset.cat === state.filterCat;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  setText('#productsCount', String(state.productos.length));

  clear(grid);
  if (state.productos.length === 0) {
    toggleHidden($('#emptyMsg'), false);
    return;
  }
  toggleHidden($('#emptyMsg'), true);

  const catMap = new Map(state.categorias.map((c) => [c.id, c.slug]));
  for (const p of state.productos) {
    const card = cloneTemplate<HTMLElement>('tpl-product-card');
    if (!card) continue;
    fillProductCard(card, p, catMap.get(p.categoria_id ?? '') ?? '');
    grid.appendChild(card);
  }
}

function fillProductCard(card: HTMLElement, p: Producto, catSlug: string): void {
  card.dataset.id = p.id;
  if (!p.activo) card.classList.add('is-unavailable');

  const status = card.querySelector<HTMLElement>('.admin-card-status');
  const badge = card.querySelector<HTMLElement>('.admin-card-badge');
  if (status) {
    status.textContent = 'Disponible';
    toggleHidden(status, !p.activo);
  }
  if (badge) {
    badge.textContent = 'Agotado';
    toggleHidden(badge, p.activo);
  }

  const imgWrap = card.querySelector<HTMLElement>('.admin-card-media');
  if (imgWrap) {
    imgWrap.querySelectorAll('img, .admin-card-placeholder').forEach((n) => n.remove());
    const firstImg = p.imagenes?.[0];
    if (firstImg) {
      const img = document.createElement('img');
      img.className = 'admin-card-img';
      img.alt = p.nombre;
      img.loading = 'lazy';
      img.src = firstImg;
      imgWrap.appendChild(img);
    } else {
      const ph = document.createElement('span');
      ph.className = 'admin-card-placeholder';
      ph.textContent = initials(p.nombre);
      imgWrap.appendChild(ph);
    }
  }

  setText('.admin-card-cat', formatCategoria(catSlug), card);
  setText('.admin-card-name', p.nombre, card);
  setText('.admin-card-price', formatPrice(p.precio), card);

  const toggle = card.querySelector<HTMLInputElement>('input[data-toggle]');
  if (toggle) {
    toggle.checked = p.activo;
    toggle.dataset.toggle = p.id;
    const label = card.querySelector<HTMLElement>('.admin-card-toggle-label');
    if (label) label.textContent = p.activo ? 'Disponible' : 'Agotado';
  }
  const editBtn = card.querySelector<HTMLButtonElement>('button[data-edit]');
  if (editBtn) editBtn.dataset.edit = p.id;
  const delBtn = card.querySelector<HTMLButtonElement>('button[data-delete]');
  if (delBtn) delBtn.dataset.delete = p.id;
}

// -------------------- Productos · form alta --------------------

function bindProductForm(): void {
  const form = $<HTMLFormElement>('#productForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = $<HTMLInputElement>('#productName')?.value.trim() ?? '';
    const precio = Number($<HTMLInputElement>('#productPrice')?.value ?? NaN);
    const categoria = $<HTMLSelectElement>('#productCategory')?.value ?? '';
    const activo = $<HTMLInputElement>('#productAvailable')?.checked ?? true;

    if (!nombre || nombre.length < 2) {
      showToast('Ingresa un nombre válido.', 'error');
      $('#productName')?.focus();
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      showToast('Ingresa un precio válido.', 'error');
      $('#productPrice')?.focus();
      return;
    }
    if (!categoria) {
      showToast('Selecciona una categoría.', 'error');
      $('#productCategory')?.focus();
      return;
    }

    const submitBtn = $<HTMLButtonElement>('#productSubmit');
    setLoading(submitBtn, true, 'Guardando...');
    const result = await createProduct({
      nombre,
      precio,
      categoria_slug: categoria,
      activo,
      file: state.pendingFile ?? undefined,
    });
    setLoading(submitBtn, false);

    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    showToast(`"${nombre}" agregado al catálogo`, 'success');
    resetProductForm();
    await renderProductos();
  });
}

function resetProductForm(): void {
  const form = $<HTMLFormElement>('#productForm');
  form?.reset();
  const chk = $<HTMLInputElement>('#productAvailable');
  if (chk) chk.checked = true;
  state.pendingFile = null;
  renderPendingPreview();
}

// -------------------- File drop (alta) --------------------

function bindFileDrop(): void {
  const drop = $('#fileDrop');
  const input = $<HTMLInputElement>('#productImage');
  if (!drop || !input) return;

  const openPicker = () => input.click();

  // El <input> está DENTRO del drop: su click sintético burbujea hasta aquí.
  // Si no lo filtramos, se vuelve a llamar openPicker() y se abre otro picker.
  drop.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    openPicker();
  });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  });

  input.addEventListener('change', () => {
    const f = input.files?.[0] ?? null;
    if (f) addPendingFile(f);
    input.value = '';
  });

  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) addPendingFile(f);
  });
}

function addPendingFile(file: File): void {
  const err = validateImage(file);
  if (err) {
    showToast(err, 'error');
    return;
  }
  state.pendingFile = file;
  renderPendingPreview();
}

function renderPendingPreview(): void {
  const empty = $('#fileDropEmpty');
  const preview = $<HTMLImageElement>('#filePreview');
  if (!empty || !preview) return;
  if (!state.pendingFile) {
    toggleHidden(empty, false);
    toggleHidden(preview, true);
    preview.removeAttribute('src');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    preview.src = ev.target?.result as string;
    toggleHidden(empty, true);
    toggleHidden(preview, false);
  };
  reader.readAsDataURL(state.pendingFile);
}

// -------------------- Productos · grid delegación --------------------

function bindGridDelegation(): void {
  $('#adminGrid')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const toggle = target.closest<HTMLInputElement>('input[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      if (!id) return;
      const nuevoEstado = toggle.checked;
      toggle.disabled = true;
      const result = await toggleActivo(id, nuevoEstado);
      toggle.disabled = false;
      if (!result.ok) {
        toggle.checked = !nuevoEstado;
        showToast(result.error, 'error');
      } else {
        showToast(nuevoEstado ? 'Producto marcado como disponible' : 'Producto marcado como agotado');
        await renderProductos();
      }
      return;
    }

    const editBtn = target.closest<HTMLButtonElement>('button[data-edit]');
    if (editBtn) {
      const id = editBtn.dataset.edit;
      if (id) openEditModal(id);
      return;
    }

    const delBtn = target.closest<HTMLButtonElement>('button[data-delete]');
    if (delBtn) {
      const id = delBtn.dataset.delete;
      if (!id) return;
      const prod = state.productos.find((p) => p.id === id);
      const ok = await confirmAction(
        `¿Eliminar "${prod?.nombre ?? 'este producto'}" del catálogo?`,
      );
      if (!ok) return;
      const result = await deleteProduct(id);
      if (!result.ok) showToast(result.error, 'error');
      else {
        showToast(`"${prod?.nombre ?? 'Producto'}" eliminado`, 'error');
        await renderProductos();
      }
      return;
    }
  });
}

// -------------------- Productos · modal edición --------------------

function bindEditModal(): void {
  const modal = $('#editModal');
  const form = $<HTMLFormElement>('#editForm');
  if (!modal || !form) return;

  $$('#editModal [data-close]', modal).forEach((el) => {
    el.addEventListener('click', () => closeEditModal());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeEditModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.editingId) return;

    const nombre = $<HTMLInputElement>('#editName')?.value.trim() ?? '';
    const precio = Number($<HTMLInputElement>('#editPrice')?.value ?? NaN);
    const categoria = $<HTMLSelectElement>('#editCategory')?.value ?? '';
    const activo = $<HTMLInputElement>('#editAvailable')?.checked ?? true;

    if (!nombre || nombre.length < 2) {
      showToast('Ingresa un nombre válido.', 'error');
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      showToast('Ingresa un precio válido.', 'error');
      return;
    }
    if (!categoria) {
      showToast('Selecciona una categoría.', 'error');
      return;
    }

    const input: UpdateProductInput = {
      nombre,
      precio,
      categoria_slug: categoria,
      activo,
    };
    if (state.editingFile) input.file = state.editingFile;
    if (state.editingRemoveCurrent) input.remove_current_image = true;

    const submitBtn = $<HTMLButtonElement>('#editSubmit');
    setLoading(submitBtn, true, 'Guardando...');
    const result = await updateProduct(state.editingId, input);
    setLoading(submitBtn, false);

    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    showToast(`"${nombre}" actualizado`, 'success');
    closeEditModal();
    await renderProductos();
  });

  bindEditFileDrop();
}

function bindEditFileDrop(): void {
  const drop = $('#editFileDrop');
  const input = $<HTMLInputElement>('#editFileInput');
  if (!drop || !input) return;

  // Mismo bug que en bindFileDrop: el click sintético del input burbujea.
  drop.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    input.click();
  });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0] ?? null;
    if (f) addEditingFile(f);
    input.value = '';
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('is-dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) addEditingFile(f);
  });
}

function addEditingFile(file: File): void {
  const err = validateImage(file);
  if (err) {
    showToast(err, 'error');
    return;
  }
  state.editingFile = file;
  state.editingRemoveCurrent = false;
  renderEditingPreview();
}

function renderEditingPreview(): void {
  const drop = $('#editFileDrop');
  const preview = $<HTMLImageElement>('#editPreview');
  const empty = $('#editFileEmpty');
  const clearBtn = $<HTMLButtonElement>('#editFileClear');
  if (!drop || !preview || !empty || !clearBtn) return;

  const prod = state.productos.find((p) => p.id === state.editingId);
  const currentUrl = prod?.imagenes?.[0] ?? null;

  if (state.editingFile) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target?.result as string;
      toggleHidden(empty, true);
      toggleHidden(preview, false);
      toggleHidden(clearBtn, false);
      preview.classList.remove('is-marked');
    };
    reader.readAsDataURL(state.editingFile);
  } else if (state.editingRemoveCurrent || !currentUrl) {
    preview.removeAttribute('src');
    toggleHidden(empty, false);
    toggleHidden(preview, true);
    toggleHidden(clearBtn, true);
  } else {
    preview.src = currentUrl;
    toggleHidden(empty, true);
    toggleHidden(preview, false);
    toggleHidden(clearBtn, false);
    preview.classList.toggle('is-marked', state.editingRemoveCurrent);
  }
}

function openEditModal(id: string): void {
  const p = state.productos.find((x) => x.id === id);
  if (!p) return;
  state.editingId = id;
  state.editingRemoveCurrent = false;
  state.editingFile = null;
  $<HTMLInputElement>('#editName')!.value = p.nombre;
  $<HTMLInputElement>('#editPrice')!.value = String(p.precio);
  $<HTMLSelectElement>('#editCategory')!.value =
    state.categorias.find((c) => c.id === p.categoria_id)?.slug ?? '';
  $<HTMLInputElement>('#editAvailable')!.checked = p.activo;
  renderEditingPreview();

  const clearBtn = $<HTMLButtonElement>('#editFileClear');
  if (clearBtn) {
    clearBtn.onclick = () => {
      const prod = state.productos.find((x) => x.id === state.editingId);
      const hasCurrent = !!prod?.imagenes?.[0];
      if (state.editingFile) {
        state.editingFile = null;
      } else if (hasCurrent) {
        state.editingRemoveCurrent = !state.editingRemoveCurrent;
      }
      renderEditingPreview();
    };
  }

  const modal = $('#editModal')!;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#editName')?.focus(), 80);
}

function closeEditModal(): void {
  const modal = $('#editModal')!;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.editingId = null;
  state.editingRemoveCurrent = false;
  state.editingFile = null;
}

// Ref supabase para evitar tree-shake
void supabase;