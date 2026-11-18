// Atención humana: GET /api/atencion?estado=pendiente (H1.8) o ?estado=atendida&dia=YYYY-MM-DD&q=<texto>: Consultas OK
// es el historial de todas las conversaciones, un día por vez o por búsqueda (Sofía, 18/11).
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { esFecha, fechaEnZona } from '@/lib/formato';
import { ESTADOS_DERIVACION, listarDerivaciones, listarHistorial } from '@/lib/queries/atencion';

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const estado = p.get('estado') ?? 'pendiente';
  if (!(ESTADOS_DERIVACION as readonly string[]).includes(estado)) return error(400, 'estado inválido');
  if (estado === 'pendiente') return listarDerivaciones(s.supabase, 'pendiente');
  const dia = p.get('dia') ?? fechaEnZona();
  if (!esFecha(dia)) return error(400, 'día inválido');
  return listarHistorial(s.supabase, { dia, busqueda: p.get('q') ?? undefined });
});
