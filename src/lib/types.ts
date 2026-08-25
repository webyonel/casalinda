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

export type EstadoPedido =
  | 'nuevo'
  | 'en_preparacion'
  | 'enviado'
  | 'entregado'
  | 'cancelado';

export interface Pedido {
  id: string;
  created_at: string;
  cliente_nombre: string;
  cliente_telefono: string;
  direccion: string | null;
  total: number;
  estado: EstadoPedido;
  payload: unknown | null;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string | null;
  cantidad: number;
  precio_unitario: number;
  nombre_snapshot: string | null;
}

/** Resultado uniforme para mutaciones: éxito con dato opcional o error legible. */
export type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
