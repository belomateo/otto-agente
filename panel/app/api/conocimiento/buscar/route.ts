// Conocimiento › "Probá cómo lo encontraría un cliente": GET /api/conocimiento/buscar?q=...
// (H1.8). Búsqueda provisoria hasta que exista la de buscar_informacion (ver la consulta).
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { probarBusqueda } from '@/lib/queries/conocimiento';

export const GET = rutaConsulta(async (s, request) => {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) return error(400, 'Falta q (lo que escribiría el cliente)');
  if (q.length > 300) return error(400, 'La consulta es demasiado larga');
  return probarBusqueda(s.supabase, q);
});
