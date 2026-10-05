// Turnos › Mover (pedido de Mateo, 5/10: cualquiera del equipo da, edita y reagenda turnos):
// POST /api/turnos/<id>/mover con { version, inicio, probador?, tipo?, pisar_urgencia?,
// aceptar_evento_inminente? }. 200 { fila, avisar_al_cliente }; 409 si cambió mientras tanto, si
// el horario ya no está libre (con alternativas) o si el turno ya no se mueve. Ver moverTurno.
import { requerirSesion } from '@/lib/api/sesion';
import { moverTurno } from '@/lib/edicion/turno-alta';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  return moverTurno(s, id, request);
}
