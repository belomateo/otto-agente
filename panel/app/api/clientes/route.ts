// Clientes: GET /api/clientes?q=<texto>&evento=<evento> (H1.8).
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { listarClientes } from '@/lib/queries/clientes';

const EVENTOS = ['casamiento', 'graduacion', 'fiesta', 'laboral', 'otro'];

export const GET = rutaConsulta(async (s, request) => {
  const p = request.nextUrl.searchParams;
  const evento = p.get('evento') ?? undefined;
  if (evento && !EVENTOS.includes(evento)) return error(400, 'evento inválido');
  return listarClientes(s.supabase, { busqueda: p.get('q') ?? undefined, evento });
});
