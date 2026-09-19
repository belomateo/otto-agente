// Vista Mensual (pedido de Mateo, 19/9). GET /api/turnos/mes?desde=YYYY-MM[&cancelados=1] — sin
// `desde`, el mes de hoy. Un conteo por día (turnosDelMes, lib/queries/turnos.ts), no los turnos
// completos: alcanza para pintar una grilla sin traer 30 días de fichas.
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { esMes, fechaEnZona } from '@/lib/formato';
import { turnosDelMes } from '@/lib/queries/turnos';

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const desde = p.get('desde') ?? fechaEnZona().slice(0, 7);
  if (!esMes(desde)) return error(400, 'desde tiene que ser AAAA-MM');
  return turnosDelMes(s.supabase, desde, { incluirCancelados: p.get('cancelados') === '1' });
});
