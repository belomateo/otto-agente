// Bitácora: GET /api/bitacora?fecha=YYYY-MM-DD (H1.8). Sin fecha, hoy. Solo admin (decisión de
// Mateo, 16/9): el equipo no ve métricas ni costo de OpenAI.
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { esFecha, fechaEnZona } from '@/lib/formato';
import { obtenerBitacora } from '@/lib/queries/bitacora';

export const GET = rutaConsulta(
  async (s, request) => {
    const fecha = request.nextUrl.searchParams.get('fecha') ?? fechaEnZona();
    if (!esFecha(fecha)) return error(400, 'fecha tiene que ser AAAA-MM-DD');
    return obtenerBitacora(s.supabase, fecha);
  },
  { admin: true }
);
