// Configuración › Agenda › Cierres puntuales (0061, pedido de Mateo 21/9): feriados y cierres
// excepcionales, aparte del horario semanal. GET lista; POST agrega una fecha cerrada. Solo
// admin — cerrar el local es una decisión de negocio, no operativa (mismo criterio que el
// horario semanal, ya admin-only).
//
// Si la fecha ya tiene turnos activos, POST no escribe nada y devuelve 409 con cuántos hay: la
// decisión de qué hacer con esos turnos es de Mateo, no la toma el código solo. Para insistir
// igual (y dejarlos como están, sin tocarlos), se manda confirmar: true.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { leerCuerpo } from '@/lib/api/validar';
import { esFecha } from '@/lib/formato';
import { crearCierre, listarCierres } from '@/lib/queries/cierres';

const esquema = z.strictObject({
  fecha: z.string().refine(esFecha, 'Fecha inválida (esperado AAAA-MM-DD)'),
  motivo: z.string().trim().min(1).max(200).nullish(),
  confirmar: z.boolean().optional(),
});

export async function GET() {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  try {
    return json({ cierres: await listarCierres(s) });
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}

export async function POST(request: Request) {
  const s = await requerirSesion({ admin: true });
  if (s instanceof Response) return s;
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;

  try {
    const r = await crearCierre(s, cuerpo.fecha, cuerpo.motivo ?? null, cuerpo.confirmar === true);
    if (!r.ok) {
      return error(409, `Ese día ya tiene ${r.turnos_afectados} turno(s): confirmá si igual querés cerrarlo`, {
        turnos_afectados: r.turnos_afectados,
      });
    }
    return json({ cierre: r.cierre }, 201);
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
