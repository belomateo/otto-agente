// Reabrir una fecha (borrar el cierre puntual, 0061). Solo admin. No toca ningún turno: cerrar
// una fecha nunca los tocó, así que reabrirla tampoco tiene nada que hacer con ellos.
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esFecha } from '@/lib/formato';
import { borrarCierre } from '@/lib/queries/cierres';

export async function DELETE(request: Request, ctx: { params: Promise<{ fecha: string }> }) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const { fecha } = await ctx.params;
  if (!esFecha(fecha)) return error(400, 'Fecha inválida (esperado AAAA-MM-DD)');

  try {
    const cierre = await borrarCierre(s, fecha);
    if (!cierre) return error(404, 'Esa fecha no está cerrada');
    return json({ cierre });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
