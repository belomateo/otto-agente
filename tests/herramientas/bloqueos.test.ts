// Horarios bloqueados (bloqueos_agenda, 0067; pedido de la dueña, 26/9) en el camino de Lucía,
// contra la base real y adentro de una transacción con rollback. El caso que importa es la
// carrera: Lucía ya le ofreció un horario al cliente y, mientras él contesta, la dueña (o el
// equipo) bloquea ese rato desde el panel. La agenda ya no lo sabía cuando lo ofreció, así que el
// hueco está en la traza; lo que lo frena es la guardia de la base (turno_en_horario_bloqueado,
// un 23P01 como el choque entre turnos), y Lucía tiene que tomarlo como "se ocupó", no romperse.
//
// La migración la aplica Mateo a mano: hasta que la tabla exista, estas pruebas se saltean.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { agendaDesdeBase } from "../../supabase/functions/_shared/agenda/huecos.ts";
import { agendar, buscar, conBase, contar, esOk, esRechazo, fichaCompleta, JUEVES, prueba, TZ } from "./_arnes.ts";

const HAY_BLOQUEOS: boolean = await conBase(async (sql) =>
  (await sql.query("select to_regclass('public.bloqueos_agenda') is not null as existe")).rows[0].existe === true
);

prueba("agendar_turno: si bloquean el horario después de ofrecerlo, sale hueco_ocupado, no queda el turno y ya no se ofrece", async ({ sql, ctx, clienteId }) => {
  // La agenda de verdad (no el doble) y sin reserva de urgencia: así el jueves se ve entero.
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  await fichaCompleta(sql, clienteId);
  ctx.agenda = agendaDesdeBase(ctx.db, TZ);

  const r = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(r);
  assertEquals((r.datos.huecos as { hora: string }[])[0].hora, "10:00");

  await sql.query(
    "insert into bloqueos_agenda (fecha, desde, hasta, probador, motivo) values ($1::date, '10:00', '11:00', null, 'PRUEBA proveedor')",
    [JUEVES],
  );

  // El rechazo de la base deja abortada la transacción de la prueba (en producción cada escritura
  // de Lucía es su propia transacción y no pasa). El savepoint es para poder seguir mirando
  // después. Por lo mismo, el hueco tiene UN probador, como los que da la agenda: con dos, el
  // segundo intento chocaría con la transacción abortada (25P02) y no con el bloqueo.
  await sql.query("savepoint antes_de_agendar");
  const a = await agendar(ctx, JUEVES, "10:00", "invitado");
  esRechazo(a, "hueco_ocupado");
  await sql.query("rollback to savepoint antes_de_agendar");
  assertEquals(await contar(sql, "select count(*)::int as n from turnos where cliente_id = $1", [clienteId]), 0);

  // Lucía vuelve a buscar, como le indica el rechazo: el bloqueo ya no se ofrece (ni lo que lo
  // pisa) y el primero libre se agenda.
  const r2 = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(r2);
  const horas = (r2.datos.huecos as { hora: string }[]).map((h) => h.hora);
  assert(!horas.includes("10:00"), horas.join(" "));
  assertEquals(horas[0], "11:00");
  const b = await agendar(ctx, JUEVES, "11:00", "invitado");
  esOk(b);
  assertEquals(await contar(sql, "select count(*)::int as n from turnos where cliente_id = $1", [clienteId]), 1);
}, { ignorar: !HAY_BLOQUEOS });
