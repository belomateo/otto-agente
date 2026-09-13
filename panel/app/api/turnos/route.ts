// Turnos: GET /api/turnos?fecha=YYYY-MM-DD[&cancelados=1] (H1.8). Sin fecha, hoy en la zona
// del negocio.
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { esFecha, fechaEnZona } from '@/lib/formato';
import { turnosDelDia } from '@/lib/queries/turnos';

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const fecha = p.get('fecha') ?? fechaEnZona();
  if (!esFecha(fecha)) return error(400, 'fecha tiene que ser AAAA-MM-DD');
  return turnosDelDia(s.supabase, fecha, { incluirCancelados: p.get('cancelados') === '1' });
});
