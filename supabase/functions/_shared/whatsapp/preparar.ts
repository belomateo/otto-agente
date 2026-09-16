// Preparar lo que el sistema le manda al cliente por WhatsApp (hito 2.2, decisión #17, pedido de
// la dueña):
//  · sin «¡» ni «¿»: se sacan acá, en código, de todo lo que escribe el sistema (Lucía, textos
//    fijos, confirmaciones armadas en código). Lo que escribe una persona desde el panel
//    (mostrador) no pasa por acá: sale como lo escribió (supuesto #37).
//  · en 1, 2 o 3 mensajes según el largo de todo lo que sale en el turno (supuesto #36): hasta
//    HASTA_UN_MENSAJE caracteres, 1; hasta HASTA_DOS_MENSAJES, 2; más, 3, que es el máximo.
//    Corta en párrafos y, si no alcanza, en fin de oración o de línea; nunca en el medio de una
//    oración ni de un link. Si no hay dónde cortar, salen menos partes.
// La usan el turno de Lucía (antes de guardar lo que va a salir) y el worker. Es pura, y
// aplicarla a su propia salida no cambia nada.

export const HASTA_UN_MENSAJE = 300;
export const HASTA_DOS_MENSAJES = 700;
export const MAXIMO_DE_MENSAJES = 3;
// Una parte más corta que esto queda pegada a la vecina: un "Listo." suelto no es un mensaje.
export const PARTE_MINIMA = 40;

type Corte = { fin: number; inicio: number; parrafo: boolean };

const largo = (t: string) => [...t].length;
// Para decidir en cuántas partes va, los espacios cuentan como uno: así da lo mismo que dos
// oraciones estén separadas por un espacio o por una línea en blanco (y la salida de esta misma
// función, que las junta con una línea en blanco, cae en la misma cantidad de partes).
const largoParaPartir = (t: string) => largo(t.replace(/\s+/g, " "));

export function cuantosMensajes(caracteres: number): number {
  if (caracteres <= HASTA_UN_MENSAJE) return 1;
  if (caracteres <= HASTA_DOS_MENSAJES) return 2;
  return MAXIMO_DE_MENSAJES;
}

export function sinSignosDeApertura(texto: string): string {
  return texto
    .replace(/[¡¿]/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Dónde se puede cortar: al final de un párrafo (línea en blanco), de una oración (. ! ? …
// seguido de espacio o salto) o de una línea. Adentro de un link no hay espacios, así que nunca
// cae un corte ahí.
function cortesPosibles(t: string): Corte[] {
  const porFin = new Map<number, Corte>();
  const parrafos: Corte[] = [];
  for (const m of t.matchAll(/\n\n+/g)) {
    const c = { fin: m.index!, inicio: m.index! + m[0].length, parrafo: true };
    parrafos.push(c);
    porFin.set(c.fin, c);
  }
  const enUnParrafo = (i: number) => parrafos.some((p) => i >= p.fin && i <= p.inicio);
  for (const m of t.matchAll(/[.!?…]+["»)]*(?=[ \n])|\n/g)) {
    const fin = m[0] === "\n" ? m.index! : m.index! + m[0].length;
    if (porFin.has(fin) || enUnParrafo(fin)) continue;
    let inicio = fin;
    while (inicio < t.length && (t[inicio] === " " || t[inicio] === "\n")) inicio++;
    if (inicio < t.length) porFin.set(fin, { fin, inicio, parrafo: false });
  }
  return [...porFin.values()].sort((a, b) => a.fin - b.fin);
}

function partir(t: string, partes: number): string[] {
  if (partes <= 1) return [t];
  const cortes = cortesPosibles(t);
  const tramo = t.length / partes;
  const elegidos: Corte[] = [];
  let desde = 0;
  for (let k = 1; k < partes; k++) {
    const ideal = tramo * k;
    const faltan = partes - k;
    const validos = cortes.filter((c) =>
      c.fin > desde &&
      largo(t.slice(desde, c.fin).trim()) >= PARTE_MINIMA &&
      largo(t.slice(c.inicio).trim()) >= PARTE_MINIMA * faltan
    );
    if (!validos.length) break;
    const distancia = (c: Corte) => Math.abs(c.fin - ideal);
    // Un fin de párrafo razonablemente cerca le gana a un fin de oración justo en el medio.
    const parrafos = validos.filter((c) => c.parrafo && distancia(c) <= tramo / 2);
    const mejor = (parrafos.length ? parrafos : validos).reduce((a, b) => (distancia(b) < distancia(a) ? b : a));
    elegidos.push(mejor);
    desde = mejor.inicio;
  }
  const salida: string[] = [];
  let inicio = 0;
  for (const c of elegidos) {
    salida.push(t.slice(inicio, c.fin).trim());
    inicio = c.inicio;
  }
  salida.push(t.slice(inicio).trim());
  return salida.filter(Boolean);
}

// Todo lo que el sistema manda en un turno, en orden, preparado para WhatsApp.
export function prepararParaEnviar(textos: readonly (string | null | undefined)[]): string[] {
  const todo = sinSignosDeApertura(textos.map((t) => (t ?? "").trim()).filter(Boolean).join("\n\n"));
  if (!todo) return [];
  return partir(todo, cuantosMensajes(largoParaPartir(todo)));
}
