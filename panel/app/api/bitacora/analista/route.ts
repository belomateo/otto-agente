// Bitácora › Analista: GET /api/bitacora/analista?fecha=YYYY-MM-DD (0102, pedido de Mateo del 9/10 y
// 10/10). Lo que encontró el analista de charlas esa noche: errores de Lucía y mejoras sugeridas, con
// el resumen de la noche. Sin fecha, la última noche analizada. Solo admin, como el resto de la
// Bitácora (decisión de Mateo, 16/9): lleva el costo de OpenAI.
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { esFecha } from '@/lib/formato';
import { analisisDeLaNoche } from '@/lib/queries/analista';

export const GET = rutaConsulta(
  async (s, request) => {
    const fecha = request.nextUrl.searchParams.get('fecha');
    if (fecha !== null && !esFecha(fecha)) return error(400, 'fecha tiene que ser AAAA-MM-DD');
    return analisisDeLaNoche(s.supabase, fecha);
  },
  { admin: true }
);
