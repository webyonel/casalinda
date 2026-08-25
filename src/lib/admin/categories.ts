import { supabase } from '../supabase';
import type { Categoria, Result } from '../types';

/** Lista todas las categorías activas ordenadas. */
export async function listCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('categorias')
    .select('*')
    .eq('activa', true)
    .order('orden', { ascending: true });
  if (error || !data) {
    console.error('[categories] listCategorias', error);
    return [];
  }
  return data as Categoria[];
}

/**
 * Devuelve el id de la categoría por slug (las 6 son fijas y seeded).
 * Útil para convertir el `<select>` (que trabaja con slug) al FK de la tabla.
 */
export async function getCategoriaIdBySlug(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('categorias')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Busca categorías por nombre o slug para los filtros de la UI. */
export function filterBySlug(categorias: Categoria[], slug: string): Categoria[] {
  if (!slug || slug === 'todo') return categorias;
  return categorias.filter((c) => c.slug === slug);
}

/** Tipo de UI: union de 'todo' + slugs. */
export type CategoriaFilter = 'todo' | string;

/** No-op de escritura (placeholder por si en el futuro hay CRUD). */
export async function _placeholder(): Promise<Result> {
  return { ok: true };
}
