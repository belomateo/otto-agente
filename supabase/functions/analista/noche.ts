// Una corrida del analista de charlas (0102, pedido de Mateo del 9/10 y 10/10): toma las charlas del
// día que todavía no se revisaron, las analiza de a una (hasta CONCURRENCIA a la vez) y guarda lo que
// encontró. La base y el modelo llegan de afuera (Repositorio, LlamarModelo): así se prueba sin red
// ni base (tests/analista/noche.test.ts) y la función real los arma en index.ts.
//
// Lo que cuida:
//  · Una charla que falla no corta la noche: si el modelo no contesta, contesta algo ilegible o no se
//    puede guardar, esa charla queda como «fallo» (se reintenta una vez en otra corrida) y se sigue con
//    la próxima.
//  · Tope por noche: no más de TOPES.maxCharlas charlas ni TOPES.maxCostoUsd dólares, contando lo que
//    ya hicieron las corridas anteriores de la misma noche. Al llegar, las que quedan se marcan
//    «salteada» (se ve en el panel) y no se sigue. Como se analizan varias a la vez, el costo se puede
//    pasar por lo que cuesten las que ya estaban en curso (centavos).
//  · El tiempo: una Edge Function vive ~150 s. No se empieza una charla si no queda tiempo para
//    terminarla; lo que queda lo sigue el relevo (index.ts, analista_relevo de 0102).

import type { Uso } from "../_shared/llm/cliente.ts";
import { llamarRespuestas } from "../_shared/llm/cliente.ts";
import { costoUsd } from "../_shared/llm/precios.ts";
import { armarCharla, armarInstrucciones, armarPeticion, type CharlaDelDia, type DatosDeReferencia, MAXIMO_RELEVOS, type Razonamiento } from "./pedido.ts";
import { type Hallazgo, leerAnalisis } from "./respuesta.ts";

export type EstadoRevision = "analizando" | "analizada" | "fallo" | "salteada";
export type Revision = { conversacionId: string; estado: EstadoRevision; intentos: number; costoUsd: number; tomadaAt: Date };
export type Consumo = { modelo: string; uso: Uso; costoUsd: number };

export interface Repositorio {
  /** Las charlas de ese día en que habló Lucía, en el orden en que conviene analizarlas. */
  candidatas(fecha: string): Promise<string[]>;
  /** Las revisiones que ya hay de esa noche (cierra antes las que quedaron colgadas). */
  prepararNoche(fecha: string): Promise<Revision[]>;
  /** Toma la charla para esta corrida: los intentos que lleva, o null si ya está hecha o la tiene otra. */
  tomar(fecha: string, conversacionId: string): Promise<number | null>;
  cargarCharla(fecha: string, conversacionId: string): Promise<CharlaDelDia>;
  datosDeReferencia(fecha: string): Promise<Omit<DatosDeReferencia, "prompt">>;
  guardar(fecha: string, conversacionId: string, hallazgos: Hallazgo[], consumo: Consumo): Promise<void>;
  fallo(fecha: string, conversacionId: string, detalle: string, consumo: Consumo | null): Promise<void>;
  saltear(fecha: string, conversacionIds: string[], detalle: string): Promise<void>;
}

export type RespuestaModelo = { contenido: string | null; uso: Uso; modelo: string };
/** null = el modelo no contestó (ya reintentó una vez) o se pasó de hastaMs. */
export type LlamarModelo = (p: { instrucciones: string; charla: string }, hastaMs: number) => Promise<RespuestaModelo | null>;

export type Topes = {
  maxCharlas: number;
  maxCostoUsd: number;
  concurrencia: number;
  /** Cuánto dura una corrida como mucho (la Edge Function corta a los ~150 s). */
  limiteCorridaMs: number;
  /** Con menos que esto por delante no se empieza otra charla: no llegaría a terminarla. */
  minimoParaEmpezarMs: number;
  /** Lo que se guarda para escribir en la base después de la última respuesta. */
  margenGuardarMs: number;
  /** Una charla «analizando» hace más que esto quedó colgada (se murió la corrida que la tenía). */
  vencimientoTomaMs: number;
  /** Intentos por charla y noche: el primero y un reintento. */
  maxIntentos: number;
};

// Mateo (10/10): «cortá si pasa de, por ejemplo, 80 charlas o US$ 1 por noche». Hoy son ~25 charlas
// por día y cada análisis cuesta 1 a 3 centavos (gpt-6.1-sol, razonamiento low).
export const TOPES: Topes = {
  maxCharlas: 80,
  maxCostoUsd: 1,
  concurrencia: 3,
  limiteCorridaMs: 125_000,
  minimoParaEmpezarMs: 50_000,
  margenGuardarMs: 5_000,
  vencimientoTomaMs: 10 * 60_000,
  maxIntentos: 2,
};

export type ResumenCorrida = {
  fecha: string;
  charlas: number; // las de ese día en que habló Lucía
  tomadas: number; // las que tomó esta corrida
  analizadas: number;
  fallidas: number;
  errores: number;
  mejoras: number;
  descartados: number; // puntos del modelo que no pasaron la validación
  salteadas: number; // por tope, en esta corrida
  tope: "charlas" | "costo" | null;
  sinTiempo: boolean;
  pendientes: number; // lo que todavía puede hacer otra corrida (para pedir relevo)
  costoCorridaUsd: number;
  costoNocheUsd: number;
  detalles: string[]; // fallos y descartes, para el log de la corrida
};

/** ¿Esta revisión la puede tomar una corrida? Lo mismo que decide tomar() en la base. */
export function puedeTomarse(r: Revision | undefined, ahoraMs: number, topes: Topes): boolean {
  if (!r) return true;
  if (r.intentos >= topes.maxIntentos) return false;
  if (r.estado === "fallo") return true;
  return r.estado === "analizando" && ahoraMs - r.tomadaAt.getTime() > topes.vencimientoTomaMs;
}

/** Otra llamada solo si quedó algo, no se llegó a un tope, esta corrida avanzó y no se pasó de relevos. */
export function debePedirRelevo(r: ResumenCorrida, relevo: number): boolean {
  return r.pendientes > 0 && r.tope === null && r.tomadas > 0 && relevo < MAXIMO_RELEVOS;
}

const mensajeDe = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 300);
const redondear = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

export async function correrNoche(
  p: { fecha: string; tz: string; prompt: string },
  d: { repo: Repositorio; llamarModelo: LlamarModelo; ahora: () => number; topes?: Partial<Topes> },
): Promise<ResumenCorrida> {
  const topes: Topes = { ...TOPES, ...d.topes };
  const limite = d.ahora() + topes.limiteCorridaMs;
  const r: ResumenCorrida = {
    fecha: p.fecha, charlas: 0, tomadas: 0, analizadas: 0, fallidas: 0, errores: 0, mejoras: 0, descartados: 0,
    salteadas: 0, tope: null, sinTiempo: false, pendientes: 0, costoCorridaUsd: 0, costoNocheUsd: 0, detalles: [],
  };

  const candidatas = await d.repo.candidatas(p.fecha);
  r.charlas = candidatas.length;
  const previas = new Map((await d.repo.prepararNoche(p.fecha)).map((x) => [x.conversacionId, x]));
  // Lo que ya hicieron las corridas anteriores de la noche cuenta para los topes.
  let charlasNoche = [...previas.values()].filter((x) => x.estado !== "salteada").length;
  let costoNoche = [...previas.values()].reduce((a, x) => a + x.costoUsd, 0);
  const cola = candidatas.filter((id) => puedeTomarse(previas.get(id), d.ahora(), topes));
  r.costoNocheUsd = redondear(costoNoche);
  if (!cola.length) return r;

  const instrucciones = armarInstrucciones({ prompt: p.prompt, ...(await d.repo.datosDeReferencia(p.fecha)) });
  let reintentables = 0;
  // La primera llamada de la corrida va sola: hasta que vuelve, las demás esperan. Así las
  // instrucciones (~9.000 tokens, iguales para toda la noche) ya quedaron en el caché de OpenAI y no
  // se pagan enteras tres veces (prueba del 10/10: sin caché la charla cuesta ~US$ 0,025; con caché,
  // ~US$ 0,008).
  let primera: Promise<unknown> | null = null;

  async function registrarFallo(id: string, detalle: string, consumo: Consumo | null, intentos: number) {
    r.fallidas++;
    if (intentos < topes.maxIntentos) reintentables++;
    r.detalles.push(`${id}: ${detalle}`);
    try {
      await d.repo.fallo(p.fecha, id, detalle, consumo);
    } catch (e) {
      r.detalles.push(`${id}: tampoco se pudo anotar el fallo (${mensajeDe(e)})`);
    }
  }

  async function analizarUna(id: string, intentos: number) {
    let charla: CharlaDelDia;
    try {
      charla = await d.repo.cargarCharla(p.fecha, id);
    } catch (e) {
      await registrarFallo(id, `no se pudo leer la charla: ${mensajeDe(e)}`, null, intentos);
      return;
    }
    const armada = armarCharla(charla, p.fecha, p.tz);
    let respuesta: RespuestaModelo | null = null;
    let errorLlamada: string | null = null;
    if (primera) await primera.catch(() => {});
    try {
      const llamada = d.llamarModelo({ instrucciones, charla: armada.texto }, limite - topes.margenGuardarMs);
      primera ??= llamada;
      respuesta = await llamada;
    } catch (e) {
      errorLlamada = mensajeDe(e);
    }
    if (!respuesta) {
      const detalle = errorLlamada ? `falló la llamada al modelo: ${errorLlamada}` : "el modelo no contestó (falló dos veces o se le acabó el tiempo)";
      await registrarFallo(id, detalle, null, intentos);
      return;
    }
    const costo = costoUsd(respuesta.modelo, respuesta.uso.tokensIn, respuesta.uso.tokensOut, respuesta.uso.tokensCacheados);
    costoNoche += costo;
    r.costoCorridaUsd = redondear(r.costoCorridaUsd + costo);
    const consumo: Consumo = { modelo: respuesta.modelo, uso: respuesta.uso, costoUsd: costo };
    const lectura = leerAnalisis(respuesta.contenido, armada.numerados);
    if (!lectura) {
      await registrarFallo(id, "la respuesta del modelo no se pudo leer (no era el JSON pedido o vino cortada)", consumo, intentos);
      return;
    }
    try {
      await d.repo.guardar(p.fecha, id, lectura.hallazgos, consumo);
    } catch (e) {
      await registrarFallo(id, `no se pudo guardar lo que encontró: ${mensajeDe(e)}`, consumo, intentos);
      return;
    }
    r.analizadas++;
    r.errores += lectura.hallazgos.filter((h) => h.tipo === "error").length;
    r.mejoras += lectura.hallazgos.filter((h) => h.tipo === "mejora").length;
    r.descartados += lectura.descartados.length;
    for (const motivo of lectura.descartados) r.detalles.push(`${id}: se descartó un punto: ${motivo}`);
  }

  let siguiente = 0;
  async function trabajador() {
    while (siguiente < cola.length && r.tope === null) {
      if (limite - d.ahora() < topes.minimoParaEmpezarMs) {
        r.sinTiempo = true;
        return;
      }
      if (costoNoche >= topes.maxCostoUsd) {
        r.tope = "costo";
        return;
      }
      const id = cola[siguiente];
      const nueva = !previas.has(id);
      if (nueva && charlasNoche >= topes.maxCharlas) {
        r.tope = "charlas";
        return;
      }
      siguiente++;
      // El lugar se reserva antes de esperar a la base: entre el control y la suma no hay await, así
      // dos trabajadores no pueden pasar juntos el tope de charlas.
      if (nueva) charlasNoche++;
      let intentos: number | null;
      try {
        intentos = await d.repo.tomar(p.fecha, id);
      } catch (e) {
        if (nueva) charlasNoche--;
        reintentables++; // sigue sin tomar: la puede tomar el relevo
        r.detalles.push(`${id}: no se pudo tomar (${mensajeDe(e)})`);
        continue;
      }
      if (intentos === null) {
        if (nueva) charlasNoche--; // la tomó otra corrida, o ya estaba hecha
        continue;
      }
      r.tomadas++;
      await analizarUna(id, intentos);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, topes.concurrencia) }, () => trabajador()));

  if (r.tope !== null) {
    // Las que nunca se tocaron quedan anotadas como salteadas (se ve en el panel). Las que ya tenían
    // un fallo de antes quedan como están.
    const restantes = cola.slice(siguiente).filter((id) => !previas.has(id));
    if (restantes.length) {
      const detalle = r.tope === "costo"
        ? `la noche llegó al tope de US$ ${topes.maxCostoUsd} y esta charla no se analizó`
        : `la noche llegó al tope de ${topes.maxCharlas} charlas y esta no se analizó`;
      try {
        await d.repo.saltear(p.fecha, restantes, detalle);
        r.salteadas = restantes.length;
      } catch (e) {
        r.detalles.push(`no se pudieron anotar las salteadas (${mensajeDe(e)})`);
      }
    }
    r.pendientes = 0;
  } else {
    r.pendientes = cola.length - siguiente + reintentables;
  }
  r.costoNocheUsd = redondear(costoNoche);
  return r;
}

// La llamada de verdad (index.ts y la prueba con el modelo real): Responses con JSON estricto, como el
// principal (llm/cliente.ts). Cada charla puede tardar hasta TIMEOUT_LLAMADA_MS pensando, sin pasarse
// de hastaMs (lo que le queda a la corrida).
export const TIMEOUT_LLAMADA_MS = 90_000;

export function llamadaReal(p: { modelo: string; razonamiento: Razonamiento; fecha: string; hoy: string; fetcher?: typeof fetch }): LlamarModelo {
  return async ({ instrucciones, charla }, hastaMs) => {
    const respuesta = await llamarRespuestas(
      armarPeticion({ modelo: p.modelo, instrucciones, charla, fecha: p.fecha, hoy: p.hoy, razonamiento: p.razonamiento }),
      { hastaMs, timeoutMs: TIMEOUT_LLAMADA_MS, fetcher: p.fetcher },
    );
    return respuesta ? { contenido: respuesta.contenido, uso: respuesta.uso, modelo: p.modelo } : null;
  };
}
