// Respuestas JSON de los route handlers (panel/app/api/**). Siempre JSON y sin caché: son
// datos de negocio de una sesión, y un 401/403 tiene que poder leerlo un fetch, no llegar
// como una página de login en HTML.
import { NextResponse } from 'next/server';

const SIN_CACHE = { 'Cache-Control': 'no-store' };

export function json<T>(datos: T, status = 200) {
  return NextResponse.json(datos, { status, headers: SIN_CACHE });
}

export function error(status: number, mensaje: string, detalle?: unknown) {
  return NextResponse.json(detalle === undefined ? { error: mensaje } : { error: mensaje, detalle }, {
    status,
    headers: SIN_CACHE,
  });
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
};

// Restricciones que comparten código con otras y necesitan su propio mensaje: el 23P01 de
// las franjas (0030) no es el de los turnos (0011).
const POR_RESTRICCION: Record<string, { status: number; mensaje: string }> = {
  franjas_turnos_sin_solapamiento: { status: 409, mensaje: 'Se pisa con otra franja de turnos del mismo día' },
};

/** Traduce un error de supabase-js a una respuesta HTTP con un mensaje en castellano. */
export function desdeErrorDeBase(e: ErrorDeBase) {
  const porRestriccion = Object.entries(POR_RESTRICCION).find(([nombre]) => e.message?.includes(nombre))?.[1];
  const conocido = porRestriccion ?? (e.code ? POR_CODIGO[e.code] : undefined);
  if (conocido) return error(conocido.status, conocido.mensaje, e.message);
  console.error('[api] error de base no mapeado:', e.code, e.message, e.details ?? '');
  return error(500, 'Error inesperado de la base');
}
