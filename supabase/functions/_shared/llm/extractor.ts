// LLM_EXTRACTOR (gpt-5.4-mini): arma la ficha del cliente a partir del turno completo (AGENTE.md
// § 3 paso 10 y § 7). Solo escribe lo que el cliente dijo; nunca infiere.
//
// El modelo puede volver con basura en un campo (una fecha a medias como "noviembre" en vez de
// AAAA-MM-DD: pasó en la prueba en vivo del 14/9). Por eso `validarExtraccion` vuelve a chequear
// cada campo contra su propio enum o formato ANTES de que nada llegue a actualizarFicha: un
// campo inválido se descarta y se avisa, nunca se escribe (principio 6, CLAUDE.md § 2 — acá
// tampoco el LLM decide un hecho: si no pasa la validación, no es un hecho, es ruido).
//
// El presupuesto (trabajo 5, 10/10, pedido de Mateo): el cliente pregunta «¿cuánto sale?», Lucía
// contesta «el alquiler arranca a partir de $150.000» y la ficha quedaba con presupuesto_mencionado
// = «a partir de $150.000», como si el cliente hubiera dicho que tiene esa plata. Medido en la base
// el 10/10: 161 de las 163 fichas con presupuesto tenían un precio de la casa y en 160 el cliente
// nunca escribió ese número. La causa: «presupuesto» también quiere decir cotización (el precio que
// da el que vende), el esquema no decía de quién era ese dato y el extractor lee las líneas de Lucía,
// con el precio ahí mismo. Dos defensas: la instrucción y el esquema ahora dicen que es lo que el
// CLIENTE quiere o puede gastar (defensa a), y una guarda en código (`esUnPrecioQueDijoLucia`, abajo)
// descarta el que sea un precio que dijo Lucía y que el cliente nunca nombró (defensa b).

import { montos } from "../barandillas/chequeos/precio_sin_herramienta.ts";
import { DIA_O_NOCHE, EVENTOS, ROLES_CLIENTE } from "../enums.ts";
import { CAMPOS_FICHA, formatoDeEmailValido, type Ficha } from "../herramientas/ficha.ts";
import { esFechaValida } from "../tiempo.ts";
import { llamarChat } from "./cliente.ts";
import { ESQUEMA_FICHA } from "./esquemas.ts";

export type ResultadoExtractor = { ficha: Partial<Ficha>; descartados: string[]; tokensIn: number; tokensOut: number; tokensCacheados: number; ms: number };

// Los ejemplos del presupuesto van sin el precio de hoy («$…»): enseñan lo mismo y no quedan viejos
// el día que cambie (principio 2 de CLAUDE.md § 2, aunque esto no sea el prompt de Lucía).
const INSTRUCCION =
  "Leé la charla completa (cliente y Lucía) de una casa de alquiler de trajes y completá la ficha con lo que el " +
  "cliente dijo de sí mismo, en cualquier mensaje de toda la charla, no solo el último. Nunca lo que Lucía " +
  "ofreció ni lo que vos supongas: si no lo dijo, ese campo va null. Si un dato quedó claro antes y ningún " +
  "mensaje posterior lo contradice, seguí completándolo igual (no lo dejes null solo porque el último mensaje " +
  "no lo repite). Ante la duda entre dos categorías posibles para el mismo campo, preferí null a adivinar. " +
  "fecha_evento solo si se puede saber el día exacto (AAAA-MM-DD); \"en noviembre\" o \"el mes que viene\" sin día " +
  "puntual es null, no un mes suelto. La fecha y hora para visitar el local o probarse NO son la " +
  "fecha ni el momento del evento: no las guardes en fecha_evento ni dia_o_noche. Si solo quiere " +
  "reservar una visita, los campos del evento quedan null. " +
  "presupuesto_mencionado es cuánto dijo el CLIENTE que quiere o puede gastar, con sus palabras (\"tengo hasta " +
  "cien mil\", \"no quiero gastar mucho\"). Los precios que da Lucía (\"el alquiler arranca a partir de $…\", " +
  "\"la camisa y la corbata salen $…\") NUNCA son el presupuesto del cliente, aunque él los haya pedido. Tampoco " +
  "lo es que el cliente pregunte un precio (\"¿cuánto sale?\", \"¿están todos a ese precio?\") ni que haga una " +
  "cuenta con los precios que le dio Lucía. Si el cliente no dijo cuánto quiere o puede gastar, va null.";

function limpioOnull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

// Lo que se dijo en la charla, separado por quién lo dijo, para la guarda del presupuesto. Lo arma
// turno.ts con el mismo historial que lee el extractor.
export type OrigenDeLaCharla = {
  // Todo lo que escribió el cliente (texto, botones y audios transcriptos).
  cliente: string;
  // Todo lo que le llegó del lado de Mr Otto: Lucía, los textos armados en código y el [mostrador].
  lucia: string;
  // traza.preciosDevueltos del turno: lo que devolvieron consultar_catalogo y buscar_informacion, más
  // los precios de los últimos mensajes de Lucía (loQueYaDijo, en turno.ts).
  preciosDevueltos?: number[];
};

// En una charla de alquiler de trajes, «150» a secas es 150 mil: el cliente escribe «¿están todos en
// 150?» y Lucía, «$150.000». Sin esto, el mismo precio dicho de las dos formas no se reconocería.
const enPesos = (n: number) => (n < 1000 ? n * 1000 : n);

// Defensa b (10/10): ¿el presupuesto que devolvió el modelo es un precio que dijo Lucía? Sí, cuando
// todos sus montos son precios de Lucía (en lo que escribió o en traza.preciosDevueltos) y el cliente
// no nombró ninguno. Si el cliente lo nombró (aunque fuera preguntando «¿150 mil?»), lo decide el
// modelo con la instrucción (defensa a): acá no se puede distinguir «tengo 150 mil» de «¿150 mil?».
// Sin ningún número («no tengo la plata ahora») no hay nada que comparar y se deja.
export function esUnPrecioQueDijoLucia(presupuesto: string, origen: OrigenDeLaCharla): boolean {
  const delPresupuesto = montos(presupuesto).map(enPesos);
  if (delPresupuesto.length === 0) return false;
  const delCliente = new Set(montos(origen.cliente).map(enPesos));
  if (delPresupuesto.some((n) => delCliente.has(n))) return false;
  const deLucia = new Set([...montos(origen.lucia), ...(origen.preciosDevueltos ?? []).map(Math.round)].map(enPesos));
  return delPresupuesto.every((n) => deLucia.has(n));
}

// `hoy` en la zona del negocio (AAAA-MM-DD). Se pasa y no se calcula acá para que la validación
// sea pura y testeable, igual que el resto de la función. `origen`: lo que dijo cada uno, para la
// guarda del presupuesto; sin él, el presupuesto pasa como antes.
export function validarExtraccion(
  cruda: Record<string, unknown>,
  hoy?: string,
  origen?: OrigenDeLaCharla,
): { ficha: Partial<Ficha>; descartados: string[] } {
  const ficha: Partial<Ficha> = {};
  const descartados: string[] = [];
  // Un JSON que no es un objeto (null, una lista, un número) no trae ningún campo: ficha vacía, sin
  // tirar (10/10: con `null`, cruda[campo] reventaba y el extractor cortaba con un TypeError).
  if (!cruda || typeof cruda !== "object" || Array.isArray(cruda)) return { ficha, descartados };
  for (const campo of CAMPOS_FICHA) {
    const valor = limpioOnull(cruda[campo]);
    if (valor === null) continue;
    if (campo === "evento" && !(EVENTOS as readonly string[]).includes(valor)) { descartados.push(`evento="${valor}"`); continue; }
    if (campo === "rol" && !(ROLES_CLIENTE as readonly string[]).includes(valor)) { descartados.push(`rol="${valor}"`); continue; }
    if (campo === "dia_o_noche" && !(DIA_O_NOCHE as readonly string[]).includes(valor)) { descartados.push(`dia_o_noche="${valor}"`); continue; }
    if (campo === "fecha_evento" && !esFechaValida(valor)) { descartados.push(`fecha_evento="${valor}" (no es AAAA-MM-DD)`); continue; }
    // Una fecha que ya pasó no es un dato: es el modelo poniéndole un año que el cliente nunca
    // dijo. Los otros tres caminos que escriben la ficha ya la rechazaban (guardar_datos_cliente,
    // agendar_turno:73, buscar_horarios:71) y este no, así que el extractor —que corre en el
    // finally de CADA turno— podía pisar la ficha con una fecha pasada. Y el daño no se veía acá:
    // a partir de ese momento buscar_horarios y agendar_turno rechazan todo, Lucía le dice al
    // cliente que SU fecha ya pasó, y no hay forma de que saque turno. Red-team del 24/9: en 2 de
    // 6 charlas, "20 de junio" quedó como 2025-06-20 y "25 de octubre" como 2025-10-25, con el
    // cliente pidiendo el turno dos veces y sin conseguirlo nunca.
    if (campo === "fecha_evento" && hoy && valor < hoy) { descartados.push(`fecha_evento="${valor}" (ya pasó: hoy es ${hoy})`); continue; }
    if (campo === "email" && !formatoDeEmailValido(valor)) { descartados.push(`email="${valor}" (no tiene forma de mail)`); continue; }
    if (campo === "presupuesto_mencionado" && origen && esUnPrecioQueDijoLucia(valor, origen)) {
      descartados.push(`presupuesto_mencionado="${valor}" (es un precio que dijo Lucía, no lo que el cliente quiere gastar)`);
      continue;
    }
    ficha[campo] = valor;
  }
  return { ficha, descartados };
}

export async function extraer(
  turnoCompletoTexto: string,
  fetcher?: typeof fetch,
  hoy?: string,
  origen?: OrigenDeLaCharla,
): Promise<ResultadoExtractor | null> {
  const r = await llamarChat(
    {
      model: Deno.env.get("LLM_EXTRACTOR") ?? "",
      messages: [
        { role: "system", content: INSTRUCCION + (hoy ? ` Fecha actual en Argentina: ${hoy}. Usá ese año para interpretar fechas sin año; nunca inventes un año pasado.` : "") },
        { role: "user", content: turnoCompletoTexto },
      ],
      response_format: { type: "json_schema", json_schema: { name: "ficha", schema: ESQUEMA_FICHA, strict: true } },
      max_completion_tokens: 400,
    },
    fetcher,
  );
  if (!r || !r.contenido) return null;
  let cruda: Record<string, unknown>;
  try {
    cruda = JSON.parse(r.contenido);
  } catch (e) {
    console.error("extraer: la respuesta no fue JSON válido", r.contenido, e);
    return null;
  }
  // JSON válido pero que no es la ficha (null, una lista, un texto suelto): mismo trato que un JSON
  // roto. El turno sigue igual; la ficha la levanta el turno que viene, que lee la charla entera.
  if (!cruda || typeof cruda !== "object" || Array.isArray(cruda)) {
    console.error("extraer: la respuesta no fue un objeto con la ficha", r.contenido);
    return null;
  }
  const { ficha, descartados } = validarExtraccion(cruda, hoy, origen);
  return { ficha, descartados, tokensIn: r.uso.tokensIn, tokensOut: r.uso.tokensOut, tokensCacheados: r.uso.tokensCacheados, ms: r.ms };
}
