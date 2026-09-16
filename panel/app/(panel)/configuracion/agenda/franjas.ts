// Cuentas sobre las franjas de turnos que usan Configuración › Agenda y Turnos.
// Las reglas que se validan acá son las de `franjas_turnos` (decisión #7, 14/9):
// desde < hasta, las franjas de un día no se pisan y cada una tiene de 1 al total
// de probadores del local. Qué hueco se ofrece es de logica (H1.13), no de acá.

export type Franja = { desde: string; hasta: string; probadores: number };

/** '13:30' → 810. Devuelve null si la hora está mal escrita. */
export function aMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** 810 → '13:30'. */
export function aHora(minutos: number): string {
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
}

/** '13:00' → '13', '9:30' → '9:30', como se dice en la ficha. */
export function horaCorta(hora: string): string {
  return hora.endsWith(':00') ? hora.slice(0, -3) : hora;
}

const PROBADORES = (n: number) => `${n} ${n === 1 ? 'probador' : 'probadores'}`;

/** «de 9:30 a 12 con 3 probadores y de 13:30 a 18:30 con 2». Vacío si no hay franjas. */
export function describirFranjas(franjas: Franja[]): string {
  const partes = franjas.map(
    (f, i) => `de ${horaCorta(f.desde)} a ${horaCorta(f.hasta)} con ${i === 0 ? PROBADORES(f.probadores) : f.probadores}`,
  );
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** Lo que impide guardar las franjas de un día, en palabras del dueño. */
export function erroresFranjas(franjas: Franja[], probadoresLocal: number): string[] {
  const errores: string[] = [];
  const validas: { desde: number; hasta: number; nombre: string }[] = [];
  for (const f of franjas) {
    const nombre = `${f.desde.trim() || '—'} a ${f.hasta.trim() || '—'}`;
    const desde = aMinutos(f.desde);
    const hasta = aMinutos(f.hasta);
    if (desde === null || hasta === null) {
      errores.push(`La franja de ${nombre} tiene una hora mal escrita: van como 13:00.`);
    } else if (desde >= hasta) {
      errores.push(`La franja de ${nombre} termina antes de empezar.`);
    } else {
      validas.push({ desde, hasta, nombre });
    }
    if (f.probadores < 1) errores.push(`La franja de ${nombre} necesita al menos 1 probador.`);
    else if (f.probadores > probadoresLocal)
      errores.push(`La franja de ${nombre} tiene ${PROBADORES(f.probadores)} y el local tiene ${probadoresLocal}.`);
  }
  validas.sort((a, b) => a.desde - b.desde);
  for (let i = 1; i < validas.length; i++) {
    if (validas[i].desde < validas[i - 1].hasta)
      errores.push(`Las franjas de ${validas[i - 1].nombre} y de ${validas[i].nombre} se pisan.`);
  }
  return errores;
}
