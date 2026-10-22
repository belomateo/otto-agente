// Respuestas rápidas con "/" en el composer de la Bandeja (pedido de Sofía, 22/10). Puro, sin
// React ni base, para poder probarlo (tests/paneles/respuestas-rapidas.test.ts).

export type RespuestaRapida = { id: string; atajo: string; texto: string; orden: number; activo: boolean };

/** El "/" que se está escribiendo: al principio o después de un espacio, hasta el cursor y sin
 *  espacios en el medio. Devuelve dónde empieza y lo que va después de la barra. */
export function atajoEnCurso(texto: string, cursor: number): { inicio: number; consulta: string } | null {
  const antes = texto.slice(0, cursor);
  const m = /(^|\s)\/(\S*)$/.exec(antes);
  if (!m) return null;
  return { inicio: antes.length - m[2].length - 1, consulta: m[2] };
}

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Las activas, por `orden`, que tengan la consulta en el atajo o en el texto (sin tildes). */
export function filtrarRespuestas(lista: RespuestaRapida[], consulta: string): RespuestaRapida[] {
  const q = plano(consulta);
  return lista
    .filter((r) => r.activo && (plano(r.atajo).includes(q) || plano(r.texto).includes(q)))
    .sort((a, b) => a.orden - b.orden);
}

/** Reemplaza el "/consulta" por el texto de la respuesta; devuelve el texto nuevo y el cursor. */
export function insertarRespuesta(texto: string, cursor: number, inicio: number, respuesta: string) {
  const nuevo = texto.slice(0, inicio) + respuesta + texto.slice(cursor);
  return { texto: nuevo, cursor: inicio + respuesta.length };
}
