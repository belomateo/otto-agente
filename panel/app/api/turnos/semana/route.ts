// Vista Semana de Turnos (pedido de Mateo, 17/9). GET /api/turnos/semana?desde=YYYY-MM-DD
// [&cancelados=1] — sin `desde`, la semana de hoy. El servidor normaliza `desde` al lunes de esa
// semana (turnosDeLaSemana, lib/queries/turnos.ts): quien llama no tiene que calcularlo.
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { esFecha, fechaEnZona } from '@/lib/formato';
import { turnosDeLaSemana } from '@/lib/queries/turnos';

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const desde = p.get('desde') ?? fechaEnZona();
  if (!esFecha(desde)) return error(400, 'desde tiene que ser AAAA-MM-DD');
  return turnosDeLaSemana(s.supabase, desde, { incluirCancelados: p.get('cancelados') === '1' });
});
