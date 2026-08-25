/** Formatea un número como precio CUP: "$1,200.00 CUP". */
export function formatPrice(n: number | string): string {
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return '$0.00 CUP';
  const f = num.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${f} CUP`;
}

/** Etiqueta legible para el slug de categoría. */
export function formatCategoria(slug: string | null | undefined): string {
  if (!slug) return 'Sin categoría';
  const map: Record<string, string> = {
    cocina: 'Cocina',
    bano: 'Baño',
    cuarto: 'Cuarto',
    sala: 'Sala',
    iluminarias: 'Iluminarias y Espejos',
    decoraciones: 'Decoraciones y Otros',
  };
  return map[slug] ?? slug;
}

/** Etiqueta legible para el estado de un pedido. */
export function formatEstado(estado: string): string {
  const map: Record<string, string> = {
    nuevo: 'Nuevo',
    en_preparacion: 'En preparación',
    enviado: 'Enviado',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };
  return map[estado] ?? estado;
}

/** "2026-08-25 14:30" en local. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Iniciales (1-2 letras) para placeholder de imagen. */
export function initials(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}
