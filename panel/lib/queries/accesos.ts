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
  /** El rol VIGENTE del perfil (pedido de front, 21/9): en 'aprobada' es el que ya tiene hoy,
   *  no el que pidió al registrarse (eso es rol_solicitado, más abajo, y es otra cosa) — front
   *  lo necesita para decidir si ofrecer subir a admin o bajar a equipo. */
  rol: 'admin' | 'equipo';
  estado: string;
  solicitado_at: string;
  /** 'hace 12 min' */
  hace: string;
  resuelto_at: string | null;
  resuelto_por: string | null;
  /** Lo que la persona pidió al registrarse (0054): puramente informativo, nunca se auto-
   *  otorga — null en solicitudes viejas y en las que entraron por invitación (0053, ahí el
   *  rol ya lo puso quien invitó). El rol real lo sigue eligiendo un admin al aprobar. */
  rol_solicitado: 'admin' | 'equipo' | null;
};

export async function listarSolicitudes(sesion: Sesion, estado: EstadoSolicitud): Promise<SolicitudAcceso[]> {
  const { data, error } = await sesion.supabase
    .from('solicitudes_acceso')
    .select(
      'id, perfil_id, estado, solicitado_at, resuelto_at, resuelto_por, rol_solicitado, perfil:perfiles!solicitudes_acceso_perfil_id_fkey(nombre, rol)'
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
    rol: (s.perfil?.rol as 'admin' | 'equipo' | undefined) ?? 'equipo',
    estado: s.estado,
    solicitado_at: s.solicitado_at,
    hace: haceCuanto(s.solicitado_at, ahora),
    resuelto_at: s.resuelto_at,
    resuelto_por: s.resuelto_por,
    rol_solicitado: s.rol_solicitado as 'admin' | 'equipo' | null,
  }));
}

export async function resolverSolicitud(sesion: Sesion, id: string, aprobar: boolean, rol: 'admin' | 'equipo') {
  return sesion.supabase.rpc('resolver_solicitud', { p_solicitud: id, p_aprobar: aprobar, p_rol: rol });
}

/**
 * Sacar el acceso de alguien del equipo (decisión de Mateo, 16/9): reusa perfiles.estado =
 * 'rechazado', el mismo que deja sin acceso a quien nunca se aprobó (es_usuario_aprobado() y
 * es_admin() solo pasan con 'aprobado'). Nadie puede tocar su propio perfil (0007/0010, base):
 * eso da 42501, no hace falta chequearlo acá.
 *
 * Hallazgo de la auditoría, confirmado por Mateo (22/9): esto cortaba el acceso a DATOS (RLS),
 * pero la sesión ya emitida seguía viva — se vio en vivo con una cuenta rechazada el 19/9 que
 * podía seguir renovando su sesión. revocar_sesiones() (0062) borra sus auth.sessions (cascada
 * a refresh_tokens): no puede volver a entrar. Es la misma limitación que documenta Supabase
 * para cualquier "cerrar sesión" — un access token YA EMITIDO sigue siendo válido hasta que
 * expira solo (por defecto, hasta 1 hora), nadie puede invalidarlo antes. Si esto falla no se
 * revierte el rechazo (lo principal, cortar el acceso a datos, ya se cumplió): se loguea y
 * listo, es defensa en profundidad, no la garantía principal.
 */
export async function quitarAcceso(sesion: Sesion, perfilId: string) {
  const r = await sesion.supabase.from('perfiles').update({ estado: 'rechazado' }).eq('id', perfilId).select('id, nombre, rol, estado').maybeSingle();
  if (!r.error && r.data) {
    const { error: eSesiones } = await sesion.supabase.rpc('revocar_sesiones', { p_perfil: perfilId });
    if (eSesiones) console.error('[api] se rechazó el acceso pero no se pudieron cortar sus sesiones:', eSesiones.message);
  }
  return r;
}

/**
 * Invitar por mail (H1.10, decisión de Mateo 17/9): pre-aprobación en vez de mandar un correo
 * de Supabase (necesitaría SMTP propio y una pantalla de fijar contraseña que no existe). Se
 * registra igual que hoy (email + contraseña); manejar_alta_usuario() (0053) la deja pasar
 * directo si hay una invitación sin usar para su mail.
 */
export type Invitacion = {
  email: string;
  rol: 'admin' | 'equipo';
  invitado_por: string | null;
  creado_at: string;
  usado_at: string | null;
};

export async function listarInvitaciones(sesion: Sesion): Promise<Invitacion[]> {
  const { data, error } = await sesion.supabase
    .from('invitaciones_acceso')
    .select('email, rol, invitado_por, creado_at, usado_at')
    .order('creado_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invitacion[];
}

// crear_invitacion() es security definer y re-verifica es_admin() adentro (0053): no depende
// solo de que esta ruta ya pidió admin, porque insertar acá con rol 'admin' es hacerse admin
// solo con registrarse después.
export async function crearInvitacion(sesion: Sesion, email: string, rol: 'admin' | 'equipo') {
  return sesion.supabase.rpc('crear_invitacion', { p_email: email, p_rol: rol });
}

export async function revocarInvitacion(sesion: Sesion, email: string) {
  return sesion.supabase
    .from('invitaciones_acceso')
    .delete()
    .eq('email', email.toLowerCase())
    .is('usado_at', null)
    .select('email, rol, invitado_por, creado_at, usado_at')
    .maybeSingle();
}

/**
 * Termina el alta directa (decisión de Mateo, 21/9, auditoría de seguridad): la ruta ya creó la
 * cuenta con auth.admin.createUser (service role) — eso disparó manejar_alta_usuario() (0054),
 * que sin invitación deja un perfil 'pendiente' con el rol default. Esto lo completa: rol
 * 'equipo', 'aprobado', debe_cambiar_clave en true. completar_alta_admin() (0059) es security
 * definer y re-verifica es_admin() adentro — no depende solo de que esta ruta ya pidió admin.
 */
export async function completarAltaAdmin(sesion: Sesion, perfilId: string) {
  return sesion.supabase.rpc('completar_alta_admin', { p_perfil: perfilId });
}

/**
 * Subir de categoría (0059): hoy el rol de una cuenta se fija una sola vez, al resolver la
 * solicitud — no había forma de cambiarle el rol a alguien ya aprobado. cambiar_rol() es
 * security definer, re-verifica es_admin() adentro, y sigue pasando por trg_sin_autoedicion
 * (0018): nadie se sube el rol a sí mismo, ni por acá.
 */
export async function cambiarRol(sesion: Sesion, perfilId: string, rol: 'admin' | 'equipo') {
  return sesion.supabase.rpc('cambiar_rol', { p_perfil: perfilId, p_rol: rol });
}

/**
 * Reseteo de clave sin depender de mail (0062, pedido de Mateo 22/9): reusa el mecanismo de la
 * alta directa (0059) en vez de armar un flujo por correo — Resend en modo sandbox rebota a
 * cualquiera que no sea la cuenta dueña, así que un mail de reseteo hoy no le llegaría a nadie
 * del equipo. La ruta ya cambió la clave en auth.users (service role, admin.ts) antes de llamar
 * esto: acá solo queda dejar debe_cambiar_clave en true (forzar_cambio_clave, exige aprobado) y
 * cortarle cualquier sesión que tuviera abierta (revocar_sesiones, 0062) — la clave nueva no
 * sirve de nada si la sesión vieja sigue viva.
 */
export async function marcarClaveReseteada(sesion: Sesion, perfilId: string) {
  const r = await sesion.supabase.rpc('forzar_cambio_clave', { p_perfil: perfilId });
  if (r.error) return r;
  const { error: eSesiones } = await sesion.supabase.rpc('revocar_sesiones', { p_perfil: perfilId });
  if (eSesiones) console.error('[api] se reseteó la clave pero no se pudieron cortar sus sesiones:', eSesiones.message);
  return r;
}
