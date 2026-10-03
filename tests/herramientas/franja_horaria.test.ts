// FAQ del 3/10: "después de las 16", "a partir de las dos", "última hora". buscar_horarios
// mostraba solo los dos primeros huecos de la mañana y los dos primeros de la tarde (13:00, 13:15),
// así que esas franjas nunca aparecían y Lucía derivaba. Con desde_hora/hasta_hora se miran solo
// los que sirven.

import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { esOk, esRechazo, hueco, JUEVES, prueba } from "./_arnes.ts";

const pedir = (ctx: Parameters<typeof ejecutarHerramienta>[2], extra: Record<string, unknown>) =>
  ejecutarHerramienta("buscar_horarios", {
    desde: JUEVES, hasta: JUEVES, tipo_turno: "invitado", fecha_evento: null, fecha_hora: null,
    desde_hora: null, hasta_hora: null, ...extra,
  }, ctx);

const tarde = ["13:00", "13:15", "16:00", "16:15", "18:00"];
const horas = (r: { datos: Record<string, unknown> }) => (r.datos.huecos as { hora: string }[]).map((h) => h.hora);

prueba("sin franja: la tarde arranca por las primeras (13:00 y 13:15)", async ({ sql, ctx, agenda }) => {
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  agenda.lista = tarde.map((h) => hueco(JUEVES, h, 45));
  const r = await pedir(ctx, {});
  esOk(r);
  assertEquals(horas(r), ["13:00", "13:15"]);
});

prueba("después de las 16: muestra 16:00 y 16:15, no las de la una", async ({ sql, ctx, agenda }) => {
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  agenda.lista = tarde.map((h) => hueco(JUEVES, h, 45));
  const r = await pedir(ctx, { desde_hora: "16:00" });
  esOk(r);
  assertEquals(horas(r), ["16:00", "16:15"]);
});

prueba("antes de las 16: no muestra las de las 16", async ({ sql, ctx, agenda }) => {
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  agenda.lista = tarde.map((h) => hueco(JUEVES, h, 45));
  const r = await pedir(ctx, { hasta_hora: "16:00" });
  esOk(r);
  assertEquals(horas(r), ["13:00", "13:15"]);
});

prueba("franja sin lugar: no manda a derivar, manda a buscar sin franja y ofrecer lo más cercano", async ({ sql, ctx, agenda }) => {
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  agenda.lista = ["13:00", "13:15"].map((h) => hueco(JUEVES, h, 45));
  const r = await pedir(ctx, { desde_hora: "17:30" });
  esOk(r);
  assertEquals(horas(r), []);
  assertMatch(String(r.datos.nota), /sin desde_hora ni hasta_hora/);
});

prueba("una hora mal escrita se rechaza", async ({ ctx }) => {
  esRechazo(await pedir(ctx, { desde_hora: "4pm" }), "hora_invalida");
});
