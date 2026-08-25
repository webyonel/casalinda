import { supabase } from '../supabase';
import type { Producto, Result } from '../types';
import { getCategoriaIdBySlug } from './categories';
import { deleteImagesByUrl, uploadProductImage, uuid } from './storage';

export interface CreateProductInput {
  nombre: string;
  precio: number;
  categoria_slug: string;
  activo: boolean;
  descripcion?: string | null;
  stock?: number;
  /** Imagen del producto (una sola). Opcional. */
  file?: File;
}

export interface UpdateProductInput {
  nombre?: string;
  precio?: number;
  categoria_slug?: string;
  activo?: boolean;
  descripcion?: string | null;
  stock?: number;
  /** Imagen NUEVA para reemplazar la actual. */
  file?: File;
  /** true para borrar la imagen actual sin reemplazarla. */
  remove_current_image?: boolean;
  /** @deprecated ya no se usa con imagen única; ignorado. */
  remove_images?: string[];
}

/** Lista productos. Si se pasa `categoria_slug`, filtra por esa categoría. */
export async function listProducts(opts: { categoria_slug?: string } = {}): Promise<Producto[]> {
  let q = supabase
    .from('productos')
    .select('*')
    .order('created_at', { ascending: false });

  if (opts.categoria_slug && opts.categoria_slug !== 'todo') {
    const catId = await getCategoriaIdBySlug(opts.categoria_slug);
    if (!catId) return [];
    q = q.eq('categoria_id', catId);
  }

  const { data, error } = await q;
  if (error || !data) {
    console.error('[products] listProducts', error);
    return [];
  }
  return data as Producto[];
}

/** Crea un producto. Sube la imagen (si hay) y guarda la URL. */
export async function createProduct(input: CreateProductInput): Promise<Result<Producto>> {
  const catId = await getCategoriaIdBySlug(input.categoria_slug);
  if (!catId) return { ok: false, error: 'Categoría inválida.' };

  // 1. Generar id para usarlo como carpeta en Storage (orden estable).
  const newId = uuid();

  // 2. Subir imagen si hay.
  let imageUrl: string | null = null;
  if (input.file) {
    const up = await uploadProductImage(newId, input.file);
    if (!up.ok) return { ok: false, error: up.error };
    imageUrl = up.data ?? null;
  }

  // 3. Insertar fila.
  const { data, error } = await supabase
    .from('productos')
    .insert({
      id: newId,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      precio: input.precio,
      stock: input.stock ?? 0,
      categoria_id: catId,
      imagenes: imageUrl ? [imageUrl] : [],
      activo: input.activo,
    })
    .select('*')
    .single();

  if (error || !data) {
    // Si falla el INSERT, intentamos limpiar la imagen subida.
    if (imageUrl) await deleteImagesByUrl([imageUrl]);
    return { ok: false, error: `No se pudo guardar: ${error?.message ?? 'error desconocido'}` };
  }
  return { ok: true, data: data as Producto };
}

/** Actualiza un producto. Maneja subida, reemplazo y borrado de imagen. */
export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Result<Producto>> {
  // 1. Resolver imagen nueva (si la hay).
  let newImageUrl: string | null = null;
  if (input.file) {
    const up = await uploadProductImage(id, input.file);
    if (!up.ok) return { ok: false, error: up.error };
    newImageUrl = up.data ?? null;
  }

  // 2. Construir patch.
  const patch: Record<string, unknown> = {};
  if (input.nombre !== undefined) patch.nombre = input.nombre.trim();
  if (input.descripcion !== undefined) patch.descripcion = input.descripcion?.trim() || null;
  if (input.precio !== undefined) patch.precio = input.precio;
  if (input.stock !== undefined) patch.stock = input.stock;
  if (input.activo !== undefined) patch.activo = input.activo;
  if (input.categoria_slug !== undefined) {
    const catId = await getCategoriaIdBySlug(input.categoria_slug);
    if (!catId) {
      if (newImageUrl) await deleteImagesByUrl([newImageUrl]);
      return { ok: false, error: 'Categoría inválida.' };
    }
    patch.categoria_id = catId;
  }

  // 3. Manejo de imagen (reemplazo o borrado).
  if (newImageUrl || input.remove_current_image) {
    const { data: cur } = await supabase
      .from('productos')
      .select('imagenes')
      .eq('id', id)
      .maybeSingle();
    const actuales: string[] = (cur as { imagenes?: string[] } | null)?.imagenes ?? [];
    patch.imagenes = newImageUrl ? [newImageUrl] : [];
    // Borrar la(s) anterior(es) tras commit (best-effort).
    if (actuales.length > 0 && JSON.stringify(actuales) !== JSON.stringify(patch.imagenes)) {
      await deleteImagesByUrl(actuales);
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No hay cambios para guardar.' };
  }

  const { data, error } = await supabase
    .from('productos')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    if (newImageUrl) await deleteImagesByUrl([newImageUrl]);
    return { ok: false, error: `No se pudo actualizar: ${error?.message ?? 'error'}` };
  }

  return { ok: true, data: data as Producto };
}

/** Alterna el flag activo de un producto. */
export async function toggleActivo(id: string, activo: boolean): Promise<Result<Producto>> {
  return updateProduct(id, { activo });
}

/** Elimina un producto y sus imágenes. */
export async function deleteProduct(id: string): Promise<Result> {
  // 1. Leer las URLs para borrarlas luego del Storage.
  const { data: prod } = await supabase
    .from('productos')
    .select('imagenes')
    .eq('id', id)
    .maybeSingle();
  const urls: string[] = (prod as { imagenes?: string[] } | null)?.imagenes ?? [];

  // 2. Borrar fila.
  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) {
    return { ok: false, error: `No se pudo eliminar: ${error.message}` };
  }

  // 3. Limpiar Storage (best-effort).
  if (urls.length > 0) await deleteImagesByUrl(urls);
  return { ok: true };
}