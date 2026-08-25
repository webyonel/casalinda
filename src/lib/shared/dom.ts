/** Helpers DOM minimalistas para evitar `any` y reducir boilerplate. */

export const $ = <T extends Element = Element>(
  sel: string,
  root: ParentNode = document,
): T | null => root.querySelector<T>(sel);

export const $$ = <T extends Element = Element>(
  sel: string,
  root: ParentNode = document,
): T[] => Array.from(root.querySelectorAll<T>(sel));

/** Clona el contenido de un <template id="..."> y devuelve el nodo raíz (primer hijo). */
export function cloneTemplate<T extends Element = HTMLElement>(id: string): T | null {
  const tpl = document.getElementById(id);
  if (!(tpl instanceof HTMLTemplateElement)) {
    console.error(`[dom] Template #${id} no encontrado`);
    return null;
  }
  return tpl.content.firstElementChild?.cloneNode(true) as T | null;
}

/** Limpia un contenedor y, opcionalmente, lo deja vacío (sin hijos). */
export function clear(el: Element | null): void {
  if (el) el.innerHTML = '';
}

/** Asigna texto seguro (textContent, no innerHTML) en un selector dentro de un root. */
export function setText(sel: string, text: string, root: ParentNode = document): void {
  const el = $(sel, root);
  if (el) el.textContent = text;
}

/** Toggle de `hidden` con un único argumento (true = ocultar, false = mostrar). */
export function toggleHidden(el: Element | null, hidden: boolean): void {
  if (!el) return;
  if (hidden) el.setAttribute('hidden', '');
  else el.removeAttribute('hidden');
}
