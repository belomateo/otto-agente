// Posibles feriados (0098, pedido de Mateo del 10/10) contra la base real, en rollback: la migración
// se aplica adentro de la transacción y se carga un feriado de prueba el jueves 6/6/2030.
//  · posible (sin decidir): la agenda no da huecos ese día y el contexto le dice a Lucía que no lo
//    ofrezca ni lo recomiende, sin decir que el local cierra;
//  · «Local abierto»: vuelve a ser un día normal; «Local cerrado» sin decidir el cierre: tampoco se ofrece;
//  · un turno que ya estaba ese día no se confirma con el resumen al guardar el mail: se ofrece moverlo
//    (caso real del ensayo del 10/10: «el lunes 12 estamos cerrados» y enseguida «lunes 12… ¡Te esperamos!»).

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { agendaDesdeBase } from "../../supabase/functions/_shared/agenda/huecos.ts";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { armarContextoDelTurno } from "../../supabase/functions/_shared/turno/contexto.ts";
import { AHORA, esOk, FECHA_EVENTO, iso, JUEVES, prueba, TZ } from "./_arnes.ts";

const MIGRACION = new URL("../../supabase/migrations/0098_feriados_sin_reserva_y_prendas.sql", import.meta.url);

prueba("un posible feriado no se ofrece; con «Local abierto» vuelve a ser un día normal (0098)", async ({ sql, ctx, clienteId }) => {
  await sql.query(await Deno.readTextFile(MIGRACION));
  // La migración deja la agenda sin días reservados para eventos cercanos (pedido de Mateo).
  assertEquals((await sql.query("select dias_reserva_urgencia from configuracion_agenda")).rows[0].dias_reserva_urgencia, null);
  await sql.query("insert into feriados_posibles (fecha, nombre) values ($1, 'PRUEBA feriado')", [JUEVES]);
  const huecosDelJueves = async () =>
    (await agendaDesdeBase(ctx.db, TZ).huecos({ desde: JUEVES, hasta: JUEVES, tipo: "invitado", ahora: AHORA, fechaEvento: FECHA_EVENTO })).huecos.length;

  assertEquals(await huecosDelJueves(), 0, "un posible feriado no tiene huecos para Lucía");
  const c = await armarContextoDelTurno(ctx.db, { clienteId, ahora: AHORA, tz: TZ, diasDesdeUltimoMensaje: null });
  assertMatch(c.texto, /- jueves 6\/6: posible feriado \(PRUEBA feriado\): no ofrezcas ni recomiendes este día/);

  await sql.query("update feriados_posibles set local_abierto = true where fecha = $1", [JUEVES]);
  assert(await huecosDelJueves() > 0, "con «Local abierto» el día se ofrece como cualquier otro");
  const abierto = await armarContextoDelTurno(ctx.db, { clienteId, ahora: AHORA, tz: TZ, diasDesdeUltimoMensaje: null });
  assertMatch(abierto.texto, /- jueves 6\/6: abre de /);

  await sql.query("update feriados_posibles set local_abierto = false where fecha = $1", [JUEVES]);
  assertEquals(await huecosDelJueves(), 0, "«Local cerrado» tampoco se ofrece, aunque falte el cierre");
});

prueba("guardar el mail de alguien con turno en un posible feriado no le confirma el turno: se ofrece moverlo", async ({ sql, ctx, clienteId }) => {
  await sql.query(await Deno.readTextFile(MIGRACION));
  await sql.query("insert into feriados_posibles (fecha, nombre) values ($1, 'PRUEBA feriado')", [JUEVES]);
  await sql.query(
    `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, editado_por)
     values ($1, 'invitado', 45, 1, $2, $3, 'sin-confirmar', 'prueba')`,
    [clienteId, iso(JUEVES, "11:30"), iso(JUEVES, "12:15")],
  );
  const r = await ejecutarHerramienta("guardar_datos_cliente", { email: "cliente@ejemplo.com" }, ctx);
  esOk(r);
  assertEquals(r.efectos?.mensajesAlCliente ?? [], [], "no sale el resumen «¡Te esperamos!»");
  assertMatch(String(r.datos.nota), /es feriado: no se lo confirmes\. Ofrecele pasarlo a otro día/);
  assert(!ctx.traza.resumenTurnoEmitido, "sin resumen, el control de confirmación doble no tiene nada que recortar");

  // El contexto también se lo marca al lado del turno.
  const c = await armarContextoDelTurno(ctx.db, { clienteId, ahora: AHORA, tz: TZ, diasDesdeUltimoMensaje: null });
  assertMatch(c.texto, /a las 11:30, sin-confirmar \(OJO: ese día es feriado, Feriado: PRUEBA feriado; no se lo confirmes/);

  // Con «Local abierto», el resumen vuelve a salir como siempre.
  await sql.query("update feriados_posibles set local_abierto = true where fecha = $1", [JUEVES]);
  const r2 = await ejecutarHerramienta("guardar_datos_cliente", { email: "cliente.otro@ejemplo.com" }, ctx);
  esOk(r2);
  assertEquals(r2.efectos?.mensajesAlCliente?.length, 1);
  assertMatch(String(r2.efectos?.mensajesAlCliente?.[0]), /Ya actualicé los datos de tu reserva/);
});
