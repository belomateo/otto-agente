// Clientes: GET /api/clientes?q=<texto>&evento=<evento> (H1.8). Solo admin (decisión de Mateo,
// 16/9): el equipo ve la ficha del cliente con el que está hablando (dentro de la charla,
// GET /api/bandeja/{id}), no la base de contactos completa.
// POST: alta manual de un cliente (turno por teléfono, decisión de Mateo 16/9) — abierto al
// equipo, como la edición de la ficha; el teléfono se pide una sola vez acá (rutaAlta.ts).
import { rutaConsulta } from '@/lib/api/consulta';
import { rutaAlta } from '@/lib/edicion/rutas';
import { error } from '@/lib/api/respuestas';
import { listarClientes } from '@/lib/queries/clientes';

const EVENTOS = ['casamiento', 'graduacion', 'fiesta', 'laboral', 'otro'];

export const GET = rutaConsulta(
  async (s, request) => {
    const p = request.nextUrl.searchParams;
    const evento = p.get('evento') ?? undefined;
    if (evento && !EVENTOS.includes(evento)) return error(400, 'evento inválido');
    return listarClientes(s.supabase, { busqueda: p.get('q') ?? undefined, evento });
  },
  { admin: true }
);
export const POST = rutaAlta('clientes');
