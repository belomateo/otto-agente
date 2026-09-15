// Configuración › Accesos (H1.10): solicitudes de acceso y su resolución.
//
// Todo va con la sesión del admin: RLS (0010) le deja ver las solicitudes y los perfiles, y
// resolver_solicitud() (0018) decide si puede aprobar o rechazar. El email vive en
// auth.users, que RLS no deja leer: lo completa el route handler con la service role
// (app/api/accesos), que es el único lugar del panel donde se usa además de admin.ts.
import 'server-only';
import type { Sesion } from '@/lib/api/sesion';
import { haceCuanto } from '@/lib/formato';

export const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export type SolicitudAcceso = {
  id: string;
  perfil_id: string;
  nombre: string | null;
  /** Lo completa el handler (auth.users); null si no se pudo leer. */
  email: string | null;
  estado: string;
  solicitado_at: string;
  /** 'hace 12 min' */
  hace: string;
  resuelto_at: string | null;
  resuelto_por: string | null;
};

export async function listarSolicitudes(sesion: Sesion, estado: EstadoSolicitud): Promise<SolicitudAcceso[]> {
  const { data, error } = await sesion.supabase
    .from('solicitudes_acceso')
    .select(
      'id, perfil_id, estado, solicitado_at, resuelto_at, resuelto_por, perfil:perfiles!solicitudes_acceso_perfil_id_fkey(nombre)'
    )
    .eq('estado', estado)
    .order('solicitado_at', { ascending: true });
  if (error) throw error;
  const ahora = new Date();
  return (data ?? []).map((s) => ({
    id: s.id,
    perfil_id: s.perfil_id,
    nombre: s.perfil?.nombre ?? null,
    email: null,
    estado: s.estado,
    solicitado_at: s.solicitado_at,
    hace: haceCuanto(s.solicitado_at, ahora),
    resuelto_at: s.resuelto_at,
    resuelto_por: s.resuelto_por,
  }));
}

export async function resolverSolicitud(sesion: Sesion, id: string, aprobar: boolean, rol: 'admin' | 'equipo') {
  return sesion.supabase.rpc('resolver_solicitud', { p_solicitud: id, p_aprobar: aprobar, p_rol: rol });
}
