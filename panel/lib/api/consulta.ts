// Fábricas de los route handlers de lectura (H1.8): sesión, errores y JSON en un solo lugar,
// para que cada archivo de panel/app/api/** sea la llamada a su consulta.
import 'server-only';
import type { NextRequest } from 'next/server';
import { requerirSesion, type Sesion } from './sesion';
import { desdeErrorDeBase, error, json } from './respuestas';
import { esUuid } from './validar';

function fallaDeConsulta(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return desdeErrorDeBase(e as { code?: string; message: string });
  console.error('[api] error inesperado:', e);
  return error(500, 'Error inesperado');
}

export function rutaConsulta(fn: (s: Sesion, request: NextRequest) => Promise<unknown>) {
  return async function GET(request: NextRequest) {
    const s = await requerirSesion();
    if (s instanceof Response) return s;
    try {
      const r = await fn(s, request);
      return r instanceof Response ? r : json(r);
    } catch (e) {
      return fallaDeConsulta(e);
    }
  };
}

export function rutaConsultaConId(fn: (s: Sesion, id: string, request: NextRequest) => Promise<unknown>) {
  return async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const s = await requerirSesion();
    if (s instanceof Response) return s;
    const { id } = await ctx.params;
    if (!esUuid(id)) return error(400, 'Identificador inválido');
    try {
      const r = await fn(s, id, request);
      return r instanceof Response ? r : json(r);
    } catch (e) {
      return fallaDeConsulta(e);
    }
  };
}
