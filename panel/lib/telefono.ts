// 29/10: el equipo cargaba «3454093217» y WhatsApp llega como «5493454093217»: quedaban dos fichas
// (Juan Cruz) y Lucía no veía el turno. Un celular argentino escrito como se dice se completa.
export function telefonoWhatsapp(v: string): string {
  let d = v.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // 0341…
  if (d.length === 10) return `549${d}`; // 341…
  if (d.length === 12 && d.startsWith('54')) return `549${d.slice(2)}`; // 54 341… sin el 9
  return d;
}
