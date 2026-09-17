// Alta manual de un turno (decisión de Mateo, 16/9): el cliente que saca turno por teléfono.
// No pasa por el sistema genérico de lib/edicion/entidades.ts porque el alta tiene reglas
// propias, no "cualquier campo de la tabla": la duración sale de duraciones_turno según el
// tipo (no la manda quien carga el turno) y el fin se calcula, no se pide. El estado siempre
// arranca en 'sin-confirmar' (el default de la base, 0011): no se acepta desde el request, así
// que un turno cargado a mano pasa por la misma confirmación que uno de Lucía. Abierto al
// equipo, como el resto de Turnos.
import 'server-only';
import { z } from 'zod';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid, validar } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';

const TIPOS_TURNO = ['graduado', 'novio', 'invitado', 'doble', 'triple', 'prueba_final'] as const;

export const ESQUEMA_ALTA_TURNO = z.strictObject({
  cliente_id: z.string().refine(esUuid, 'Identificador de cliente inválido'),
  tipo: z.enum(TIPOS_TURNO),
  probador: z.number().int('Tiene que ser un número entero').min(1, 'Mínimo 1'),
  /** ISO, con zona (p. ej. 2026-09-20T13:00:00-03:00 o …Z). */
  inicio: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora inválidas'),
});

export async function altaTurno(sesion: Sesion, request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return error(400, 'El cuerpo no es JSON válido');
  }
  const datos = validar(cuerpo, ESQUEMA_ALTA_TURNO);
  if (datos instanceof Response) return datos;

  const { data: duracion, error: e1 } = await sesion.supabase
    .from('duraciones_turno')
    .select('duracion_min')
    .eq('tipo', datos.tipo)
    .maybeSingle();
  if (e1) return desdeErrorDeBase(e1);
  if (!duracion) return error(400, `No hay una duración cargada para "${datos.tipo}" en Configuración › Agenda`);

  const inicio = new Date(datos.inicio);
  const fin = new Date(inicio.getTime() + duracion.duracion_min * 60_000);

  const { data, error: e2 } = await sesion.supabase
    .from('turnos')
    .insert({
      cliente_id: datos.cliente_id,
      tipo: datos.tipo,
      duracion_min: duracion.duracion_min,
      probador: datos.probador,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
    })
    .select()
    .single();
  if (e2) return desdeErrorDeBase(e2);
  return json({ fila: data }, 201);
}
