import { supabase } from '../supabase';
import type { Result } from '../types';

const BUCKET = 'productos';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Genera un id corto estilo nanoid (suficiente para evitar colisiones). */
function shortId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

/** Devuelve la extensión a partir del MIME o nombre de archivo. */
function extensionFromFile(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[file.type] ?? 'bin';
}

/** Valida un archivo de imagen y devuelve mensaje de error o null. */
export function validateImage(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return 'Formato no soportado. Usa PNG, JPG, WEBP o GIF.';
  }
  if (file.size > MAX_BYTES) {
    return 'La imagen supera el límite de 5 MB.';
  }
  return null;
}

/**
 * Sube un único archivo al bucket de productos bajo `${productId}/`.
 * Devuelve la URL pública.
 */
export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<Result<string>> {
  const err = validateImage(file);
  if (err) return { ok: false, error: err };

  const ext = extensionFromFile(file);
  const path = `${productId}/${shortId()}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (upErr) {
    return { ok: false, error: `Error subiendo imagen: ${upErr.message}` };
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, data: pub.publicUrl };
}

/** Borra una lista de URLs (paths) del bucket. Tolerante a errores. */
export async function deleteImagesByUrl(urls: string[]): Promise<Result> {
  if (urls.length === 0) return { ok: true };
  const paths = urls
    .map((url) => extractPathFromPublicUrl(url))
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return { ok: true };
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.warn('[storage] deleteImagesByUrl', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Extrae el path del bucket a partir de la URL pública de Supabase Storage. */
function extractPathFromPublicUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Path típico: /storage/v1/object/public/productos/<ruta>
    const m = u.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Genera un UUID v4 rápido (sin dependencias). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (no debería dispararse en navegadores modernos)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const MAX_IMAGE_BYTES = MAX_BYTES;
