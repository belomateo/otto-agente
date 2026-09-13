// Historial de una fila editable: GET /api/historial?tabla=<tabla>&id=<uuid> (H1.9).
import type { NextRequest } from 'next/server';
import { requerirSesion } from '@/lib/api/sesion';
import { listarHistorial } from '@/lib/edicion/editar';

export async function GET(request: NextRequest) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const p = request.nextUrl.searchParams;
  return listarHistorial(s, p.get('tabla'), p.get('id'));
}
