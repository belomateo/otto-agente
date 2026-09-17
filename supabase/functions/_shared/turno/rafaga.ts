// agrupar_rafaga (AGENTE.md § 3 paso 3): si el cliente mandó varios mensajes seguidos, se
// contestan juntos. La ESPERA de 4 s es responsabilidad del worker (cuándo conviene llamar a
// esto: Fase 2, logica) — lo que es código puro y se puede probar sin dormir nada es CUÁLES
// mensajes van juntos: todos los entrantes desde el último saliente (o desde el principio de la
// conversación) hasta ahora, en orden, unidos con saltos de línea. Por eso `probar-agente` y el
// worker real llaman a esto mismo antes de correr el turno.

import type { Db } from "../db.ts";

export type MensajeEntrante = { id: string; contenido: string; enviadoAt: Date };

// Tipos de mensaje que se leen como texto de verdad. 'texto' es lo normal; 'button' es la
// respuesta a un botón de una plantilla (H1.14) — Meta manda el label que tocó el cliente como
// contenido ("Necesito reprogramar"). El de "Confirmo" nunca llega hasta acá: atender.ts lo
// resuelve antes, en código, sin correr el turno. El de "Necesito reprogramar" sí sigue de largo
// (queda anotado y el turno corre igual, AGENTE.md § 3): antes de este arreglo cascase acá como
// "no es texto" y Lucía contestaba que no puede leer fotos — un botón no es una foto, es una
// frase que el cliente eligió tocar en vez de escribir, y reprogramar_turno la resuelve igual
// que si la hubiera tipeado.
export const TIPOS_QUE_SON_TEXTO = ["texto", "button"];

// Hallazgo de Mateo, 16/9: sin tope, una ráfaga larga (un cliente que pega un texto gigante, o
// que no para de escribir) se mandaba entera al clasificador y al principal — costo y riesgo de
// pasarse del contexto del modelo sin ningún límite. 2500 caracteres alcanza de sobra para
// cualquier mensaje real (el propio prompt, con todo lo que dice Lucía, entra en 300 líneas).
// Decisión (hallazgo de logica, 16/9): 2500 es MENOS que los 4096 que permite un mensaje de
// WhatsApp, así que esto SÍ puede recortar un único mensaje legítimo si es lo bastante largo, no
// solo una ráfaga de varios — el costo de mandarlo entero al clasificador y al principal es el
// mismo, venga de uno o de varios mensajes, y es justo lo que este tope existe para evitar.
export const MAXIMO_CARACTERES_RAFAGA = 2500;

export type Rafaga = {
  texto: string;
  mensajeIds: string[];
  // El corte para el historial (historial.ts): todo lo que pasó HASTA acá (inclusive) es
  // contexto de turnos anteriores; lo que sigue es la ráfaga de este turno, que ya va aparte
  // como el mensaje actual. Sin este corte, el mensaje de ahora aparecería dos veces.
  desde: Date;
  ultimoEnviadoAt: Date | null; // para la barandilla fuera_ventana_meta
  // Supuesto #33: si no hay texto pero SÍ hubo algo entrante en la ventana (foto, audio,
  // sticker, ubicación...), no es lo mismo que "no pasó nada" — turno.ts contesta con el texto
  // fijo de contexto_agente en vez de quedarse en silencio.
  soloNoTexto: boolean;
  // Se pasó de MAXIMO_CARACTERES_RAFAGA: turno.ts lo deja en la bitácora, para que quede rastro
  // de que se cortó algo (principio 9: la verdad es lo que queda en la base).
  recortada: boolean;
};

export async function agruparRafaga(db: Db, conversacionId: string, ahora: Date): Promise<Rafaga> {
  const ultimoSaliente = await db.consulta<{ enviado_at: string }>(
    `select enviado_at from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at desc limit 1`,
    [conversacionId],
  );
  const desdeIso = ultimoSaliente[0]?.enviado_at ?? "1970-01-01T00:00:00Z";
  const filas = await db.consulta<{ id: string; contenido: string | null; enviado_at: string }>(
    `select id::text as id, contenido, enviado_at from mensajes
      where conversacion_id = $1 and direccion = 'entrante' and tipo = any($2::text[])
        and enviado_at > $3::timestamptz and enviado_at <= $4::timestamptz and contenido is not null
      order by enviado_at, id`,
    [conversacionId, TIPOS_QUE_SON_TEXTO, desdeIso, ahora.toISOString()],
  );
  let soloNoTexto = false;
  let ultimoEnviadoAt = filas.length ? new Date(filas[filas.length - 1].enviado_at) : null;
  if (filas.length === 0) {
    const [otros] = await db.consulta<{ n: number; ultimo: string | null }>(
      `select count(*)::int as n, max(enviado_at) as ultimo from mensajes
        where conversacion_id = $1 and direccion = 'entrante'
          and enviado_at > $2::timestamptz and enviado_at <= $3::timestamptz`,
      [conversacionId, desdeIso, ahora.toISOString()],
    );
    soloNoTexto = (otros?.n ?? 0) > 0;
    if (otros?.ultimo) ultimoEnviadoAt = new Date(otros.ultimo);
  }
  const unido = filas.map((f) => String(f.contenido)).join("\n");
  // [...t] recorre por code point (no por unidad UTF-16): un emoji de dos "caracteres" para
  // .length no se parte a la mitad.
  const puntos = [...unido];
  const recortada = puntos.length > MAXIMO_CARACTERES_RAFAGA;
  let texto = unido;
  if (recortada) {
    const corte = puntos.slice(0, MAXIMO_CARACTERES_RAFAGA);
    // Corta en el último espacio del tramo, no a la mitad de una palabra (hallazgo de logica,
    // 16/9). Si no hay ningún espacio (una sola palabra gigantesca, caso de laboratorio), no hay
    // mejor lugar: se mantiene el corte seco.
    let ultimoEspacio = -1;
    for (let i = corte.length - 1; i >= 0; i--) {
      if (/\s/.test(corte[i])) {
        ultimoEspacio = i;
        break;
      }
    }
    texto = (ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : corte).join("").trimEnd();
  }
  return {
    texto,
    mensajeIds: filas.map((f) => String(f.id)),
    desde: new Date(desdeIso),
    ultimoEnviadoAt,
    soloNoTexto,
    recortada,
  };
}
