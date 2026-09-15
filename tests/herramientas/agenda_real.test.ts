// El turno de Lucía y el emulador (H1.7) le pasan a las herramientas la agenda real de logica
// (H1.13), no el doble: los dos arman el contexto con contextoDeHerramientas. Esta prueba lo
// controla contra la base, en una transacción con rollback: lo que ofrece buscar_horarios es lo
// que calcula agendaDesdeBase, se agenda de punta a punta y ese lugar deja de ofrecerse.
// Todas las demás pruebas de herramientas siguen con AgendaDoble.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1.0.13";
import { agendaDesdeBase } from "../../supabase/functions/_shared/agenda/huecos.ts";
import { calendarioDeEnsayo } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { contextoDeHerramientas } from "../../supabase/functions/_shared/turno/contexto_herramientas.ts";
import { AgendaDoble, agendar, AHORA, buscar, esOk, FECHA_EVENTO, fila, JUEVES, prueba, TZ } from "./_arnes.ts";

prueba("en un turno de verdad, buscar_horarios y agendar_turno usan la agenda de la base", async ({ sql, ctx: deLaPrueba, clienteId, conversacionId }) => {
  // Sin reserva de urgencia, así el día pedido es el que se ve (la reserva la prueba logica).
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  await sql.query("update clientes set nombre = 'Juan', fecha_evento = $2 where id = $1", [clienteId, FECHA_EVENTO]);
  const armar = () =>
    contextoDeHerramientas({
      db: deLaPrueba.db,
      tz: TZ,
      cliente: deLaPrueba.cliente,
      conversacionId,
      ahora: AHORA,
      calendario: calendarioDeEnsayo,
    });
  const ctx = armar();
  assert(!(ctx.agenda instanceof AgendaDoble), "el turno no puede correr con el doble");

  const calculado = await agendaDesdeBase(deLaPrueba.db, TZ).huecos({
    desde: JUEVES,
    hasta: JUEVES,
    tipo: "invitado",
    ahora: AHORA,
    fechaEvento: FECHA_EVENTO,
  });
  assert(calculado.huecos.length > 0, "la agenda de la base no dio huecos para el jueves");

  const r = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(r);
  const primero = (r.datos.huecos as { fecha_hora: string; hora: string }[])[0];
  assertEquals(new Date(primero.fecha_hora).getTime(), new Date(calculado.huecos[0].inicio).getTime());

  const a = await agendar(ctx, JUEVES, primero.hora, "invitado");
  esOk(a);
  const t = await fila(sql, "select probador, inicio from turnos where id = $1", [a.datos.turno_id]);
  assertEquals(new Date(t.inicio).getTime(), new Date(calculado.huecos[0].inicio).getTime());
  assertEquals(t.probador, calculado.huecos[0].probador);

  // Otro cliente que busca después ya no ve ese lugar.
  const despues = await buscar(armar(), JUEVES, JUEVES, "invitado");
  esOk(despues);
  assertNotEquals((despues.datos.huecos as { hora: string }[])[0]?.hora, primero.hora);
});
