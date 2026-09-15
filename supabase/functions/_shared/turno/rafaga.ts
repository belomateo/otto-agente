// agrupar_rafaga (AGENTE.md § 3 paso 3): si el cliente mandó varios mensajes seguidos, se
// contestan juntos. La ESPERA de 4 s es responsabilidad del worker (cuándo conviene llamar a
// esto: Fase 2, logica) — lo que es código puro y se puede probar sin dormir nada es CUÁLES
// mensajes van juntos: todos los entrantes desde el último saliente (o desde el principio de la
// conversación) hasta ahora, en orden, unidos con saltos de línea. Por eso `probar-agente` y el
// worker real llaman a esto mismo antes de correr el turno.

import type { Db } from "../db.ts";

export type MensajeEntrante = { id: string; contenido: string; enviadoAt: Date };

export type Rafaga = {
  texto: string;
  mensajeIds: string[];
  // El corte para el historial (historial.ts): todo lo que pasó HASTA acá (inclusive) es
  // contexto de turnos anteriores; lo que sigue es la ráfaga de este turno, que ya va aparte
  // como el mensaje actual. Sin este corte, el mensaje de ahora aparecería dos veces.
  desde: Date;
  ultimoEnviadoAt: Date | null; // para la barandilla fuera_ventana_meta
};

export async function agruparRafaga(db: Db, conversacionId: string, ahora: Date): Promise<Rafaga> {
  const ultimoSaliente = await db.consulta<{ enviado_at: string }>(
    `select enviado_at from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at desc limit 1`,
    [conversacionId],
  );
  const desdeIso = ultimoSaliente[0]?.enviado_at ?? "1970-01-01T00:00:00Z";
  const filas = await db.consulta<{ id: string; contenido: string | null; enviado_at: string }>(
    `select id::text as id, contenido, enviado_at from mensajes
      where conversacion_id = $1 and direccion = 'entrante' and tipo = 'texto'
        and enviado_at > $2::timestamptz and enviado_at <= $3::timestamptz and contenido is not null
      order by enviado_at, id`,
    [conversacionId, desdeIso, ahora.toISOString()],
  );
  return {
    texto: filas.map((f) => String(f.contenido)).join("\n"),
    mensajeIds: filas.map((f) => String(f.id)),
    desde: new Date(desdeIso),
    ultimoEnviadoAt: filas.length ? new Date(filas[filas.length - 1].enviado_at) : null,
  };
}
