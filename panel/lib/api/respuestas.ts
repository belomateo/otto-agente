// Respuestas JSON de los route handlers (panel/app/api/**). Siempre JSON y sin caché: son
// datos de negocio de una sesión, y un 401/403 tiene que poder leerlo un fetch, no llegar
// como una página de login en HTML.
import { NextResponse } from 'next/server';

const SIN_CACHE = { 'Cache-Control': 'no-store' };

export function json<T>(datos: T, status = 200) {
  return NextResponse.json(datos, { status, headers: SIN_CACHE });
}

// codigo es aparte de detalle (hallazgo de logica, 21/9): front tenía que comparar el TEXTO del
// mensaje para distinguir "no aprobado" de otros 403 — y ese texto está para la persona, no
// para el cliente. Un código estable deja el mensaje libre de cambiar sin romper nada; se suma
// solo donde hace falta distinguir (no_aprobado, debe_cambiar_clave), no en todos los errores.
export function error(status: number, mensaje: string, detalle?: unknown, codigo?: string) {
  const cuerpo: Record<string, unknown> = { error: mensaje };
  if (detalle !== undefined) cuerpo.detalle = detalle;
  if (codigo !== undefined) cuerpo.codigo = codigo;
  return NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
}

type ErrorDeBase = { code?: string; message: string; details?: string | null; hint?: string | null };

// Códigos de Postgres/PostgREST → HTTP. Los de 0018 (resolver_solicitud) están documentados
// en la propia migración.
const POR_CODIGO: Record<string, { status: number; mensaje: string }> = {
  '23505': { status: 409, mensaje: 'Ya existe un registro con ese dato' },
  '23514': { status: 400, mensaje: 'El dato está fuera de lo permitido' },
  '23P01': { status: 409, mensaje: 'Se pisa con otro turno del mismo probador' },
  '23503': { status: 409, mensaje: 'El registro está en uso o referencia algo que no existe' },
  '22P02': { status: 400, mensaje: 'Formato inválido' },
  '22023': { status: 400, mensaje: 'Parámetro inválido' },
  '42501': { status: 403, mensaje: 'No tenés permiso para esto' },
  P0002: { status: 404, mensaje: 'No existe' },
  PGRST116: { status: 404, mensaje: 'No existe' },
  '55000': { status: 409, mensaje: 'Ya estaba resuelto' },
  '55001': { status: 409, mensaje: 'Esa persona ya tiene cuenta: cambiale el rol desde la lista, no hace falta invitarla' },
  '55002': { status: 409, mensaje: 'Ya hay una invitación pendiente para ese mail' },
  '55003': { status: 404, mensaje: 'Ese mensaje no tiene un adjunto' },
};

// textoDeLaBase: el mensaje para la persona es el que ya escribió la base, en castellano, después
// de "clave: " (0067). Lo de la dueña es un "no" que hay que explicar bien — qué día, cuántos
// minutos tiene que dejar libres, a quién pedírselo — y eso lo sabe la base, no el panel. El
// `mensaje` de acá queda de respaldo por si algún día el texto llega vacío.
type PorRestriccion = { status: number; mensaje: string; textoDeLaBase?: boolean };

// Restricciones que comparten código con otras y necesitan su propio mensaje: el 23P01 de
// las franjas (0030) no es el de los turnos (0011), ni el de un turno en un horario bloqueado o
// en un día cerrado (0067). Se buscan por substring del message (la base pone la clave literal
// al principio), en este orden; ninguna clave es parte de otra.
const POR_RESTRICCION: Record<string, PorRestriccion> = {
  franjas_turnos_sin_solapamiento: { status: 409, mensaje: 'Se pisa con otra franja de turnos del mismo día' },
  // 0067, guardia de turnos: mismo 23P01 que un choque entre turnos, pero decirle "se pisa con
  // otro turno" a quien ve la agenda vacía en ese horario lo manda a buscar un turno que no existe.
  turno_en_horario_bloqueado: { status: 409, mensaje: 'Ese horario está bloqueado' },
  turno_en_dia_cerrado: { status: 409, mensaje: 'Ese día la agenda está cerrada' },
  // 0067, bloqueos: lo que el equipo no puede hacer (42501).
  bloqueo_dia_completo_solo_duena: {
    status: 403,
    mensaje: 'Con este bloqueo no queda lugar para ningún turno ese día: cerrar el día completo lo puede hacer solo la dueña',
    textoDeLaBase: true,
  },
  bloqueo_de_la_duena: { status: 403, mensaje: 'Este horario lo bloqueó la dueña: solo ella lo puede cambiar', textoDeLaBase: true },
  // 0067, bloqueos: datos que no tienen sentido (23514).
  bloqueo_en_dia_cerrado: { status: 400, mensaje: 'Ese día la agenda ya está cerrada completa: no hace falta bloquear horarios' },
  bloqueo_dia_sin_turnos: { status: 400, mensaje: 'Ese día no se dan turnos: no hay nada que bloquear' },
  bloqueo_probador_invalido: { status: 400, mensaje: 'Ese probador no existe en la agenda' },
  bloqueos_agenda_desde_antes_de_hasta: { status: 400, mensaje: 'El bloqueo tiene que terminar después de empezar' },
  bloqueos_agenda_probador_check: { status: 400, mensaje: 'El probador tiene que ser 1 o más (o vacío, para todos)' },
};

/** Lo que la base escribió después de "clave: ", o null si no hay nada. Con mayúscula: la base
 *  a veces sigue la oración en minúscula ("clave: con este bloqueo, ...") y acá queda sola. */
function textoDespuesDeLaClave(message: string, clave: string): string | null {
  const i = message.indexOf(`${clave}:`);
  if (i < 0) return null;
  const texto = message.slice(i + clave.length + 1).trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : null;
}

/**
 * Traduce un error de supabase-js a una respuesta HTTP con un mensaje en castellano. Si es una
 * de POR_RESTRICCION, `codigo` es la clave (p. ej. 'bloqueo_de_la_duena'): son justo los errores
 * que comparten código de Postgres con otros, y el cliente los distingue por ahí, no por el texto.
 */
export function desdeErrorDeBase(e: ErrorDeBase) {
  const hallada = Object.entries(POR_RESTRICCION).find(([nombre]) => e.message?.includes(nombre));
  if (hallada) {
    const [clave, r] = hallada;
    const mensaje = (r.textoDeLaBase && textoDespuesDeLaClave(e.message, clave)) || r.mensaje;
    return error(r.status, mensaje, e.message, clave);
  }
  const conocido = e.code ? POR_CODIGO[e.code] : undefined;
  if (conocido) return error(conocido.status, conocido.mensaje, e.message);
  console.error('[api] error de base no mapeado:', e.code, e.message, e.details ?? '');
  return error(500, 'Error inesperado de la base');
}
