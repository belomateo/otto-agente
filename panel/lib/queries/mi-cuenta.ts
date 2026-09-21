// Cambio de la propia contraseña (0059, decisión de Mateo 21/9): quien tiene debe_cambiar_clave
// en true (alta directa por un admin) o cualquier persona aprobada que quiera cambiarla.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Sesion } from '@/lib/api/sesion';

/**
 * Confirma la contraseña actual re-autenticando contra un cliente aparte (sin persistir sesión,
 * no toca las cookies del request en curso). Es la única forma de comparar contra la actual sin
 * guardarla ni hashearla en ningún lado propio: se lo dejamos a GoTrue, que ya la tiene.
 */
export async function claveActualEsCorrecta(email: string, password: string): Promise<boolean> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await anon.auth.signInWithPassword({ email, password });
  return !error;
}

export async function terminarCambioClave(sesion: Sesion) {
  return sesion.supabase.rpc('terminar_cambio_clave');
}
