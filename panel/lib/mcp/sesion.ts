// Conector de Sofía por MCP (13/11, Mateo): Sofía conecta su Claude al sistema y lo maneja charlando.
// Las herramientas NO tocan la base por su cuenta: llaman a las MISMAS rutas de /api que usa el panel, con una
// sesión de Supabase real (el usuario MCP_SOFIA_EMAIL, admin aprobado). Así valen los mismos permisos, validaciones,
// RLS e historial que en el panel, y cada cambio queda firmado por ese usuario («Sofía (vía Claude)»).
// requerirSesion (lib/api/sesion.ts) toma la sesión de acá cuando la ruta corre adentro del conector.
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
import type { Perfil, Sesion } from '@/lib/api/sesion';
import type { Database } from '@/lib/tipos-db';

export const sesionDelConector = new AsyncLocalStorage<Sesion>();

let guardada: { sesion: Sesion; vence: number } | null = null;

export async function sesionDeSofia(): Promise<Sesion> {
  if (guardada && guardada.vence > Date.now() + 120_000) return guardada.sesion;
  const email = process.env.MCP_SOFIA_EMAIL;
  const password = process.env.MCP_SOFIA_PASSWORD;
  if (!email || !password) throw new Error('El conector no está configurado (faltan MCP_SOFIA_EMAIL / MCP_SOFIA_PASSWORD)');
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw new Error('El conector no pudo iniciar sesión en el sistema');
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, estado, debe_cambiar_clave')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!perfil || perfil.estado !== 'aprobado' || perfil.debe_cambiar_clave || perfil.rol !== 'admin') {
    throw new Error('El usuario del conector no está aprobado como administrador');
  }
  const sesion: Sesion = { supabase: supabase as unknown as Sesion['supabase'], usuario: data.user, perfil: perfil as Perfil };
  guardada = { sesion, vence: (data.session.expires_at ?? 0) * 1000 };
  return sesion;
}
