// Buscar a quién darle un turno: GET /api/turnos/clientes?q=<nombre o teléfono> → { clientes:
// [{ id, n, tel }] }, hasta 8. Abierto al equipo (pedido de Mateo, 5/10: dar turnos no depende
// de un admin). No es la pestaña Clientes (/api/clientes, solo de la dueña, 16/9): sin algo
// escrito no trae a nadie, y de cada uno solo el nombre y el teléfono.
import { rutaConsulta } from '@/lib/api/consulta';
import { buscarParaTurno } from '@/lib/queries/clientes';

export const GET = rutaConsulta(async (s, request) => buscarParaTurno(s.supabase, request.nextUrl.searchParams.get('q') ?? ''));
