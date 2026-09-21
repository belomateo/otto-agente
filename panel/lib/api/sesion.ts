// Guarda de los route handlers. El middleware ya corta /api/** sin sesión (401) o sin
// perfil aprobado (403), pero cada handler vuelve a chequear: si mañana alguien toca el
// matcher del middleware, la API no queda abierta. RLS es la tercera capa.
import 'server-only';
import type { User } from '@supabase/supabase-js';
import { crearClienteServidor } from '@/lib/supabase/server';
import { error } from './respuestas';

export type Perfil = {
  id: string;
  nombre: string | null;
  rol: 'admin' | 'equipo';
  estado: string;
  debe_cambiar_clave: boolean;
};
export type Sesion = {
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
  usuario: User;
  perfil: Perfil;
};

// opciones.claveTemporalOk: para la única ruta que tiene que poder llamarse mientras
// debe_cambiar_clave sigue en true (cambiar la contraseña) — sin esto, nadie con la clave
// temporal podría llegar nunca a la ruta que se la deja cambiar.
export async function requerirSesion(
  opciones: { admin?: boolean; claveTemporalOk?: boolean } = {}
): Promise<Sesion | Response> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error(401, 'Sin sesión');

  const { data: perfil, error: e } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, estado, debe_cambiar_clave')
    .eq('id', user.id)
    .maybeSingle();
  if (e) {
    console.error('[api] no se pudo leer el perfil:', e.message);
    return error(503, 'No se pudo verificar el perfil');
  }
  if (!perfil || perfil.estado !== 'aprobado') return error(403, 'Tu acceso todavía no está aprobado', undefined, 'no_aprobado');
  if (perfil.debe_cambiar_clave && !opciones.claveTemporalOk) {
    return error(403, 'Tenés que cambiar tu contraseña temporal antes de seguir', undefined, 'debe_cambiar_clave');
  }
  if (opciones.admin && perfil.rol !== 'admin') return error(403, 'Solo un admin puede hacer esto');

  return { supabase, usuario: user, perfil: perfil as Perfil };
}
