// Bandeja: GET /api/bandeja?filtro=todas|lucia|persona|sin-respuesta&q=<texto> (H1.8).
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { FILTROS_BANDEJA, listarConversaciones, type FiltroBandeja } from '@/lib/queries/bandeja';

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const filtro = p.get('filtro') ?? 'todas';
  if (!(FILTROS_BANDEJA as readonly string[]).includes(filtro)) return error(400, 'filtro inválido');
  return {
    conversaciones: await listarConversaciones(s.supabase, {
      filtro: filtro as FiltroBandeja,
      busqueda: p.get('q') ?? undefined,
    }),
  };
});
