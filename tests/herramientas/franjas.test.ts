// Decisión #7 de Mateo (14/9): los turnos se dan por franjas, cada una con su cantidad de
// probadores, y el local abre más horas que las de turnos. La guarda de agendar_turno y
// reprogramar_turno y el horario en palabras de buscar_informacion se prueban acá con las
// franjas del 14/9, sin base. La prueba contra la base de "un probador que no toma turnos en
// esa franja" corre cuando paneles cree franjas_turnos; hasta entonces se saltea y lo dice.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { dentroDeFranja, describirHorarios, type Franja, type HorarioLocal } from "../../supabase/functions/_shared/herramientas/horario_laboral.ts";
import { MS_POR_MINUTO } from "../../supabase/functions/_shared/tiempo.ts";
import { agendar, contar, esOk, esRechazo, fila, HAY_FRANJAS, hueco, local, prueba, SABADO, TZ } from "./_arnes.ts";

const m = (hm: string) => {
  const [h, mi] = hm.split(":").map(Number);
  return h * 60 + mi;
};

// Las del 14/9: lunes a viernes de 13 a 19 con 3; sábado de 9:30 a 12 con 3 y de 13:30 a 18:30 con 2.
const FRANJAS: Franja[] = [
  ...[1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, desde: m("13:00"), hasta: m("19:00"), probadores: 3 })),
  { diaSemana: 6, desde: m("09:30"), hasta: m("12:00"), probadores: 3 },
  { diaSemana: 6, desde: m("13:30"), hasta: m("18:30"), probadores: 2 },
];
const LOCAL: HorarioLocal[] = [
  ...[1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, apertura: m("10:00"), cierre: m("19:00") })),
  { diaSemana: 6, apertura: m("09:30"), cierre: m("18:30") },
];

const turno = (ymd: string, hm: string, minutos = 45) => {
  const inicio = local(ymd, hm);
  return [inicio, new Date(inicio.getTime() + minutos * MS_POR_MINUTO)] as const;
};
const entra = (ymd: string, hm: string, probador?: number, minutos = 45) => {
  const [i, f] = turno(ymd, hm, minutos);
  return dentroDeFranja(i, f, FRANJAS, TZ, probador);
};

Deno.test("franjas: de lunes a viernes a la mañana no hay turnos, aunque el local esté abierto", () => {
  const r = entra("2030-06-03", "11:00");
  assert(!r.ok);
  assertMatch(r.motivo, /el lunes los turnos son de 13:00 a 19:00/);
});

Deno.test("franjas: la tarde de lunes a viernes, hasta el último turno que termina a las 19 (caso parecido)", () => {
  assert(entra("2030-06-03", "13:00").ok);
  assert(entra("2030-06-03", "18:15").ok);
  assert(!entra("2030-06-03", "18:30").ok);
  assert(!entra("2030-06-03", "12:30").ok, "empieza antes de la franja");
});

Deno.test("franjas: el sábado entre las 12 y las 13:30 no hay turnos", () => {
  assert(!entra("2030-06-08", "12:00").ok);
  assert(!entra("2030-06-08", "11:30").ok, "se pasa de las 12");
  assert(entra("2030-06-08", "11:15").ok, "termina justo a las 12");
  assert(entra("2030-06-08", "13:30").ok);
});

Deno.test("franjas: el sábado a la tarde el probador 3 no toma turnos", () => {
  const r = entra("2030-06-08", "14:00", 3);
  assert(!r.ok);
  assertMatch(r.motivo, /toman turnos 2 probadores/);
  assert(entra("2030-06-08", "14:00", 2).ok);
  assert(entra("2030-06-08", "10:00", 3).ok, "a la mañana del sábado sí toma");
});

Deno.test("franjas: el domingo no hay turnos", () => {
  const r = entra("2030-06-09", "11:00");
  assert(!r.ok);
  assertMatch(r.motivo, /los domingos no se dan turnos/);
});

Deno.test("el horario del local y el de los turnos, en palabras, como los dio Otto España", () => {
  const h = describirHorarios(LOCAL, FRANJAS);
  assertEquals(h.local, "Lunes a viernes, de 10:00 a 19:00. Sábados, de 9:30 a 18:30. Domingos, cerrado.");
  assertEquals(h.turnos, "Lunes a viernes, de 13:00 a 19:00. Sábados, de 9:30 a 12:00 y de 13:30 a 18:30. Domingos, sin turnos.");
  assertEquals([...h.horas].sort(), ["09:30", "10:00", "12:00", "13:00", "13:30", "18:30", "19:00"]);
});

prueba(
  "agendar_turno no usa un probador que no toma turnos en esa franja (con franjas_turnos en la base)",
  async ({ ctx, sql, clienteId }) => {
    await sql.query("delete from franjas_turnos where dia_semana = 6");
    await sql.query(
      "insert into franjas_turnos (dia_semana, desde, hasta, probadores) values (6, '09:30', '12:00', 3), (6, '13:30', '18:30', 2)",
    );
    await sql.query("update clientes set nombre = 'Ana', fecha_evento = '2030-06-20' where id = $1", [clienteId]);
    ctx.traza.huecosOfrecidos.push({ ...hueco(SABADO, "14:00", 45, 3), tipo: "invitado" });
    esRechazo(await agendar(ctx, SABADO, "14:00", "invitado"), "fuera_de_horario");
    assertEquals(await contar(sql, "select count(*)::int as n from turnos where cliente_id = $1", [clienteId]), 0);

    ctx.traza.huecosOfrecidos.push({ ...hueco(SABADO, "14:00", 45, 2), tipo: "invitado" });
    const r = await agendar(ctx, SABADO, "14:00", "invitado");
    esOk(r);
    assertEquals((await fila(sql, "select probador from turnos where id = $1", [r.datos.turno_id])).probador, 2);
  },
  { ignorar: !HAY_FRANJAS },
);

if (!HAY_FRANJAS) {
  console.warn("   ⚠ franjas_turnos todavía no existe en la base (paneles, decisión #7): la prueba contra la base se saltea y las herramientas sacan las franjas de horarios.");
}
