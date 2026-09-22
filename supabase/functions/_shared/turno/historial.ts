// El historial de la conversación, en el formato de mensajes de Chat Completions. Cada mensaje
// entrante es 'user'; cada saliente es 'assistant', tal cual quedó guardado — incluido el
// prefijo «[mostrador]» si lo escribió una persona del equipo desde el panel (prompt.md: "Los
// mensajes marcados [mostrador] los escribió una persona del equipo, no vos: no los contradigas
// ni te los atribuyas"). No hay una columna aparte para eso: el marcador vive en el texto, y
// así lo tiene que ver el modelo para poder reconocerlo.

import type { Db } from "../db.ts";
import { TIPOS_QUE_SON_TEXTO } from "./rafaga.ts";

export type MensajeChat = { role: "user" | "assistant"; content: string };

const MAXIMO_MENSAJES = 40;

// `hasta`: el corte de rafaga.ts (Rafaga.desde) — todo con enviado_at <= hasta es historial;
// lo que es más nuevo que eso ya es la ráfaga de este turno, que se manda aparte como el
// mensaje actual (si no se cortara acá, aparecería dos veces). Mismos tipos que agrupar_rafaga
// (TIPOS_QUE_SON_TEXTO): un botón que el cliente tocó en una charla anterior tiene que seguir
// viéndose en su historial, igual que si lo hubiera escrito.
export async function leerHistorial(db: Db, conversacionId: string, hasta: Date): Promise<MensajeChat[]> {
  const filas = await db.consulta<{ direccion: string; contenido: string | null }>(
    `select direccion, contenido from mensajes
      where conversacion_id = $1 and tipo = any($2::text[]) and contenido is not null and enviado_at <= $3::timestamptz
      order by enviado_at desc, id desc limit $4`,
    [conversacionId, TIPOS_QUE_SON_TEXTO, hasta.toISOString(), MAXIMO_MENSAJES],
  );
  return filas
    .reverse()
    .map((f) => ({ role: f.direccion === "entrante" ? "user" : "assistant", content: String(f.contenido) }));
}

// Las últimas líneas para el clasificador (AGENTE.md § 11: "Mensaje + últimas 3 líneas"): el
// mensaje de este turno con hasta 2 líneas de contexto antes, en un texto plano corto.
export function ultimasLineasParaClasificar(historial: MensajeChat[], mensajeActual: string): string {
  const previas = historial.slice(-2).map((m) => `${m.role === "user" ? "Cliente" : "Lucía"}: ${m.content}`);
  return [...previas, `Cliente: ${mensajeActual}`].join("\n");
}

// Cuándo fue el mensaje justo ANTES de esta ráfaga (mismo corte `hasta` que leerHistorial, ver
// arriba) — para saber si pasó un hueco largo desde la última vez que se hablaron. null si nunca
// hablaron antes de esta ráfaga. Pedido de Mateo, 21/9: se presenta de nuevo si pasaron más de 7
// días (turno.ts lo usa para ensanchar esPrimerMensaje).
export async function ultimoMensajeAntesDe(db: Db, conversacionId: string, hasta: Date): Promise<Date | null> {
  const [f] = await db.consulta<{ enviado_at: Date | string }>(
    `select enviado_at from mensajes
      where conversacion_id = $1 and enviado_at <= $2::timestamptz
      order by enviado_at desc limit 1`,
    [conversacionId, hasta.toISOString()],
  );
  return f ? new Date(f.enviado_at) : null;
}
