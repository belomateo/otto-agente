// Responder desde el panel (PROCESOS.md § 4, paso 6; DISENO.md § Bandeja): el equipo escribe
// y la ruta llama a mostrador_enviar(conversacion, texto) — la creó logica en la base (0028,
// hito 2.1). Este archivo no reimplementa sus reglas (charla tomada, ventana de 24 hs, largo
// del texto): las corre, igual que prompt.ts corre el generador en vez de reescribir las
// suyas. La función deja el mensaje con la marca "[mostrador] " y encola el trabajo para el
// worker, que lo manda por WhatsApp sin la marca.
//
// Errores de mostrador_enviar, todos con el motivo en castellano en el mensaje:
//   42501  sin permiso (no aprobado)                              → 403
//   P0002  la charla no existe                                     → 404
//   55000  no está tomada ('derivada') o pasaron más de 24 hs
//          desde el último mensaje del cliente (solo deja plantilla) → 409
//   22023  el texto queda vacío o pasa los 4000 caracteres          → 400
//
// El 55000 tiene dos motivos de negocio distintos con el mismo código: front venía
// distinguiéndolos buscando "24 hs" en el texto del mensaje, que es frágil (si cambia una
// palabra del mensaje, el aviso de "escribile desde otro número" desaparece en silencio).
// Acá se traduce a un campo estable, detalle.motivo, para que front chequee eso.
import 'server-only';
import { z } from 'zod';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';

// Sin min/max: el largo y el vacío los valida mostrador_enviar (22023). Acá solo se chequea
// la forma (que sea texto), no el contenido.
export const ESQUEMA_MOSTRADOR = z.strictObject({ texto: z.string() });

const POR_CODIGO: Record<string, number> = { '42501': 403, P0002: 404, '55000': 409, '22023': 400 };

/** Motivo estable del 55000 de mostrador_enviar (0028), sin depender del texto del mensaje. */
function motivoDe55000(mensaje: string): 'ventana_cerrada' | 'no_tomada' {
  return /24 hs/.test(mensaje) ? 'ventana_cerrada' : 'no_tomada';
}

export async function enviarMostrador(sesion: Sesion, conversacionId: string, texto: string) {
  if (!esUuid(conversacionId)) return error(400, 'Identificador inválido');

  const { data, error: e } = await sesion.supabase.rpc('mostrador_enviar', {
    p_conversacion: conversacionId,
    p_texto: texto,
  });
  if (e) {
    const status = e.code ? POR_CODIGO[e.code] : undefined;
    if (status) return error(status, e.message, e.code === '55000' ? { motivo: motivoDe55000(e.message) } : undefined);
    return desdeErrorDeBase(e);
  }
  return json(data, 201);
}
