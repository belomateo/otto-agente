// Atención humana: GET /api/atencion?estado=pendiente|atendida (H1.8).
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { ESTADOS_DERIVACION, listarDerivaciones, type EstadoDerivacion } from '@/lib/queries/atencion';

export const GET = rutaConsulta(async (s, request) => {
  const estado = request.nextUrl.searchParams.get('estado') ?? 'pendiente';
  if (!(ESTADOS_DERIVACION as readonly string[]).includes(estado)) return error(400, 'estado inválido');
  return listarDerivaciones(s.supabase, estado as EstadoDerivacion);
});
