// Responder desde el panel (PROCESOS.md § 4, paso 6; DISENO.md § Bandeja): el equipo escribe
// y la ruta llama a mostrador_enviar(conversacion, texto), que hace logica en la base — el
// worker lo manda por WhatsApp con la marca [mostrador]. Este archivo no reimplementa el
// envío: valida lo mínimo y llama a la función, igual que prompt.ts corre el generador en vez
// de reescribir sus reglas.
//
// Antes de escribir, la charla tiene que estar 'derivada' (Tomada): con Lucía atendiendo, el
// campo de respuesta del panel está deshabilitado ("Lucía está atendiendo. Tomá la charla
// para responder", DISENO.md § Bandeja) y esta ruta repite la condición en el servidor —
// nunca alcanza con deshabilitar el botón en la UI.
//
// Contrato asumido de mostrador_enviar(p_conversacion uuid, p_texto text) (lo define logica):
// inserta el mensaje saliente marcado [mostrador] y devuelve algo serializable a JSON; si la
// conversación no existe, P0002. `mensajes` es tabla "de sistema" (0007): solo lectura para
// aprobados, y la escribe el service_role — para que un 'equipo' pueda escribir ahí desde acá,
// la función casi seguro necesita security definer (mismo caso legítimo que
// historial_antes_de_editar, 0017), con su propio chequeo de es_usuario_aprobado() adentro.
// Mientras la función no exista en la base (todavía no la creó logica), esta ruta da 503 y no
// manda nada — mismo criterio que el prompt base (H1.9): nunca se asume enviado lo que la base
// no pudo procesar.
import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';

// 4000 es cordura (evitar un pegoteo gigante desde el panel), no un límite de WhatsApp.
export const ESQUEMA_MOSTRADOR = z.strictObject({
  texto: z.string().trim().min(1, 'No puede quedar vacío').max(4000, 'Máximo 4000 caracteres'),
});

// PostgREST cuando la función todavía no existe en la base: el código exacto varía según
// versión (PGRST202 en las más nuevas), así que también se mira el mensaje.
function faltaLaFuncion(e: { code?: string; message?: string }): boolean {
  return e.code === 'PGRST202' || /could not find the function/i.test(e.message ?? '');
}

export async function enviarMostrador(sesion: Sesion, conversacionId: string, texto: string) {
  if (!esUuid(conversacionId)) return error(400, 'Identificador inválido');

  const { data: conv, error: e0 } = await sesion.supabase
    .from('conversaciones')
    .select('id, estado')
    .eq('id', conversacionId)
    .maybeSingle();
  if (e0) return desdeErrorDeBase(e0);
  if (!conv) return error(404, 'Esa charla no existe');
  if (conv.estado === 'cerrada') return error(409, 'Esa charla está cerrada');
  if (conv.estado !== 'derivada') {
    return error(409, 'Tomá la charla antes de responder desde el panel');
  }

  // mostrador_enviar todavía no existe en los tipos generados (la crea logica): sin tipos acá,
  // como hace editar.ts con las tablas dinámicas. faltaLaFuncion() cubre el caso de que
  // tampoco exista todavía en la base misma.
  const db = sesion.supabase as unknown as SupabaseClient;
  const { data, error: e } = await db.rpc('mostrador_enviar', {
    p_conversacion: conversacionId,
    p_texto: texto,
  });
  if (e) {
    if (faltaLaFuncion(e)) {
      return error(
        503,
        'Todavía no se puede responder desde el panel: falta mostrador_enviar en la base (lo crea logica). No se mandó nada.'
      );
    }
    if (e.code === 'P0002') return error(404, 'Esa charla no existe');
    return desdeErrorDeBase(e);
  }
  return json(data ?? {}, 201);
}
