// Armado de CSV para exportar desde el panel. Puro: sin base, sin red y sin 'server-only', para
// que se pueda probar solo (tests/paneles/csv.test.ts).
//
// Tres decisiones que no son obvias y que no hay que "arreglar":
//  · Separador ';' y no ','. En la configuración regional de Argentina, Excel usa la coma como
//    separador DECIMAL y el punto y coma como separador de LISTA. Un CSV con comas, abierto con
//    doble clic en un Excel argentino, mete cada fila entera en una sola columna. Google Sheets
//    detecta el ';' solo.
//  · BOM de UTF-8 al principio. Sin él, Excel abre el archivo como Windows-1252 y "Sofía" sale
//    "SofÃ­a". Google Sheets lo ignora, así que no molesta a nadie.
//  · Inyección de fórmulas. Lo que se exporta lo escribieron los clientes por WhatsApp: el
//    nombre, la ciudad, lo que dijeron del presupuesto. Una celda que empieza con = + - @ Excel
//    la ejecuta como fórmula, así que un "nombre" como =HYPERLINK("http://...") se vuelve un link
//    armado por un desconocido adentro de la planilla de la dueña. Se neutraliza anteponiendo una
//    comilla simple, que es lo que recomienda OWASP para CSV injection.

export const SEPARADOR = ';';
export const BOM = '﻿';

const EMPIEZA_COMO_FORMULA = /^[=+\-@\t\r]/;
const HAY_QUE_ENCOMILLAR = /[";,\n\r]/;

export function celdaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  let s = String(valor);
  if (EMPIEZA_COMO_FORMULA.test(s)) s = `'${s}`;
  if (HAY_QUE_ENCOMILLAR.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// CRLF entre filas: es lo que pide el RFC 4180 y lo que espera Excel.
export function armarCsv(encabezados: readonly string[], filas: readonly (readonly unknown[])[]): string {
  const lineas = [encabezados, ...filas].map((f) => f.map(celdaCsv).join(SEPARADOR));
  return BOM + lineas.join('\r\n') + '\r\n';
}

// "2027-06-20" → "20/06/2027". Es una fecha, no un instante: se reordena el texto y no se pasa
// por Date, que la correría un día según el huso horario de donde corra el servidor.
export function fechaArgentina(isoFecha: string | null | undefined): string {
  if (!isoFecha) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoFecha);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoFecha;
}

// Un instante, en la hora de Argentina: "25/09/2026 14:05".
export function momentoArgentina(iso: string | null | undefined, tz = 'America/Argentina/Cordoba'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('es-AR', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
