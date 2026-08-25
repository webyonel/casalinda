/**
 * Tipos compartidos del panel de administración.
 * Coinciden con el esquema creado en supabase/migrations/0001_init.sql.
 *
 * Mantener sincronizados con la DB. Si añades columnas en SQL, añade el campo aquí.
 */

export type CategoriaSlug =
  | 'cocina'
  | 'bano'
  | 'cuarto'
  | 'sala'
  | 'iluminarias'
  | 'decoraciones';

export interface Categoria {
  id: string;
  slug: CategoriaSlug | string;
  nombre: string;
  orden: number;
  activa: boolean;
  created_at: string;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  categoria_id: string | null;
  imagenes: string[];
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/** Resultado uniforme para mutaciones: éxito con dato opcional o error legible. */
export type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
