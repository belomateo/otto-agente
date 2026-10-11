// Lectura de lo que devolvió el modelo del analista (0102, 10/10). Igual que el extractor de la
// ficha (llm/extractor.ts), el JSON del modelo no se escribe tal cual: cada punto se vuelve a
// chequear en código antes de guardarlo (principio 6 de CLAUDE.md § 2). Puro: lo prueban
// tests/analista/respuesta.test.ts.
//
// Lo más importante es la cita. Un error de Lucía sin el mensaje textual no le sirve al dueño (no
// puede ir a verlo) y una cita inventada es peor que nada. Por eso la cita se busca en la charla:
// si el texto aparece en el mensaje que dijo el modelo, queda; si aparece en otro, se corrige el
// número; si no aparece en ninguno pero el número existe, se guarda el texto REAL de ese mensaje en
// vez de lo que escribió el modelo; y si tampoco hay número, el error se descarta.

import { SECCIONES } from "../_shared/enums.ts";
import {
  CATEGORIAS_ERROR,
  CATEGORIAS_MEJORA,
  GRAVEDADES,
  MAXIMO_ERRORES_POR_CHARLA,
  MAXIMO_MEJORAS_POR_CHARLA,
  type MensajeNumerado,
} from "./pedido.ts";

export type Gravedad = typeof GRAVEDADES[number];

export type Hallazgo = {
  tipo: "error" | "mejora";
  categoria: string;
  gravedad: Gravedad | null; // solo errores
  mensajeId: string | null;
  autorCita: "lucia" | "cliente" | null;
  cita: string | null;
  quePaso: string; // qué estuvo mal (error) o qué faltó (mejora)
  queConviene: string | null; // solo errores
  tema: string | null; // mejora de dato_faltante: la ficha donde iría
  textoSugerido: string | null; // solo mejoras
};

export type Lectura = { hallazgos: Hallazgo[]; descartados: string[] };

export const MAXIMO_CITA = 600;
export const MAXIMO_TEXTO = 900;

const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

// Para comparar una cita con el mensaje: sin tildes ni mayúsculas, sin la negrita de WhatsApp ni
// comillas, con los espacios juntos. El modelo a veces le saca el asterisco a «*a partir de
// $150.000*» o cambia las comillas: eso no es inventar la cita. « / » es el salto de línea con que
// pedido.ts pone cada mensaje en una línea: el modelo puede citar sin él.
export function normalizarParaCita(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/…/g, "...")
    .replace(/[*_~«»"“”'‘’¿¡]/g, "")
    .replace(/\s+\/\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Si el modelo copió la línea entera («[3] 11:34 Lucía: Hola…»), lo de adelante no es la cita.
function sinEncabezado(normalizada: string): string {
  return normalizada
    .replace(/^\[\d+\]\s*/, "")
    .replace(/^\d{1,2}:\d{2}\s*/, "")
    .replace(/^(cliente|lucia( \(plantilla automatica\))?)\s*:\s*/, "")
    .trim();
}

// ¿La cita está en el texto del mensaje? Con «...» el modelo puede saltear partes: cada tramo tiene
// que estar, en orden. Un tramo de menos de 4 letras no prueba nada («ok» está en cualquier lado),
// salvo que sea el mensaje entero («20/11»).
export function citaEnMensaje(textoMensaje: string, cita: string): boolean {
  const mensaje = normalizarParaCita(textoMensaje);
  const c = sinEncabezado(normalizarParaCita(cita));
  if (!c) return false;
  if (c === mensaje) return true;
  const tramos = c.split("...").map((t) => t.trim()).filter(Boolean);
  if (!tramos.length || tramos.every((t) => t.length < 4)) return false;
  let desde = 0;
  for (const t of tramos) {
    if (t.length < 4) continue;
    const i = mensaje.indexOf(t, desde);
    if (i < 0) return false;
    desde = i + t.length;
  }
  return true;
}

export type CitaUbicada = { mensaje: MensajeNumerado; cita: string; exacta: boolean };

export function ubicarCita(cita: string | null, numero: number | null, numerados: MensajeNumerado[]): CitaUbicada | null {
  const citado = numero !== null ? numerados.find((m) => m.numero === numero) : undefined;
  const limpia = (cita ?? "").trim();
  if (limpia) {
    if (citado && citaEnMensaje(citado.texto, limpia)) return { mensaje: citado, cita: recortar(limpia, MAXIMO_CITA), exacta: true };
    // En otro mensaje: el más cercano al número que dijo (el modelo a veces se corre uno).
    const otros = numerados.filter((m) => citaEnMensaje(m.texto, limpia));
    if (otros.length) {
      const ref = numero ?? otros[0].numero;
      const cerca = otros.reduce((a, b) => (Math.abs(b.numero - ref) < Math.abs(a.numero - ref) ? b : a));
      return { mensaje: cerca, cita: recortar(limpia, MAXIMO_CITA), exacta: true };
    }
  }
  // La cita no aparece, pero el número sí: queda el texto real del mensaje, no el del modelo.
  if (citado) return { mensaje: citado, cita: recortar(citado.texto, MAXIMO_CITA), exacta: false };
  return null;
}

const comoTexto = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");
const comoNumero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
const esDe = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);
const ORDEN_GRAVEDAD: Record<Gravedad, number> = { alta: 0, media: 1, baja: 2 };

function leerError(crudo: unknown, numerados: MensajeNumerado[]): Hallazgo | string {
  const e = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : {};
  if (!esDe(CATEGORIAS_ERROR, e.categoria)) return `error con categoría desconocida (${JSON.stringify(e.categoria)})`;
  const quePaso = comoTexto(e.que_estuvo_mal);
  if (!quePaso) return `error ${e.categoria} sin decir qué estuvo mal`;
  const ubicada = ubicarCita(comoTexto(e.cita) || null, comoNumero(e.mensaje), numerados);
  if (!ubicada) return `error ${e.categoria} sin un mensaje de ese día que lo respalde (mensaje ${JSON.stringify(e.mensaje)})`;
  if (ubicada.mensaje.autor === "equipo") return `error ${e.categoria} que cita un mensaje del equipo, no de Lucía`;
  return {
    tipo: "error",
    categoria: e.categoria,
    gravedad: esDe(GRAVEDADES, e.gravedad) ? e.gravedad : "media",
    mensajeId: ubicada.mensaje.id,
    autorCita: ubicada.mensaje.autor === "cliente" ? "cliente" : "lucia",
    cita: ubicada.cita,
    quePaso: recortar(quePaso, MAXIMO_TEXTO),
    queConviene: comoTexto(e.que_conviene) ? recortar(comoTexto(e.que_conviene), MAXIMO_TEXTO) : null,
    tema: null,
    textoSugerido: null,
  };
}

function leerMejora(crudo: unknown, numerados: MensajeNumerado[]): Hallazgo | string {
  const m = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : {};
  if (!esDe(CATEGORIAS_MEJORA, m.categoria)) return `mejora con categoría desconocida (${JSON.stringify(m.categoria)})`;
  const quePaso = comoTexto(m.que_falto);
  const sugerido = comoTexto(m.texto_sugerido);
  if (!quePaso || !sugerido) return `mejora ${m.categoria} sin decir qué faltó o sin texto sugerido`;
  // En una mejora la cita es opcional: si no se puede ubicar, va sin cita (nunca con una inventada).
  const numero = comoNumero(m.mensaje);
  const cita = comoTexto(m.cita) || null;
  const ubicada = numero !== null || cita ? ubicarCita(cita, numero, numerados) : null;
  const conCita = ubicada && ubicada.mensaje.autor !== "equipo" ? ubicada : null;
  return {
    tipo: "mejora",
    categoria: m.categoria,
    gravedad: null,
    mensajeId: conCita?.mensaje.id ?? null,
    autorCita: conCita ? (conCita.mensaje.autor === "cliente" ? "cliente" : "lucia") : null,
    cita: conCita?.cita ?? null,
    quePaso: recortar(quePaso, MAXIMO_TEXTO),
    queConviene: null,
    tema: esDe(SECCIONES, m.tema) ? m.tema : null,
    textoSugerido: recortar(sugerido, MAXIMO_TEXTO),
  };
}

// null = la respuesta no se puede leer (vacía, no es JSON, o no tiene las dos listas): la charla
// queda como fallo y se reintenta una vez en otra corrida. Si se puede leer, lo que no pasa la
// validación se descarta punto por punto, con el motivo (va al log de la corrida).
export function leerAnalisis(contenido: string | null, numerados: MensajeNumerado[]): Lectura | null {
  if (!contenido || !contenido.trim()) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(contenido);
  } catch {
    return null;
  }
  if (!crudo || typeof crudo !== "object") return null;
  const { errores, mejoras } = crudo as Record<string, unknown>;
  if (!Array.isArray(errores) || !Array.isArray(mejoras)) return null;

  const descartados: string[] = [];
  const vistos = new Set<string>();
  const sinRepetir = (h: Hallazgo) => {
    const clave = `${h.tipo}|${h.categoria}|${h.mensajeId ?? normalizarParaCita(h.quePaso)}`;
    if (vistos.has(clave)) {
      descartados.push(`${h.tipo} ${h.categoria} repetido en el mismo mensaje`);
      return false;
    }
    vistos.add(clave);
    return true;
  };

  const leidosErrores: Hallazgo[] = [];
  for (const e of errores) {
    const r = leerError(e, numerados);
    if (typeof r === "string") descartados.push(r);
    else if (sinRepetir(r)) leidosErrores.push(r);
  }
  // Los más graves primero; si vinieron de más, quedan los más graves (sort es estable: entre dos
  // de la misma gravedad, el orden del modelo).
  leidosErrores.sort((a, b) => ORDEN_GRAVEDAD[a.gravedad ?? "media"] - ORDEN_GRAVEDAD[b.gravedad ?? "media"]);
  for (const e of leidosErrores.slice(MAXIMO_ERRORES_POR_CHARLA)) descartados.push(`error ${e.categoria} de más (tope de ${MAXIMO_ERRORES_POR_CHARLA} por charla)`);

  const leidasMejoras: Hallazgo[] = [];
  for (const m of mejoras) {
    const r = leerMejora(m, numerados);
    if (typeof r === "string") descartados.push(r);
    else if (sinRepetir(r)) leidasMejoras.push(r);
  }
  for (const m of leidasMejoras.slice(MAXIMO_MEJORAS_POR_CHARLA)) descartados.push(`mejora ${m.categoria} de más (tope de ${MAXIMO_MEJORAS_POR_CHARLA} por charla)`);

  return {
    hallazgos: [...leidosErrores.slice(0, MAXIMO_ERRORES_POR_CHARLA), ...leidasMejoras.slice(0, MAXIMO_MEJORAS_POR_CHARLA)],
    descartados,
  };
}
