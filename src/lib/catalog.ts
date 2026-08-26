/**
 * Casa Linda · Catálogo público
 * - Carga productos activos desde Supabase (anon key; RLS filtra por activo=true).
 * - Carga categorías para resolver el slug y la etiqueta visible de cada producto.
 * - Render del grid, filtros, búsqueda, drawer y checkout por WhatsApp.
 * - Toda inserción de datos del backend se hace con textContent / setAttribute (XSS-safe).
 */

import { supabase } from './supabase';

const WHATSAPP_NUMBER = '5352498688';
const CURRENCY = 'CUP';

interface ProductRow {
  id: string;
  nombre: string;
  precio: number;
  imagenes: string[];
  activo: boolean;
  stock: number;
  categoria_id: string | null;
}

interface CategoriaRow {
  id: string;
  slug: string;
  nombre: string;
  activa: boolean;
}

interface ProductVM {
  id: string;
  nombre: string;
  precio: number;
  categorySlug: string;
  categoryLabel: string;
  available: boolean;
  image: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  cocina: 'Cocina',
  bano: 'Baño',
  cuarto: 'Cuarto',
  sala: 'Sala',
  iluminarias: 'Iluminarias y Espejos',
  decoraciones: 'Decoraciones y Otros',
};

/* ---------- Helpers DOM ---------- */
const $ = (sel: string, root: Document | ParentNode = document) =>
  root.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string, root: Document | ParentNode = document) =>
  Array.from(root.querySelectorAll(sel));

const setText = (el: Element | null, text: string) => {
  if (el) el.textContent = text;
};

const formatPrice = (n: number) => {
  const formatted = n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted} ${CURRENCY}`;
};

let toastTimer: number | null = null;
const showToast = (message: string, type: '' | 'error' | 'success' = '') => {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast is-visible${type ? ' is-' + type : ''}`;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.className = 'toast';
  }, 2600);
};

/* ---------- Estado ---------- */
const state = {
  products: [] as ProductVM[],
  selected: new Map<string, ProductVM>(), // id -> product
  activeCategory: 'todo',
  searchQuery: '',
};

/* ---------- Datos: fetch a Supabase ---------- */
async function loadCatalog(): Promise<void> {
  const [productosRes, categoriasRes] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, precio, imagenes, activo, stock, categoria_id')
      .order('created_at', { ascending: true }),
    supabase.from('categorias').select('id, slug, nombre, activa'),
  ]);

  if (productosRes.error) {
    showToast('No se pudo cargar el catálogo. Intenta más tarde.', 'error');
    return;
  }
  if (categoriasRes.error) {
    showToast('No se pudieron cargar las categorías.', 'error');
    return;
  }

  const catsById = new Map<string, CategoriaRow>();
  (categoriasRes.data ?? []).forEach((c) => catsById.set(c.id, c as CategoriaRow));

  state.products = (productosRes.data ?? []).map((row) => {
    const r = row as ProductRow;
    const cat = r.categoria_id ? catsById.get(r.categoria_id) : null;
    const slug = cat?.slug ?? '';
    const label = cat?.nombre ?? CATEGORY_LABELS[slug] ?? '';
    return {
      id: r.id,
      nombre: r.nombre,
      precio: Number(r.precio) || 0,
      categorySlug: slug,
      categoryLabel: label,
      available: r.activo,
      image: r.imagenes?.[0] ?? null,
    };
  });
}

/* ---------- Render del grid ---------- */
function fillCard(card: HTMLElement, p: ProductVM): void {
  const isSelected = state.selected.has(p.id);
  const unavailable = !p.available;

  card.classList.toggle('is-selected', isSelected);
  card.classList.toggle('is-unavailable', unavailable);
  card.setAttribute('data-id', p.id);
  card.setAttribute('data-cat', p.categorySlug);

  const media = card.querySelector('.card-media') as HTMLElement;
  const badge = card.querySelector('.card-badge') as HTMLElement;
  const img = card.querySelector('.card-img') as HTMLImageElement;
  const noImg = card.querySelector('.card-noimg') as HTMLElement;

  if (p.image) {
    img.hidden = false;
    img.style.display = '';
    img.alt = p.nombre;
    img.onerror = () => {
      img.hidden = true;
      img.style.display = 'none';
      img.removeAttribute('src');
      img.onerror = null;
      noImg.hidden = false;
      noImg.style.display = '';
    };
    img.src = p.image;
    noImg.hidden = true;
    noImg.style.display = 'none';
  } else {
    img.hidden = true;
    img.style.display = 'none';
    img.removeAttribute('src');
    img.onerror = null;
    noImg.hidden = false;
    noImg.style.display = '';
  }
  badge.hidden = !unavailable;

  setText(card.querySelector('.card-cat'), p.categoryLabel);
  setText(card.querySelector('.card-title'), p.nombre);
  setText(card.querySelector('.card-price .amount'), p.precio.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }));

  const actionBtn = card.querySelector('.card-action') as HTMLButtonElement;
  const actionLabel = actionBtn.querySelector('.action-label') as HTMLElement;
  if (unavailable) {
    actionBtn.setAttribute('data-action', 'unavailable');
    actionBtn.disabled = true;
    actionBtn.setAttribute('aria-disabled', 'true');
    setText(actionLabel, 'No disponible');
  } else {
    actionBtn.disabled = false;
    actionBtn.removeAttribute('aria-disabled');
    actionBtn.setAttribute('data-action', isSelected ? 'remove' : 'add');
    setText(actionLabel, isSelected ? 'Seleccionado' : 'Agregar al pedido');
  }
}

function renderGrid(): void {
  const grid = $('#grid');
  const emptyMsg = $('#emptyMsg');
  const tpl = $('#tpl-product-card') as HTMLTemplateElement | null;
  if (!grid || !tpl) return;

  const q = state.searchQuery.trim().toLowerCase();
  const list = state.products.filter((p) => {
    const matchesCategory =
      state.activeCategory === 'todo' || p.categorySlug === state.activeCategory;
    const matchesSearch = !q || p.nombre.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  grid.replaceChildren();
  list.forEach((p) => {
    const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    fillCard(node, p);
    grid.appendChild(node);
  });

  if (q) {
    setText(emptyMsg, `No encontramos productos para "${state.searchQuery.trim()}".`);
  } else {
    setText(
      emptyMsg,
      'No hay productos en esta categoría por el momento.',
    );
  }
  if (emptyMsg) emptyMsg.hidden = list.length > 0;
}

/* ---------- Render del drawer ---------- */
function renderDrawer(): void {
  const body = $('#drawerBody');
  const total = $('#drawerTotal');
  const goBtn = $('#goCheckout') as HTMLButtonElement | null;
  if (!body) return;

  const items = Array.from(state.selected.values());

  if (items.length === 0) {
    body.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'drawer-empty';
    const iconWrap = document.createElement('div');
    iconWrap.className = 'drawer-empty-icon';
    iconWrap.innerHTML =
      '<svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18h32l-3 38a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4z"/><path d="M24 18v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4"/></svg>';
    const p1 = document.createElement('p');
    setText(p1, 'Aún no has seleccionado productos.');
    const p2 = document.createElement('p');
    p2.className = 'muted small';
    setText(p2, 'Explora el catálogo y agrega lo que te guste.');
    empty.append(iconWrap, p1, p2);
    body.appendChild(empty);

    setText(total, formatPrice(0));
    if (goBtn) {
      goBtn.disabled = true;
      goBtn.style.opacity = '0.5';
      goBtn.style.pointerEvents = 'none';
    }
    return;
  }

  body.replaceChildren();
  items.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'drawer-item';

    const thumb = document.createElement('div');
    thumb.className = 'drawer-thumb';
    if (p.image) {
      const im = document.createElement('img');
      im.src = p.image;
      im.alt = '';
      thumb.appendChild(im);
    } else {
      thumb.innerHTML =
        '<svg viewBox="0 0 64 64" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18h32l-3 38a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4z"/><path d="M24 18v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4"/></svg>';
    }

    const info = document.createElement('div');
    info.className = 'drawer-info';
    const name = document.createElement('p');
    name.className = 'name';
    setText(name, p.nombre);
    const price = document.createElement('p');
    price.className = 'price';
    setText(price, formatPrice(p.precio));
    info.append(name, price);

    const remove = document.createElement('button');
    remove.className = 'drawer-remove';
    remove.setAttribute('data-remove', p.id);
    remove.setAttribute('aria-label', `Quitar ${p.nombre}`);
    remove.type = 'button';
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

    item.append(thumb, info, remove);
    body.appendChild(item);
  });

  const totalAmount = items.reduce((s, p) => s + p.precio, 0);
  setText(total, formatPrice(totalAmount));
  if (goBtn) {
    goBtn.disabled = false;
    goBtn.style.opacity = '';
    goBtn.style.pointerEvents = '';
  }
}

/* ---------- Resumen checkout ---------- */
function renderCheckoutSummary(): void {
  const wrap = $('#checkoutSummary');
  if (!wrap) return;
  const items = Array.from(state.selected.values());
  const total = items.reduce((s, p) => s + p.precio, 0);

  wrap.replaceChildren();
  const h4 = document.createElement('h4');
  setText(
    h4,
    `Tu pedido (${items.length} ${items.length === 1 ? 'producto' : 'productos'})`,
  );

  const ul = document.createElement('ul');
  items.forEach((p) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    setText(left, p.nombre);
    const right = document.createElement('strong');
    setText(right, formatPrice(p.precio));
    li.append(left, right);
    ul.appendChild(li);
  });

  const totalRow = document.createElement('div');
  totalRow.className = 'total';
  const tLeft = document.createElement('span');
  setText(tLeft, 'Total estimado');
  const tRight = document.createElement('strong');
  setText(tRight, formatPrice(total));
  totalRow.append(tLeft, tRight);

  wrap.append(h4, ul, totalRow);
}

/* ---------- FAB count ---------- */
function updateFab(): void {
  const count = state.selected.size;
  const fab = $('#fab') as HTMLElement | null;
  const fabCount = $('#fabCount');
  if (!fab) return;
  setText(fabCount, String(count));
  fab.hidden = count === 0;
}

/* ---------- Drawer / Modal ---------- */
function openDrawer(): void {
  const d = $('#drawer');
  if (!d) return;
  d.classList.add('is-open');
  d.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeDrawer(): void {
  const d = $('#drawer');
  if (!d) return;
  d.classList.remove('is-open');
  d.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
function openCheckout(): void {
  if (state.selected.size === 0) return;
  closeDrawer();
  renderCheckoutSummary();
  setTimeout(() => {
    const c = $('#checkout');
    if (!c) return;
    c.classList.add('is-open');
    c.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#fNombre')?.focus(), 200);
  }, 200);
}
function closeCheckout(): void {
  const c = $('#checkout');
  if (!c) return;
  c.classList.remove('is-open');
  c.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  clearFormErrors();
}

/* ---------- Validación ---------- */
function setFieldError(name: string, message: string): void {
  const input = $(`#f${name.charAt(0).toUpperCase() + name.slice(1)}`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  if (!input) return;
  const field = input.closest('.field');
  const errorEl = $(`[data-error-for="${name}"]`);
  if (message) {
    field?.classList.add('has-error');
    if (errorEl) setText(errorEl, message);
  } else {
    field?.classList.remove('has-error');
    if (errorEl) setText(errorEl, '');
  }
}
function clearFormErrors(): void {
  ['nombre', 'telefono', 'direccion'].forEach((n) => setFieldError(n, ''));
}
function validateForm(data: {
  nombre: string;
  telefono: string;
  direccion: string;
}): boolean {
  let ok = true;
  if (!data.nombre || data.nombre.trim().length < 2) {
    setFieldError('nombre', 'Por favor, ingresa el nombre de quien recibe.');
    ok = false;
  }
  if (!data.telefono || data.telefono.trim().length < 7) {
    setFieldError('telefono', 'Ingresa un número de teléfono válido.');
    ok = false;
  }
  if (!data.direccion || data.direccion.trim().length < 8) {
    setFieldError('direccion', 'La dirección debe tener al menos 8 caracteres.');
    ok = false;
  }
  return ok;
}

/* ---------- WhatsApp ---------- */
function buildWhatsAppMessage(data: {
  nombre: string;
  telefono: string;
  direccion: string;
}): string {
  const items = Array.from(state.selected.values());
  const total = items.reduce((s, p) => s + p.precio, 0);

  const lines: string[] = [
    '¡Hola Casa Linda! 🏠',
    '',
    'Quisiera confirmar el siguiente pedido:',
    '',
  ];
  items.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.nombre} — ${formatPrice(p.precio)}`);
  });
  lines.push('');
  lines.push(`*Total estimado:* ${formatPrice(total)}`);
  lines.push('');
  lines.push('*Datos de envío:*');
  lines.push(`• Nombre: ${data.nombre.trim()}`);
  lines.push(`• Teléfono: ${data.telefono.trim()}`);
  lines.push(`• Dirección: ${data.direccion.trim()}`);
  lines.push('');
  lines.push(
    'Quedo atento(a) para confirmar disponibilidad y forma de pago. ¡Gracias!',
  );

  return lines.join('\n');
}

function sendToWhatsApp(data: { nombre: string; telefono: string; direccion: string }): void {
  const message = buildWhatsAppMessage(data);
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}

/* ---------- Eventos ---------- */
function onGridClick(e: Event): void {
  const target = e.target as HTMLElement;
  const btn = target.closest('[data-action]') as HTMLElement | null;
  if (!btn) return;
  const card = btn.closest('.card') as HTMLElement | null;
  if (!card) return;
  const id = card.dataset.id;
  if (!id) return;
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  const action = btn.dataset.action;
  if (action === 'unavailable') {
    showToast('Este producto está agotado por el momento.', 'error');
    return;
  }
  if (action === 'add') {
    state.selected.set(id, product);
    showToast(`${product.nombre} agregado`, 'success');
  } else if (action === 'remove') {
    state.selected.delete(id);
  }
  renderGrid();
  renderDrawer();
  updateFab();
}

function onDrawerClick(e: Event): void {
  const target = e.target as HTMLElement;
  const removeBtn = target.closest('[data-remove]') as HTMLElement | null;
  if (!removeBtn) return;
  const id = removeBtn.dataset.remove;
  if (!id) return;
  state.selected.delete(id);
  renderGrid();
  renderDrawer();
  updateFab();
  showToast('Producto eliminado del pedido');
}

function onFilterClick(e: Event): void {
  const target = e.target as HTMLElement;
  const btn = target.closest('.filter') as HTMLElement | null;
  if (!btn) return;
  const cat = btn.dataset.cat ?? 'todo';
  if (cat === state.activeCategory) return;

  state.activeCategory = cat;
  $$('.filter').forEach((b) => {
    const active = (b as HTMLElement).dataset.cat === cat;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderGrid();
}

function onSearchInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value;
  state.searchQuery = value;
  const clear = $('#searchClear');
  if (clear) (clear as HTMLElement).hidden = value.length === 0;
  renderGrid();
}
function onSearchClear(): void {
  state.searchQuery = '';
  const input = $('#searchInput') as HTMLInputElement | null;
  if (input) input.value = '';
  const clear = $('#searchClear') as HTMLElement | null;
  if (clear) clear.hidden = true;
  input?.focus();
  renderGrid();
}

function onOverlayClick(e: Event): void {
  const target = e.target as HTMLElement;
  if (
    target.matches('[data-close]') ||
    target.closest('[data-close]')
  ) {
    if ($('#drawer')?.classList.contains('is-open')) closeDrawer();
    else if ($('#checkout')?.classList.contains('is-open')) closeCheckout();
  }
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if ($('#checkout')?.classList.contains('is-open')) closeCheckout();
    else if ($('#drawer')?.classList.contains('is-open')) closeDrawer();
  }
}

function onSubmit(e: Event): void {
  e.preventDefault();
  const data = {
    nombre: ($('#fNombre') as HTMLInputElement | null)?.value ?? '',
    telefono: ($('#fTelefono') as HTMLInputElement | null)?.value ?? '',
    direccion: ($('#fDireccion') as HTMLTextAreaElement | null)?.value ?? '',
  };
  if (!validateForm(data)) {
    showToast('Revisa los datos del formulario.', 'error');
    return;
  }
  sendToWhatsApp(data);
  closeCheckout();
  ($('#checkoutForm') as HTMLFormElement | null)?.reset();
  showToast('Abriendo WhatsApp...', 'success');
  setTimeout(() => {
    state.selected.clear();
    renderGrid();
    renderDrawer();
    updateFab();
  }, 600);
}

function onFormInput(e: Event): void {
  const input = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (input.name) setFieldError(input.name, '');
}

/* ---------- Init ---------- */
async function init(): Promise<void> {
  const yearEl = $('#year');
  if (yearEl) setText(yearEl, String(new Date().getFullYear()));

  await loadCatalog();
  renderGrid();
  renderDrawer();
  updateFab();

  $('#grid')?.addEventListener('click', onGridClick);
  $('#categoryFilters')?.addEventListener('click', onFilterClick);
  $('#searchInput')?.addEventListener('input', onSearchInput);
  $('#searchClear')?.addEventListener('click', onSearchClear);
  $('#drawerBody')?.addEventListener('click', onDrawerClick);
  $('#drawer')?.addEventListener('click', onOverlayClick);
  $('#checkout')?.addEventListener('click', onOverlayClick);
  $('#fab')?.addEventListener('click', openDrawer);
  $('#goCheckout')?.addEventListener('click', openCheckout);
  $('#checkoutForm')?.addEventListener('submit', onSubmit);
  $('#checkoutForm')?.addEventListener('input', onFormInput);
  document.addEventListener('keydown', onKeydown);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void init();
  });
} else {
  void init();
}
