// Turnos › bloquear un horario (0067, pedido de la dueña 26/9): una fecha, de tal a tal hora (hora
// del local), para todos los probadores (probador: null) o para uno. Ni Lucía ni el panel dan
// turnos ahí. POST { fecha, desde, hasta, probador, motivo?, confirmar? }.
//
// Sin {admin}, a propósito: el equipo también bloquea — es trabajo del día a día, no una decisión
// de negocio como cerrar el día entero (/api/configuracion/cierres, solo la dueña). Hasta dónde
// puede el equipo lo decide la base, no esta ruta: si con su bloqueo el día se queda sin lugar para
// ningún turno, 403 con el texto de la base explicando que eso es de la dueña.
//
// Si el rato ya tiene turnos activos, no escribe nada y devuelve 409 con cuáles son: esos turnos
// NO se cancelan (decisión de la dueña), pero quien bloquea tiene que saber a quién avisarle. Para
// bloquear igual (y dejarlos como están) se manda confirmar: true. Mismo molde que los cierres.
import { z } from 'zod';
import { requerirSesion } from '@/lib/api/sesion';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { leerCuerpo } from '@/lib/api/validar';
import { esFecha } from '@/lib/formato';
import { crearBloqueo } from '@/lib/queries/bloqueos';

// '24:00' solo para hasta: "hasta que termine el día" (la columna time de la base lo acepta).
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORA_O_FIN_DEL_DIA = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

const esquema = z
  .strictObject({
    fecha: z.string().refine(esFecha, 'Fecha inválida (esperado AAAA-MM-DD)'),
    desde: z.string().regex(HORA, 'Hora en formato HH:MM'),
    hasta: z.string().regex(HORA_O_FIN_DEL_DIA, 'Hora en formato HH:MM (o 24:00)'),
    // Obligatorio aunque sea null: un cliente que se olvida el campo no puede terminar bloqueando
    // a TODOS los probadores sin querer.
    probador: z
      .number({ error: 'Mandá el número de probador, o null para todos' })
      .int('Tiene que ser un número entero')
      .min(1, 'Mínimo 1')
      .nullable(),
    // Vacío es lo mismo que sin motivo: el campo del formulario es opcional.
    motivo: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => v || null),
    confirmar: z.boolean().optional(),
  })
  // Con HH:MM de dos dígitos, comparar los textos es comparar las horas. Solo si las dos están bien
  // escritas: si no, el error ya es ése y esto sumaba un segundo que confunde.
  .refine((d) => !HORA.test(d.desde) || !HORA_O_FIN_DEL_DIA.test(d.hasta) || d.desde < d.hasta, {
    message: 'El bloqueo tiene que terminar después de empezar',
    path: ['hasta'],
  });

export async function POST(request: Request) {
  const s = await requerirSesion();
  if (s instanceof Response) return s;
  const cuerpo = await leerCuerpo(request, esquema);
  if (cuerpo instanceof Response) return cuerpo;

  try {
    const r = await crearBloqueo(s, {
      fecha: cuerpo.fecha,
      desde: cuerpo.desde,
      hasta: cuerpo.hasta,
      probador: cuerpo.probador,
      motivo: cuerpo.motivo,
      confirmar: cuerpo.confirmar === true,
    });
    if (!r.ok) {
      const n = r.turnos_afectados.length;
      return error(
        409,
        `Ese horario ya tiene ${n} turno(s) agendado(s): no se cancelan, confirmá si igual querés bloquearlo`,
        { turnos_afectados: r.turnos_afectados },
        'turnos_afectados'
      );
    }
    return json({ bloqueo: r.bloqueo }, 201);
  } catch (e) {
    return desdeErrorDeBase(e as { code?: string; message: string });
  }
}
