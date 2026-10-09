// precio_sin_herramienta (contenido) — todo precio sale de consultar_catalogo o de
// consultar_accesorios en este turno (reglas 8 y 9). Se leen los montos del texto ($150.000,
// 150000, 150 mil) y cada uno tiene que ser uno que haya devuelto una herramienta: un precio
// sin herramienta o un total armado sumando se rehace.
//
// Hallazgo de Mateo, 16/9: la primera versión de esto (16/9, a la mañana) buscaba un monto corto
// y pelado (sin $, sin "mil") solo pegado a una lista fija de palabras de precio ("sale",
// "cuesta", "son", "anda en"). Se escapaba con cualquier frase que no estuviera en la lista: "te
// queda en unos 150", "te lo dejo en 150", "por 150 te llevás el combo", "arranca en 150". Dado
// vuelta: en vez de una lista de palabras que SÍ valen, cualquier número suelto de 2 o 3 cifras
// es sospechoso — y se descarta solo si el contexto lo explica de otra forma (un talle, una
// altura, la dirección del local, una hora, una edad, una cantidad de cuotas o de personas). La
// acción de esta barandilla es "rehacer", no "derivar": un falso positivo sale barato (Lucía
// reescribe el mensaje), así que conviene errar de este lado antes que dejar pasar un precio
// inventado.
//
// Hallazgo de logica probando en vivo, 20/9 (bug real, prioridad alta): "sale barato" dejó de
// ser cierto para un caso puntual pero garantizado — un nombre de perfil de WhatsApp con un
// número chico ("Martin 23", "Caro 22", "Juan 10"). Lucía saluda por el nombre en el primer
// mensaje de la charla, la barandilla lee el número como precio, pide rehacer, y el modelo
// vuelve a saludar por el MISMO nombre porque no puede evitarlo: barandilla_doble garantizado,
// siempre, en el primerísimo mensaje. Ahora se enmascara el nombre del cliente antes de buscar
// montos (ver enmascararNombre).

import { normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const aNumero = (s: string) => Number(s.replace(/[.\s]/g, ""));

// Contextos donde un número de 2 o 3 cifras NO es un precio. Se enmascaran ANTES de buscar
// números sueltos (así "talle 48" no dispara con el 48, pero "sale 48" sí).
const CONTEXTOS_QUE_NO_SON_PRECIO: RegExp[] = [
  /\d+(?:[.,]\d+)?\s*(?:mil|lucas|k)\b/g, // "150 mil": ya lo cuenta la regla del millar, es OTRO monto
  // Horarios y minutos (revisión de las últimas 30 charlas, 4/10): "los sábados hasta las 18",
  // "de 9:30 a 12", "entre las 10 y las 18" y "10 minutos de tolerancia" se leían como precios
  // de $18, $12, $10. Con cuatro preguntas juntas (horarios, seña, precio, pagos) Lucía lo
  // contestó bien, la barandilla saltó dos veces y la charla terminó derivada.
  /\b(?:de|desde)\s+(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?\s*(?:a|hasta)\s+(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?\b/g,
  /\blas?\s+\d{1,2}(?:[:.]\d{2})?\b(?!\s*(?:mil|lucas|k)\b)/g,
  /\b\d{1,3}\s*(?:minutos?|min)\b/g,
  // Cumples de 15: "un cumple de 15", "una fiesta de 15", "tu 15".
  /\b(?:cumple|fiesta|fiestas|quince)\s+de\s+\d{1,2}\b/g,
  /\b(?:un|tu|su|sus|los)\s+15\b/g,
  /\btalles?\s+\d{1,3}\s*(?:al?|hasta|[-–])\s*\d{1,3}\b/g, // "talles 4–16"
  // Talles y edades de chicos (5/10, repitiendo una charla con preguntas por un nene): "talles 14
  // y 16", "en talle 14 o 16", "un chico de 12", "le puede ir un 14" se leían como precios.
  /\btalles?\s+\d{1,3}(?:\s*(?:,|y|o|[-–/])\s*(?:el\s+)?\d{1,3})+\b/g,
  /\b(?:chicos?|chicas?|nenes?|nenas?|ninos?|ninas?|hijos?|hijas?|pibes?)\s+de\s+\d{1,2}(?:\s+a\s+\d{1,2})?\b/g,
  /\b(?:usa|usaria|calza|ir|va|iria|queda|quedaria)\s+(?:un|el)\s+\d{1,2}(?:\s+o\s+(?:un\s+|el\s+)?\d{1,2})?\b/g,
  /\btalle\s+\d{1,3}\b/g, // "talle 4" o "talle 48"
  // Talles de saco en número (8/10, el fragmento de talles dice "hasta el 68"): "el 62 entra",
  // "un 56", "hasta el 68". Del 44 al 68, que no es un precio que se diga así.
  /\b(?:el|un|tu|su|hasta\s+el)\s+(?:4[4-9]|5\d|6[0-8])\b(?!\s*(?:mil|lucas|k|%|pesos))/g,
  /\bdel?\s+\d{1,3}\s+al?\s+\d{1,3}\b/g, // "del 4 al 16" y "del 44 al 68"
  /\b(?:mide|mido|medis|medimos|altura)\s+\d{2,3}\b/g, // "mide/medís 170", "altura 170"
  /\b\d{2,3}\s+de\s+altura\b/g, // "170 de altura"
  /\b\d{2,3}\s*cm\b/g, // "170cm" / "170 cm"
  /\ba\s+las?\s+\d{1,2}\b(?!\s*[:.]\d)/g, // hora sin dos puntos: "a las 15"
  /\b\d{1,2}\s*(?:hs|h|horas)\b/g, // hora: "15 hs"
  /\b\d{1,3}\s+(?:cuotas?|pagos?|meses)\b/g, // "en 3 cuotas"
  /\b\d{1,3}\s+(?:personas?|invitados?|pax|asistentes?|acompanantes?)\b/g, // cantidad de gente
  /\b\d{1,3}\s+anos\b/g, // edad: "tengo 44 años"
  /\bcumpleanos\s+de\s+\d{1,3}\b/g, // "cumpleaños de 15" (quinceañero: el número es el evento, no un precio)
  /\bespana\s+\d{2,4}\b/g, // la dirección del local (España 764)
  // Fechas y horarios de turno (hallazgo de Mateo, 16/9, URGENTE: rompía agendar_turno — "te
  // agendo el martes 23" leía 23 como precio, la barandilla no dejaba salir la confirmación).
  // "el martes 23" y "Sábado 10/10" (8/10: el día de la semana se comía el "10" de adelante, el
  // "/10" que quedaba se leía como un precio de $10 y la lista de turnos terminaba derivada).
  /\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b/g,
  /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g, // "23 de septiembre"
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // "23/9", "23/09/2026"
  // "el 23" a secas (sin día de la semana ni mes al lado, o con "de" seguido de algo que no es
  // un mes — "el 23 de la tarde"): en español nadie dice un precio así ("te sale el 90" no es
  // una frase real); acotado a 1-31 para no comerse un "el 150" si alguna vez apareciera.
  // "del 30" y "al 30" también (caso real del 5/10: "para tu casamiento del 30" se leyó
  // como un precio de $30, saltó dos veces y la charla terminó derivada hasta el día siguiente).
  /\b(?:el|del|al)\s+(?:[12]?\d|3[01])\b/g,
  // Porcentaje (hallazgo de la auditoría, 17/9): "se abona el 100%" o "la seña es del 50 por
  // ciento" no son precios — son la sección que-incluye/reserva-y-garantia hablando de una
  // proporción, no un monto en pesos.
  /\b\d{1,3}\s*%/g,
  /\b\d{1,3}\s+por\s*ciento\b/g,
  // Días de anticipación (hallazgo en vivo, 1/10: 7 de 9 derivaciones por barandilla_doble en una
  // semana eran ESTO, no el modelo inventando precios). El fragmento "anticipacion" dice "lo
  // ideal es entre 60 y 7 días antes del evento" — Lucía lo cita bien (sale de
  // buscar_informacion, no inventado) y la barandilla igual lo lee como un precio de $60, pide
  // rehacer, Lucía repite el mismo dato porque es el correcto, y se cae a derivación. "entre A y B
  // días" va primero porque "60" ahí no está pegado a "días" (lo está "7"), así que el patrón
  // general de abajo no lo agarra solo. Lo mismo dicho "de 60 a 7 días" o "desde 60 hasta 7
  // días" (2/10: saltó por "$60" con el dato bien citado).
  /\b(?:entre|de|desde)\s+\d{1,3}\s+(?:y|a|hasta)\s+\d{1,3}\s+dias?\b/g,
  /\b\d{1,3}\s+dias?\b/g,
];

function enmascararContexto(normalizado: string): string {
  return CONTEXTOS_QUE_NO_SON_PRECIO.reduce((s, re) => s.replace(re, (m) => "·".repeat(m.length)), normalizado);
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// El nombre del cliente (probadores en vivo, 20/9, hallazgo de logica): un nombre de perfil de
// WhatsApp con un número chico ("Martin 23") revienta esto — Lucía saluda por el nombre ("Hola,
// Martin 23!"), la barandilla lee el 23 como precio, pide rehacer, el modelo vuelve a saludar
// por el mismo nombre (no puede evitarlo) y salta de nuevo: barandilla_doble garantizado, en el
// PRIMER mensaje de la charla, para cualquier nombre de WhatsApp con un número corto — "Juan 10",
// "Caro 22", "Fer 7" son comunísimos. Se enmascara el nombre ANTES de cualquier otra búsqueda
// (no solo la del número suelto): si alguna vez alguien se llama "Juan 15000", tampoco vale.
function enmascararNombre(normalizado: string, nombreCliente: string): string {
  const nombre = normalizar(nombreCliente).trim();
  if (!nombre) return normalizado;
  // Desde el 4/10 la ficha trae el nombre ya limpio ("Martin 23" → "Martin", nombre.ts): el número
  // que venga pegado atrás también es del perfil, no un precio.
  return normalizado.replace(new RegExp(`\\b${escaparRegex(nombre)}(?:\\s+\\d{1,4})?\\b`, "g"), (m) => "·".repeat(m.length));
}

// Teléfonos (Mateo, 5/10): con el evento hoy o mañana el sistema le pasa al cliente el número del
// local, y el 54, el 341 y el 239 de "+54 9 341 239 2502" se leían como precios: la pieza se
// descartaba y salía el texto genérico, sin el número. Un teléfono son diez dígitos o más, juntos
// o separados por un espacio o un guion (un precio separa los miles con punto). Va antes que todo,
// como el nombre, porque las reglas del millar y de cinco cifras también lo leerían.
const TELEFONO = /(?:\+\s?)?\d(?:[\s-]?\d){9,}/g;
const enmascararTelefonos = (normalizado: string) => normalizado.replace(TELEFONO, (m) => "·".repeat(m.length));

export function montos(t: string, nombreCliente?: string | null): number[] {
  let crudo = enmascararTelefonos(normalizar(String(t ?? "")));
  if (nombreCliente) crudo = enmascararNombre(crudo, nombreCliente);
  const res = new Set<number>();
  // "$150 mil" o "$33,5 mil" no son $150 ni $33: el monto lo cuenta la regla del millar de abajo
  // (4/10: Lucía dijo "$150 mil", saltó por "$150" y terminó sin dar el precio que tenía).
  // Una coma o un punto DESPUÉS del monto corta la cifra solo si sigue otro dígito ("$33,5 mil");
  // si sigue un espacio es la puntuación de la oración. Caso real del 6/10: "camisa y
  // corbata por $33.500, y zapatos y cinturón por $55.000, cada conjunto…" se leía como $33 y $55
  // —la coma de la oración hacía retroceder al patrón hasta los miles—, saltó dos veces y la
  // charla terminó derivada con los precios bien dados.
  for (const m of crudo.matchAll(/\$\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?(?![\d]|,\d)(?!\s*(?:mil|lucas|k)\b)/g)) res.add(aNumero(m[1]));
  for (const m of crudo.matchAll(/(?<![\d$.,])(\d{1,3}(?:\.\d{3})+)(?![\d]|[.,]\d)/g)) res.add(aNumero(m[1]));
  for (const m of crudo.matchAll(/(?<![\d$.,])(\d{5,})(?![\d]|[.,]\d)/g)) res.add(Number(m[1]));
  for (const m of crudo.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:mil|lucas|k)\b/g)) {
    res.add(Math.round(Number(m[1].replace(",", ".")) * 1000));
  }
  // Cualquier número suelto de 2 o 3 cifras, salvo que el contexto lo explique de otra forma.
  // Hallazgo de Mateo, 16/9 (tercera vuelta): (?![\d.,:]) descartaba con CUALQUIER puntuación
  // después, incluida la de la oración — "son 150, más el accesorio" y "son 150. Te sirve?" no
  // se detectaban, que es casi todo precio al final de una frase. El punto/coma/dos puntos solo
  // separa un número de otro (150.000, 15:30) cuando sigue OTRO DÍGITO pegado; si sigue una
  // palabra o un espacio, es puntuación de la oración y no descarta nada. Mismo criterio para
  // atrás: 000 en 150.000 va precedido de dígito+punto pegado, no de puntuación suelta.
  const enmascarado = enmascararContexto(crudo);
  for (const m of enmascarado.matchAll(/(?<!\d)(?<!\d[.,:])(\d{2,3})(?!\d)(?![.,:]\d)/g)) res.add(Number(m[1]));
  return [...res].filter((n) => Number.isFinite(n) && n > 0);
}

// Las sumas de 2 a 4 precios respaldados (con repetición: dos trajes son 2 × $150.000). Un total
// así no es un precio inventado, es una cuenta que la regla 9 no deja hacer.
const MAXIMO_SUMANDOS = 4;
function sumasDe(precios: number[]): Set<number> {
  const base = [...new Set(precios)].filter((p) => p > 0).slice(0, 12);
  const sumas = new Set<number>();
  const recorrer = (desde: number, cuantos: number, acumulado: number) => {
    if (cuantos >= 2) sumas.add(acumulado);
    if (cuantos === MAXIMO_SUMANDOS) return;
    for (let i = desde; i < base.length; i++) recorrer(i, cuantos + 1, acumulado + base[i]);
  };
  recorrer(0, 0, 0);
  return sumas;
}

// Saca el total en código (segundo intento: ya se le pidió una vez que no sume y volvió a sumar). Se
// va la oración entera que lo dice, salvo cuando el total es un agregado al final de una oración que
// ya dio los precios («…y los zapatos $55.000, en total $205.000» → «…y los zapatos $55.000.»). Caso
// real (8/10, repitiendo la charla): cortar en cualquier coma o antes de «sería» dejaba frases como
// «Sí, tomando esos valores de referencia, el total.». Si del mensaje no queda nada, devuelve "".
const letras = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
// Una oración que arranca con «Sí», «Exacto»… está confirmando la cuenta del cliente: se va entera.
const CONFIRMA = /^(?:si|exacto|exactamente|correcto|asi es|tal cual|claro)\b/;
function sinElTotal(texto: string, totales: number[], respaldados: Set<number>, nombreCliente?: string | null): string {
  const dice = (s: string, lista: (m: number) => boolean) => montos(s, nombreCliente).some(lista);
  const esTotal = (m: number) => totales.includes(m);
  const linea = (l: string) =>
    l.split(/(?<=[.!?…])\s+/).flatMap((oracion) => {
      if (!dice(oracion, esTotal)) return [oracion];
      const partes = oracion.split(/(?<=[,;:])\s+/);
      const i = partes.findIndex((p) => dice(p, esTotal));
      const antes = partes.slice(0, i).join(" ").replace(/[\s,;:]+$/, "");
      const quedaUnPrecio = dice(antes, (m) => respaldados.has(m));
      return i > 0 && quedaUnPrecio && !CONFIRMA.test(normalizar(antes)) ? [`${antes}.`] : [];
    }).join(" ").trim();
  // Los saltos de línea separan burbujas: se respetan.
  const resultado = texto.split(/(\n+)/).map((b) => (/^\n+$/.test(b) ? b : linea(b))).join("")
    .replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  return letras(resultado) < 15 ? "" : resultado;
}

export const precioSinHerramienta: Barandilla = {
  nombre: "precio_sin_herramienta",
  etapa: "contenido",
  accion: "rehacer",
  evaluar({ texto, traza, nombreCliente, saltosPrevios }) {
    const encontrados = montos(texto, nombreCliente);
    if (encontrados.length === 0) return NO_SALTA;
    const devueltos = new Set(traza.preciosDevueltos.map((p) => Math.round(p)));
    const fuera = encontrados.filter((m) => !devueltos.has(m));
    if (fuera.length === 0) return NO_SALTA;
    // 8/10: si lo único sin respaldo es un TOTAL armado con precios que sí salieron de las
    // herramientas («serían $238.500 en total»), la primera vez se rehace —el modelo lo reescribe
    // natural, con cada precio por separado— y si vuelve a sumar, el total se saca en código y sale
    // el resto. Antes el segundo intento derivaba (barandilla_doble) por una pregunta que tiene
    // respuesta. Si al sacarlo no queda nada, el texto vacío lo trata index.ts como cualquier corte.
    const sumas = sumasDe([...devueltos]);
    if (fuera.every((m) => sumas.has(m))) {
      const lista = fuera.map((m) => `$${m.toLocaleString("es-AR")}`).join(", ");
      const motivo = `sumó precios (${lista}): los totales no se dicen, ni se confirma la cuenta que hizo el cliente. ` +
        "Decí cada precio por separado, tal como te lo dieron las herramientas";
      if (!saltosPrevios) return { salta: true, accion: "rehacer", motivo };
      return { salta: true, accion: "cortar", motivo: `${motivo} (se sacó el total en código)`, texto: sinElTotal(texto, fuera, devueltos, nombreCliente) };
    }
    const lista = fuera.map((m) => `$${m.toLocaleString("es-AR")}`).join(", ");
    // "Decí cada precio por separado" (6/10: "¿y sumándole camisa, corbata y
    // zapatos?"): sin esa salida, el segundo intento volvía a sumar o escondía los precios de los
    // accesorios, y la charla terminaba derivada por una pregunta que tiene respuesta.
    const motivo = devueltos.size === 0
      ? `un precio (${lista}) sin consultar_catalogo en este turno`
      : `un monto (${lista}) que no devolvió ninguna herramienta: no sumes precios ni inventes totales; si te ` +
        "pidieron el total, decí cada precio por separado, tal como te lo dieron las herramientas";
    return { salta: true, accion: "rehacer", motivo };
  },
};
