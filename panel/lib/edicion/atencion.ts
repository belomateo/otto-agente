// Atención humana (PROCESOS.md § 4, pasos 6 y 7): tomar, devolver a Lucía y cerrar una charla.
// atencion_resolver (0032) hace las dos cosas de una acción en una sola transacción: cambia
// conversaciones.estado y marca atendida cualquier derivación pendiente de esa charla — con
// quién y cuándo, que lo pone la base (mismo criterio que 0017 y 0031: nunca el request).
// Repetir una acción que no cambia nada no falla: la respuesta trae ya_estaba = true.
import 'server-only';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';

export const ACCIONES_ATENCION = ['tomar', 'devolver', 'cerrar'] as const;
export type AccionAtencion = (typeof ACCIONES_ATENCION)[number];

export async function resolverAtencion(sesion: Sesion, conversacionId: string, accion: AccionAtencion) {
  if (!esUuid(conversacionId)) return error(400, 'Identificador inválido');
  const { data, error: e } = await sesion.supabase.rpc('atencion_resolver', {
    p_conversacion: conversacionId,
    p_accion: accion,
  });
  if (e) {
    // 55000: la charla está cerrada (no se puede tomar ni devolver). El motivo, en
    // castellano, ya viene armado desde la base.
    if (e.code === '55000') return error(409, e.message);
    if (e.code === 'P0002') return error(404, 'Esa charla no existe');
    return desdeErrorDeBase(e);
  }
  return json(data);
}
