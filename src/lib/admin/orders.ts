import { supabase } from '../supabase';
import type { EstadoPedido, Pedido, PedidoItem, Result } from '../types';

export interface PedidoConItems extends Pedido {
  items: PedidoItem[];
}

/** Lista pedidos (los más recientes primero), opcionalmente filtrados por estado. */
export async function listPedidos(opts: { estado?: EstadoPedido | 'todos' } = {}): Promise<Pedido[]> {
  let q = supabase.from('pedidos').select('*').order('created_at', { ascending: false });
  if (opts.estado && opts.estado !== 'todos') q = q.eq('estado', opts.estado);
  const { data, error } = await q;
  if (error || !data) {
    console.error('[orders] listPedidos', error);
    return [];
  }
  return data as Pedido[];
}

/** Trae un pedido con sus items. */
export async function getPedidoConItems(id: string): Promise<PedidoConItems | null> {
  const { data: pedido, error: e1 } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (e1 || !pedido) return null;

  const { data: items, error: e2 } = await supabase
    .from('pedido_items')
    .select('*')
    .eq('pedido_id', id)
    .order('id', { ascending: true });

  return {
    ...(pedido as Pedido),
    items: (items ?? []) as PedidoItem[],
    ...(e2 ? {} : {}),
  };
}

/** Cambia el estado de un pedido. */
export async function updateEstado(
  id: string,
  estado: EstadoPedido,
): Promise<Result<Pedido>> {
  const { data, error } = await supabase
    .from('pedidos')
    .update({ estado })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo actualizar el estado.' };
  }
  return { ok: true, data: data as Pedido };
}

export const ESTADOS: EstadoPedido[] = [
  'nuevo',
  'en_preparacion',
  'enviado',
  'entregado',
  'cancelado',
];
