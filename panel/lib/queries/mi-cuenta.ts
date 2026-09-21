// Cambio de la propia contraseña (0059, decisión de Mateo 21/9): quien tiene debe_cambiar_clave
// en true (alta directa por un admin) o cualquier persona aprobada que quiera cambiarla.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Sesion } from '@/lib/api/sesion';

/**
 * Confirma la contraseña actual re-autenticando contra un cliente aparte (sin persistir sesión,
 * no toca las cookies del request en curso). Es la única forma de comparar contra la actual sin
 * guardarla ni hashearla en ningún lado propio: se lo dejamos a GoTrue, que ya la tiene.
 *
 * persistSession:false solo evita que ESTE cliente la guarde localmente — GoTrue igual crea la
 * sesión (un par de tokens) del lado del servidor con cada signInWithPassword que sale bien.
 * Hallazgo de logica (21/9, sobre la auditoría): sin cerrar esa sesión, cada cambio de clave
 * dejaba una más viva en auth.sessions, para siempre — 308 encontradas en la cuenta real de
 * Mateo, de correr el arnés desde el 12/9.
 *
 * OJO, esto casi rompe la sesión real de quien está cambiando la clave: signOut() sin scope
 * default a 'global', que revoca TODAS las sesiones de ese usuario — la del request en curso
 * incluida, porque es la MISMA persona (mismo email) autenticándose de nuevo acá. Se reprodujo
 * de verdad en el arnés ("Auth session missing!" al llamar updateUser después) — 'local' cierra
 * SOLO la sesión que se acaba de crear acá, dejando la del request intacta.
 */
export async function claveActualEsCorrecta(email: string, password: string): Promise<boolean> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await anon.auth.signInWithPassword({ email, password });
  const correcta = !error;
  if (correcta) await anon.auth.signOut({ scope: 'local' });
  return correcta;
}

export async function terminarCambioClave(sesion: Sesion) {
  return sesion.supabase.rpc('terminar_cambio_clave');
}
