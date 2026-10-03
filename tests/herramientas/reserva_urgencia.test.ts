// Caso Larisa (3/10): "turno para el lunes", sin fecha de evento. El lunes caía en la reserva de
// urgencia, buscar_horarios vino vacío y Lucía derivó — el equipo le dio las 18 h del lunes. Lo
// que faltaba era un dato del cliente, no una persona: ahora la herramienta pide preguntar la
// fecha del evento y derivar_a_persona no deja derivar por falta de lugar sin haberla preguntado.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { buscar, contar, esOk, esRechazo, FECHA_EVENTO, fila, MARTES, prueba } from "./_arnes.ts";

// AHORA es el lunes 2030-06-03: con 3 días, del lunes al miércoles quedan para eventos que caen
// hasta el jueves 6, y a un evento más lejano (o sin fecha) se le ofrece desde el jueves 6.
const reserva = (sql: { query: (q: string, v: unknown[]) => Promise<unknown> }) =>
  sql.query("update configuracion_agenda set dias_reserva_urgencia = $1", [3]);

prueba("reserva de urgencia sin fecha de evento: el vacío pide la fecha y no deja derivar por falta de lugar", async ({ sql, ctx, conversacionId }) => {
  await reserva(sql);
  const r = await buscar(ctx, MARTES, MARTES, "invitado");
  esOk(r);
  assertEquals(r.datos.huecos, []);
  assertMatch(String(r.datos.nota), /para cuándo es el evento/);
  assertMatch(String(r.datos.nota), /2030-06-06/);
  assert(!String(r.datos.nota).includes("Derivá con dato_no_encontrado"));

  const d = await ejecutarHerramienta("derivar_a_persona", { motivo: "dato_no_encontrado", mensaje_al_cliente: "Te paso con el equipo." }, ctx);
  esRechazo(d, "falta_fecha_evento");
  assertEquals(await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]), 0);

  // El freno es solo para "no encontré lugar": un reclamo deriva igual, y derivar apaga a Lucía.
  esOk(await ejecutarHerramienta("derivar_a_persona", { motivo: "reclamo", mensaje_al_cliente: "Te paso con el equipo." }, ctx));
  const conv = await fila(sql, "select estado, lucia_activa from conversaciones where id = $1", [conversacionId]);
  assertEquals([conv.estado, conv.lucia_activa], ["derivada", false]);
});

prueba("reserva de urgencia con el evento lejos: el vacío manda a buscar desde el primer día libre", async ({ sql, ctx }) => {
  await reserva(sql);
  const r = await buscar(ctx, MARTES, MARTES, "invitado", FECHA_EVENTO);
  esOk(r);
  assertMatch(String(r.datos.nota), /buscá desde el 2030-06-06/);
  assertEquals(ctx.traza.reservaSinFechaEvento, false);
});

prueba("evento dentro de la reserva: el vacío es de verdad y queda la nota de siempre", async ({ sql, ctx }) => {
  await reserva(sql);
  const r = await buscar(ctx, MARTES, MARTES, "invitado", "2030-06-05");
  esOk(r);
  assertMatch(String(r.datos.nota), /Derivá con dato_no_encontrado/);
});
