import { supabase } from '../supabase';
import type { Result } from '../types';

export interface SessionUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/** Devuelve el usuario actual o null si no hay sesión. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const role = (u.app_metadata as { role?: string } | null)?.role;
  return {
    id: u.id,
    email: u.email ?? '',
    isAdmin: role === 'admin',
  };
}

/** Inicia sesión con email + contraseña. */
export async function signIn(email: string, password: string): Promise<Result<SessionUser>> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: false, error: 'Ingresa un email válido.' };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: 'Email o contraseña incorrectos.' };
  }
  const role = (data.user.app_metadata as { role?: string } | null)?.role;
  if (role !== 'admin') {
    // Si no es admin, cerramos la sesión inmediatamente para no dejar tokens vivos.
    await supabase.auth.signOut();
    return {
      ok: false,
      error: 'Tu cuenta no tiene permisos de administrador.',
    };
  }
  return {
    ok: true,
    data: {
      id: data.user.id,
      email: data.user.email ?? trimmed,
      isAdmin: true,
    },
  };
}

/** Cierra la sesión. */
export async function signOut(): Promise<Result> {
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: 'No se pudo cerrar la sesión.' };
  return { ok: true };
}

/**
 * Se suscribe a cambios de auth. Devuelve una función para des-suscribirse.
 * `cb` se invoca con el usuario actual (o null si no hay sesión).
 */
export function subscribeAuth(cb: (user: SessionUser | null) => void): () => void {
  const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      cb(null);
      return;
    }
    const role = (session.user.app_metadata as { role?: string } | null)?.role;
    cb({
      id: session.user.id,
      email: session.user.email ?? '',
      isAdmin: role === 'admin',
    });
  });
  return () => sub.subscription.unsubscribe();
}
