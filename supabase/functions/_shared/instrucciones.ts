// Controles de cordura de las instrucciones de Lucía (corrector de Lucía, pedido de Mateo del 10/10).
//
// Desde el 10/10 las instrucciones pueden venir de la base (instrucciones_lucia, la versión activa
// que dejó el corrector) y no solo del prompt.md publicado. Los dos problemas que hicieron volver al
// archivo el 9/10 fueron de la base: el 16/9 una prueba dejó la plantilla en 47 caracteres y Lucía
// contestaba vacío, y el 7/10 una regla cargada a mano sin pasar por pruebas le hizo decir cosas
// raras. Lo segundo lo cuida el corrector (nada pasa a activo sin su prueba al 100%); lo primero,
// esto: el worker no usa una versión de la base que no pase estos controles (cae al archivo), y el
// corrector no prueba un cambio que no los pase.
//
// Los controles son los que ya le hacían las pruebas al prompt.md, para que la base no pueda tener
// algo que el archivo no podría tener:
//  · tests/barandillas/consistencia.test.ts: la lista de fórmulas prohibidas («Prohibidas: … Un chat
//    real») está y cada fórmula la corta el control sin_relleno;
//  · tests/herramientas/enums.test.ts: el MAPA DE LA BASE DE CONOCIMIENTO trae exactamente las
//    secciones de buscar_informacion;
//  · prompt_vigente() (0050) y su prueba: empieza con «Sos Lucía,» y no quedó ningún marcador
//    ({{ }} o [[ ]]) sin resolver;
//  · CLAUDE.md § 6: no más de 300 líneas.
// Más dos de cordura: un largo razonable (ni 47 caracteres ni un libro) y las secciones numeradas
// («1. CÓMO HABLÁS»…). Puro: lo prueban tests/corrector/instrucciones.test.ts.

import { FORMULAS_DE_RELLENO } from "./barandillas/chequeos/sin_relleno.ts";
import { normalizar } from "./barandillas/texto.ts";
import { SECCIONES } from "./enums.ts";

// El prompt.md del 10/10 tiene ~17.500 caracteres y 92 líneas.
export const MINIMO_CARACTERES = 4_000;
export const MAXIMO_CARACTERES = 60_000;
export const MAXIMO_LINEAS = 300;
export const MINIMO_ENCABEZADOS = 4;
export const MINIMO_FORMULAS = 8;
// Un cambio del corrector es una oración o un párrafo: si el texto se achica más que esto, algo salió
// mal (un reemplazo que se comió media sección); si crece más, no es una corrección sino otro prompt.
export const ACHIQUE_MAXIMO = 0.7;
export const CRECIMIENTO_MAXIMO = 6_000;

export function normalizarInstrucciones(texto: string): string {
  return String(texto ?? "").replace(/\r\n?/g, "\n");
}

// «1. CÓMO HABLÁS», «5. DATOS DEL LOCAL»: número, punto y el título en mayúsculas, solo en la línea.
const ENCABEZADO = /^(\d{1,2})\. ([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ ,]*[A-ZÁÉÍÓÚÜÑ])$/;

export function encabezados(texto: string): { numero: number; linea: string }[] {
  return normalizarInstrucciones(texto)
    .split("\n")
    .map((l) => l.trim())
    .flatMap((l) => {
      const m = l.match(ENCABEZADO);
      return m ? [{ numero: Number(m[1]), linea: l }] : [];
    });
}

// Las secciones del mapa, como las lee tests/herramientas/enums.test.ts: desde la línea del título
// hasta la primera línea en blanco, cada «- seccion: …». null = no está el mapa.
export function seccionesDelMapa(texto: string): string[] | null {
  const lineas = normalizarInstrucciones(texto).split("\n");
  const i = lineas.findIndex((l) => l.includes("MAPA DE LA BASE DE CONOCIMIENTO"));
  if (i < 0) return null;
  const secciones: string[] = [];
  for (let j = i + 1; j < lineas.length && lineas[j].trim() !== ""; j++) {
    const m = lineas[j].match(/^- ([a-z-]+): /);
    if (m) secciones.push(m[1]);
  }
  return secciones;
}

// Las fórmulas de cierre prohibidas, como las lee tests/barandillas/consistencia.test.ts. null = no
// está la lista.
export function formulasProhibidas(texto: string): string[] | null {
  const t = normalizarInstrucciones(texto);
  const desde = t.indexOf("Prohibidas:");
  const hasta = t.indexOf("Un chat real", desde);
  if (desde < 0 || hasta <= desde) return null;
  return [...t.slice(desde, hasta).matchAll(/«([^»]+)»/g)].map((m) => normalizar(m[1]));
}

const ordenadas = (xs: readonly string[]) => [...xs].sort();

/** Lo que está mal, dicho para una persona. Vacío = se puede usar. */
export function controlarInstrucciones(texto: string): string[] {
  const t = normalizarInstrucciones(texto);
  if (!t.trim()) return ["las instrucciones están vacías"];
  const problemas: string[] = [];

  const primera = t.split("\n", 1)[0];
  if (!/^Sos Lucía,/.test(primera)) problemas.push("la primera línea tiene que empezar con «Sos Lucía,»");
  if (t.length < MINIMO_CARACTERES) problemas.push(`son muy cortas (${t.length} caracteres; el mínimo es ${MINIMO_CARACTERES})`);
  if (t.length > MAXIMO_CARACTERES) problemas.push(`son muy largas (${t.length} caracteres; el máximo es ${MAXIMO_CARACTERES})`);
  const lineas = t.replace(/\n+$/, "").split("\n").length;
  if (lineas > MAXIMO_LINEAS) problemas.push(`tienen ${lineas} líneas (el máximo es ${MAXIMO_LINEAS})`);
  if (/\{\{|\}\}|\[\[|\]\]/.test(t)) problemas.push("quedó un marcador sin resolver ({{ }} o [[ ]])");

  const enc = encabezados(t);
  if (enc.length < MINIMO_ENCABEZADOS) {
    problemas.push(`faltan secciones numeradas (hay ${enc.length}; tiene que haber al menos ${MINIMO_ENCABEZADOS}, como «1. CÓMO HABLÁS»)`);
  } else if (enc.some((e, i) => e.numero !== i + 1)) {
    problemas.push(`las secciones no van numeradas en orden (${enc.map((e) => e.numero).join(", ")})`);
  }

  const mapa = seccionesDelMapa(t);
  if (!mapa) {
    problemas.push("falta el MAPA DE LA BASE DE CONOCIMIENTO");
  } else {
    const faltan = SECCIONES.filter((s) => !mapa.includes(s));
    const sobran = mapa.filter((s) => !(SECCIONES as readonly string[]).includes(s));
    if (faltan.length) problemas.push(`al mapa de la base de conocimiento le faltan secciones: ${faltan.join(", ")}`);
    if (sobran.length) problemas.push(`el mapa de la base de conocimiento tiene secciones que no existen: ${sobran.join(", ")}`);
    if (!faltan.length && !sobran.length && ordenadas(mapa).join() !== ordenadas(SECCIONES).join()) {
      problemas.push("el mapa de la base de conocimiento repite secciones");
    }
  }

  const formulas = formulasProhibidas(t);
  if (!formulas) {
    problemas.push("falta la lista de cierres prohibidos («Prohibidas: …» antes de «Un chat real»)");
  } else if (formulas.length < MINIMO_FORMULAS) {
    problemas.push(`la lista de cierres prohibidos quedó corta (${formulas.length}; tiene que haber al menos ${MINIMO_FORMULAS})`);
  } else {
    const sinControl = formulas.filter((f) => !FORMULAS_DE_RELLENO.includes(f));
    if (sinControl.length) problemas.push(`cierres prohibidos que el control de relleno no corta: ${sinControl.join(", ")}`);
  }
  return problemas;
}

/**
 * Lo que una versión nueva no puede perder respecto de la que corrige: ninguna sección, y no puede
 * cambiar de tamaño de golpe (un reemplazo que se comió media sección, o un prompt nuevo entero).
 */
export function controlarContraLaBase(candidata: string, base: string): string[] {
  const c = normalizarInstrucciones(candidata);
  const b = normalizarInstrucciones(base);
  const problemas: string[] = [];
  const quedan = new Set(encabezados(c).map((e) => e.linea));
  const perdidas = encabezados(b).filter((e) => !quedan.has(e.linea)).map((e) => e.linea);
  if (perdidas.length) problemas.push(`se perdería la sección ${perdidas.map((p) => `«${p}»`).join(", ")}`);
  if (c.length < b.length * ACHIQUE_MAXIMO) problemas.push(`se achicaría demasiado (de ${b.length} a ${c.length} caracteres)`);
  if (c.length > b.length + CRECIMIENTO_MAXIMO) problemas.push(`crecería demasiado de una vez (de ${b.length} a ${c.length} caracteres)`);
  return problemas;
}

/** Huella (sha-256, en hexadecimal) de un texto: para saber si el prompt.md cambió. */
export async function huellaDe(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(normalizarInstrucciones(texto));
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
