// Clientes: GET /api/clientes?q=<texto>&evento=<evento> (H1.8). Solo admin (decisión de Mateo,
// 16/9): la pestaña Clientes (buscador de toda la base de contactos) es solo de la dueña — el
// equipo no la ve en el panel.
//
// Esto es un límite de PANTALLA, no de datos: la tabla `clientes` sigue con RLS abierta a
// cualquier aprobado (0007/0033/0040/0045 lo dejan así a propósito, las tres, por nombre — es
// "trabajo diario" junto con turnos/conversaciones/notas/derivaciones). El equipo YA necesita
// leer y editar clientes fuera de esta ruta: la ficha dentro de la charla (GET /api/bandeja/{id})
// y el alta manual de acá abajo (POST, para un turno por teléfono) están abiertos a propósito.
// Si el día de mañana esto tuviera que ser también un límite de RLS (no solo de qué pestaña se
// ve), es un cambio de policy explícito — no algo que este comentario deba prometer solo.
//
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
