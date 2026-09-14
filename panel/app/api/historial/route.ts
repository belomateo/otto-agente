// Historial de una fila editable: GET /api/historial?tabla=<tabla>&id=<uuid> (H1.9).
// Filas borradas de una tabla que se borra desde el panel (franjas_turnos), para volver a
// crearlas: GET /api/historial?tabla=<tabla>&borradas=1.
import type { NextRequest } from 'next/server';
import { requerirSesion } from '@/lib/api/sesion';
import { listarBorradas, listarHistorial } from '@/lib/edicion/editar';

export async function GET(request: NextRequest) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const p = request.nextUrl.searchParams;
  if (p.get('borradas') === '1') return listarBorradas(s, p.get('tabla'));
  return listarHistorial(s, p.get('tabla'), p.get('id'));
}
