// Decisión #8 de Mateo (14/9): con el evento hoy o mañana, lo resuelve una persona. Es una
// derivación dura: la decide el código, no el modelo, con motivo evento_inminente y el texto
// fijo de contexto_agente, que nunca dice que no. Se prueba en las tres puertas por donde
// podría colarse un turno (buscar_horarios, agendar_turno, reprogramar_turno) y el caso
// parecido (pasado mañana) que tiene que seguir el camino normal.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { aplicarBarandillas } from "../../supabase/functions/_shared/barandillas/index.ts";
import { trazaNueva } from "../../supabase/functions/_shared/traza.ts";
import { esEventoInminente } from "../../supabase/functions/_shared/herramientas/derivacion.ts";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import type { Resultado } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import {
  AHORA,
  agendar,
  buscar,
  conBase,
  contar,
  crearTurno,
  esOk,
  fila,
  hueco,
  iso,
  JUEVES,
  local,
  LUNES,
  MARTES,
  MIERCOLES,
  prueba,
  TEXTO_EVENTO_INMINENTE,
  TZ,
} from "./_arnes.ts";

// @deno-types="npm:@types/pg@8.11.10"
import type pg from "npm:pg@8.13.1";

Deno.test("hoy o mañana se cuenta con la fecha de Argentina, no con la de UTC (supuesto #23)", () => {
  const casiMedianoche = new Date("2030-06-03T23:30:00-03:00"); // en UTC ya es martes
  assertEquals(esEventoInminente("2030-06-03", casiMedianoche, TZ), true); // hoy
  assertEquals(esEventoInminente("2030-06-04", casiMedianoche, TZ), true); // mañana
  assertEquals(esEventoInminente("2030-06-05", casiMedianoche, TZ), false); // pasado mañana (en UTC sería mañana)
  assertEquals(esEventoInminente("2030-06-02", casiMedianoche, TZ), false); // ya pasó: eso es otro rechazo
  assertEquals(esEventoInminente(null, casiMedianoche, TZ), false);
});

async function quedoDerivado(sql: pg.Client, conversacionId: string, r: Resultado) {
  esOk(r);
  assertEquals(r.datos.derivar, "evento_inminente");
  assertEquals(r.efectos?.cortaTurno, true);
  assertEquals(r.efectos?.mensajesAlCliente, [TEXTO_EVENTO_INMINENTE]);
  const d = await fila(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([d?.motivo, d?.estado], ["evento_inminente", "pendiente"]);
  assertEquals((await fila(sql, "select estado from conversaciones where id = $1", [conversacionId])).estado, "derivada");
}

prueba("buscar_horarios con el evento mañana (en la ficha) deriva en código y no ofrece turnos", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await sql.query("update clientes set fecha_evento = $2 where id = $1", [clienteId, MARTES]);
  agenda.lista = [hueco(MARTES, "16:00", 45)];
  const r = await buscar(ctx, LUNES, MARTES, "invitado");
  await quedoDerivado(sql, conversacionId, r);
  assertEquals(agenda.pedidos.length, 0, "ni siquiera le pide huecos a la agenda");
  assertEquals(ctx.traza.huecosOfrecidos, []);
  esOk(r);
  assert(!("huecos" in r.datos));
});

prueba("buscar_horarios con el evento hoy (lo manda el modelo) deriva y deja la fecha en la ficha", async ({ ctx, sql, clienteId, conversacionId }) => {
  const r = await buscar(ctx, LUNES, MARTES, "novio", LUNES);
  await quedoDerivado(sql, conversacionId, r);
  assertEquals((await fila(sql, "select fecha_evento::text as f from clientes where id = $1", [clienteId])).f, LUNES);
});

prueba("buscar_horarios con el evento pasado mañana sigue el camino normal (caso parecido)", async ({ ctx, sql, conversacionId, agenda }) => {
  agenda.lista = [hueco(MARTES, "16:00", 45)];
  const r = await buscar(ctx, LUNES, MARTES, "invitado", MIERCOLES);
  esOk(r);
  assertEquals((r.datos.huecos as unknown[]).length, 1);
  assertEquals(agenda.pedidos[0].fechaEvento, MIERCOLES, "la agenda recibe la fecha para el orden de urgencia");
  assertEquals(await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]), 0);
});

prueba("si la agenda devuelve derivar: evento_inminente, buscar_horarios lo respeta", async ({ ctx, sql, conversacionId, agenda }) => {
  agenda.derivar = "evento_inminente";
  agenda.lista = [hueco(JUEVES, "16:00", 45)];
  const r = await buscar(ctx, JUEVES, JUEVES, "invitado", "2030-06-20");
  await quedoDerivado(sql, conversacionId, r);
  assertEquals(ctx.traza.huecosOfrecidos, []);
});

prueba("agendar_turno con el evento mañana deriva en vez de agendar, aunque el hueco esté en la traza", async ({ ctx, sql, clienteId, conversacionId }) => {
  await sql.query("update clientes set nombre = 'Juan' where id = $1", [clienteId]);
  ctx.traza.huecosOfrecidos.push({ ...hueco(MARTES, "10:00", 45), tipo: "invitado" });
  const r = await agendar(ctx, MARTES, "10:00", "invitado", { fecha_evento: MARTES });
  await quedoDerivado(sql, conversacionId, r);
  assertEquals(await contar(sql, "select count(*)::int as n from turnos where cliente_id = $1", [clienteId]), 0);
  assertEquals((await fila(sql, "select fecha_evento::text as f from clientes where id = $1", [clienteId])).f, MARTES);
});

prueba("reprogramar_turno con el evento hoy deriva en vez de mover", async ({ ctx, sql, clienteId, conversacionId }) => {
  await sql.query("update clientes set fecha_evento = $2 where id = $1", [clienteId, LUNES]);
  const turno = await crearTurno(sql, { clienteId, inicio: local(LUNES, "16:00") });
  ctx.traza.huecosOfrecidos.push({ ...hueco(LUNES, "17:00", 45), tipo: "invitado" });
  const r = await ejecutarHerramienta("reprogramar_turno", { turno_id: turno, fecha_hora: iso(LUNES, "17:00") }, ctx);
  await quedoDerivado(sql, conversacionId, r);
  const t = await fila(sql, "select inicio from turnos where id = $1", [turno]);
  assertEquals(new Date(t.inicio).getTime(), local(LUNES, "16:00").getTime());
});

// Mateo, 5/10: el texto real lleva el teléfono del local. Sale por buscar_horarios, así que pasa
// por las barandillas: el anterior ("Te paso con un asesor…") lo descartaba anuncia_sin_derivar y
// el teléfono no puede leerse como precio.
// El de devolución tardía (0085) sale por derivar_a_persona y también pasa por las barandillas.
Deno.test({
  name: "los textos reales con el teléfono del local pasan las barandillas tal cual (5/10)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      for (const [clave, herramienta] of [["texto_evento_inminente", "buscar_horarios"], ["texto_devolucion_tardia", "derivar_a_persona"]]) {
        const f = await fila(sql, "select valor from contexto_agente where clave = $1", [clave]);
        assert(f && String(f.valor).trim().length > 0, `falta ${clave} en contexto_agente`);
        assert(!/(^|[^\p{L}])no([^\p{L}]|$)/iu.test(String(f.valor)), `${clave} dice que no: ${f.valor}`);
        const traza = trazaNueva();
        traza.llamadas.push({ herramienta, argumentos: {}, ok: true });
        const b = await aplicarBarandillas({
          texto: String(f.valor), traza, ahora: AHORA, ultimoMensajeClienteAt: AHORA, esPrimerMensaje: false, intencion: "otro", nombreCliente: null,
        });
        assertEquals(b.decision, "enviar", `${clave}: ${JSON.stringify(b.saltos)}`);
        assertEquals(b.texto, String(f.valor), clave);
      }
    }),
});

Deno.test({
  name: "el texto fijo de evento hoy o mañana está cargado en la base real y no dice que no",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const f = await fila(sql, "select valor from contexto_agente where clave = 'texto_evento_inminente'");
      assert(f && String(f.valor).trim().length > 0, "falta texto_evento_inminente en contexto_agente");
      assert(!/(^|[^\p{L}])no([^\p{L}]|$)/iu.test(String(f.valor)), `el texto dice que no: ${f.valor}`);
    }),
});
