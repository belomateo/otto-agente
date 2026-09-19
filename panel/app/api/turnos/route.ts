// Turnos: GET /api/turnos?fecha=YYYY-MM-DD[&cancelados=1] (H1.8). Sin fecha, hoy en la zona
// del negocio. POST: alta manual (decisión de Mateo, 16/9 — turno por teléfono), lib/edicion/
// turno-alta.ts.
import { rutaConsulta } from '@/lib/api/consulta';
import { requerirSesion } from '@/lib/api/sesion';
import { error } from '@/lib/api/respuestas';
import { esFecha, fechaEnZona } from '@/lib/formato';
import { altaTurno } from '@/lib/edicion/turno-alta';
import { turnosDelDia } from '@/lib/queries/turnos';

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const fecha = p.get('fecha') ?? fechaEnZona();
  if (!esFecha(fecha)) return error(400, 'fecha tiene que ser AAAA-MM-DD');
  return turnosDelDia(s.supabase, fecha, { incluirCancelados: p.get('cancelados') === '1' });
});

export async function POST(request: Request) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  return altaTurno(s, request);
}
