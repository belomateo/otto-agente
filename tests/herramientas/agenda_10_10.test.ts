// Trabajo 4, parte agenda (pedido de Mateo, 10/10): Lucía le pasaba al equipo charlas por turnos que
// el equipo sí daba, o decía «no hay lugar» cuando había.
//  · buscar_horarios cortaba en 16 opciones recorriendo los días en orden: en un rango largo los
//    últimos días no aparecían (caso real: «el sábado 17 no hay lugar», y estaba libre). Ahora
//    aparecen todos los días con lugar.
//  · Con lo pedido vacío indicaba pasar la charla. Ahora busca sola lo más cercano, dice por qué esos
//    días no (completo, cerrado, feriado, pegado al evento) y recién si tampoco hay lugar ahí indica
//    pasar la charla.
//  · 0099: Lucía da también el tercer probador (probadores_lucia = null).
// Contra la base real, en una transacción con rollback (arnés). Las primeras usan AgendaDoble; las
// que necesitan la agenda de verdad (el evento recorta lo pedido, el tercer probador) usan
// agendaDesdeBase.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { agendaDesdeBase } from "../../supabase/functions/_shared/agenda/huecos.ts";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { sumarDias } from "../../supabase/functions/_shared/tiempo.ts";
import {
  agendar,
  buscar,
  crearCliente,
  crearTurno,
  DOMINGO,
  esOk,
  FECHA_EVENTO,
  fichaCompleta,
  fila,
  hueco,
  iso,
  JUEVES,
  local,
  LUNES,
  MARTES,
  MIERCOLES,
  prueba,
  SABADO,
  TZ,
} from "./_arnes.ts";

// @deno-types="npm:@types/pg@8.11.10"
import type pg from "npm:pg@8.13.1";

const VIERNES = "2030-06-07";
const LUNES_SIGUIENTE = "2030-06-10";
const MARTES_SIGUIENTE = "2030-06-11";
const SABADO_SIGUIENTE = "2030-06-15";
const MIGRACION_0098 = new URL("../../supabase/migrations/0098_feriados_sin_reserva_y_prendas.sql", import.meta.url);
const MIGRACION_0099 = new URL("../../supabase/migrations/0099_lucia_todos_los_probadores.sql", import.meta.url);

// Sin la reserva de urgencia (apagada desde 0098): con ella, un vacío se explica por la reserva y no
// se buscan alternativas (reserva_urgencia.test.ts).
const sinReserva = (sql: pg.Client) => sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
type Ofrecido = { fecha_hora: string; dia: string; hora: string };

prueba("dos semanas: buscar_horarios muestra todos los días con lugar, el último también (caso del sábado 17)", async ({ sql, ctx, agenda }) => {
  await sinReserva(sql);
  const dias: string[] = [];
  for (let d = MARTES; d <= SABADO_SIGUIENTE; d = sumarDias(d, 1)) if (d !== DOMINGO) dias.push(d);
  const delDia = (d: string) =>
    d === SABADO || d === SABADO_SIGUIENTE
      ? ["09:30", "09:45", "10:00", "15:00", "15:15", "15:30"]
      : ["10:00", "10:15", "10:30", "15:00", "15:15", "15:30"];
  agenda.lista = dias.flatMap((d) => delDia(d).map((h) => hueco(d, h, 45)));

  const r = await buscar(ctx, MARTES, SABADO_SIGUIENTE, "invitado");
  esOk(r);
  const huecos = r.datos.huecos as Ofrecido[];
  // Dos de la mañana y dos de la tarde de cada uno de los 11 días: antes eran 16 y llegaban al viernes 7.
  assertEquals([...new Set(huecos.map((h) => h.fecha_hora.slice(0, 10)))], dias);
  assertEquals(huecos.length, dias.length * 4);
  assertEquals(huecos.filter((h) => h.dia === "sábado 15 de junio").map((h) => h.hora), ["09:30", "09:45", "15:00", "15:15"]);
  assertEquals(ctx.traza.huecosOfrecidos.length, dias.length * 4);
  assertEquals([r.datos.alternativas, r.datos.nota], [undefined, undefined]);
});

prueba("lo pedido sin lugar: devuelve los más cercanos en alternativas, sin pasar la charla, y se pueden agendar", async ({ sql, ctx, agenda, clienteId }) => {
  await sinReserva(sql);
  agenda.lista = [
    ...["10:00", "10:15", "15:00"].map((h) => hueco(VIERNES, h, 45)),
    hueco(SABADO, "09:30", 45),
    hueco(LUNES_SIGUIENTE, "10:00", 45),
    hueco(MARTES_SIGUIENTE, "10:00", 45), // el cuarto día con lugar ya no entra
  ];
  const r = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(r);
  assertEquals(r.datos.huecos, []);
  assertEquals((r.datos.alternativas as Ofrecido[]).map((h) => `${h.dia} ${h.hora}`), [
    "viernes 7 de junio 10:00",
    "viernes 7 de junio 10:15",
    "viernes 7 de junio 15:00",
    "sábado 8 de junio 09:30",
    "lunes 10 de junio 10:00",
  ]);
  const nota = String(r.datos.nota);
  assertMatch(nota, /^El jueves 6 de junio ya está completo\. No pases la charla/);
  assertMatch(nota, /alternativas, que son los más cercanos después de lo que pidió/);
  assert(!/Derivá|dato_no_encontrado/.test(nota), nota);
  // Miró sola las dos semanas siguientes, y eso queda en la traza como cualquier búsqueda.
  assertEquals(agenda.pedidos.map((p) => [p.desde, p.hasta]), [[JUEVES, JUEVES], [VIERNES, "2030-06-20"]]);
  assertEquals(ctx.traza.rangosBuscados.at(-1), { desde: VIERNES, hasta: "2030-06-20" });

  // Lo que ofreció como alternativa se agenda en el mismo turno.
  esOk(await agendar(ctx, VIERNES, "15:00", "invitado"));
  const t = await fila(sql, "select inicio from turnos where cliente_id = $1", [clienteId]);
  assertEquals(new Date(t.inicio).getTime(), local(VIERNES, "15:00").getTime());

  // Si había elegido una hora de ese día, se lo dice primero y ofrece lo más cercano igual.
  const e = await ejecutarHerramienta("buscar_horarios", {
    desde: JUEVES, hasta: JUEVES, tipo_turno: "invitado", fecha_evento: null, fecha_hora: iso(JUEVES, "16:00"),
  }, ctx);
  esOk(e);
  assertEquals(e.datos.horario_elegido_disponible, false);
  assertMatch(String(e.datos.nota), /^El horario que eligió no está disponible\. El jueves 6 de junio ya está completo\./);
  assert((e.datos.alternativas as unknown[]).length > 0);
});

prueba("día cerrado, posible feriado o domingo: la nota dice por qué y ofrece los más cercanos", async ({ sql, ctx, agenda }) => {
  await sql.query(await Deno.readTextFile(MIGRACION_0098)); // feriados_posibles, y deja sin reserva de urgencia
  await sql.query("insert into cierres_agenda (fecha, motivo) values ($1::date, 'PRUEBA inventario')", [JUEVES]);
  await sql.query("insert into feriados_posibles (fecha, nombre) values ($1, 'PRUEBA feriado')", [VIERNES]);
  agenda.lista = [hueco(SABADO, "09:30", 45), hueco(SABADO, "15:00", 45)];

  const cerrado = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(cerrado);
  assertMatch(String(cerrado.datos.nota), /^El jueves 6 de junio el local está cerrado \(PRUEBA inventario\)\. No pases la charla/);
  assertEquals((cerrado.datos.alternativas as Ofrecido[])[0].dia, "sábado 8 de junio");

  // Un posible feriado (sin decidir, 0098) es feriado: no se dice que el local cierra.
  const feriado = await buscar(ctx, VIERNES, VIERNES, "invitado");
  esOk(feriado);
  const nota = String(feriado.datos.nota);
  assertMatch(nota, /^El viernes 7 de junio es feriado \(PRUEBA feriado\)\. Del feriado decí solo que es feriado, sin decir que el local cierra\./);
  assert(!nota.includes("está cerrado"), nota);
  assert((feriado.datos.alternativas as unknown[]).length > 0);

  // El domingo no tiene franjas: cerrado. Adelante no hay nada en la lista, así que ofrece lo de antes.
  const domingo = await buscar(ctx, DOMINGO, DOMINGO, "invitado");
  esOk(domingo);
  assertMatch(String(domingo.datos.nota), /^El domingo 9 de junio el local está cerrado\./);
  assertMatch(String(domingo.datos.nota), /los más cercanos antes de lo que pidió/);

  // Pidiendo los dos días juntos, nombra cada uno con su motivo.
  const juntos = await buscar(ctx, JUEVES, VIERNES, "invitado");
  esOk(juntos);
  assertMatch(
    String(juntos.datos.nota),
    /^Del jueves 6 de junio al viernes 7 de junio no queda lugar: el jueves 6 de junio el local está cerrado \(PRUEBA inventario\); el viernes 7 de junio es feriado \(PRUEBA feriado\)\./,
  );
});

prueba("agenda llena también en lo más cercano: recién ahí indica pasar la charla, y ese pase se puede hacer", async ({ sql, ctx, agenda, clienteId, conversacionId }) => {
  await sinReserva(sql);
  await fichaCompleta(sql, clienteId); // evento el jueves 20 de junio
  agenda.lista = [];
  const r = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(r);
  assertEquals([r.datos.huecos, r.datos.alternativas], [[], undefined]);
  assertMatch(
    String(r.datos.nota),
    /^El jueves 6 de junio ya está completo\. Tampoco hay lugar en los días más cercanos \(se miró del lunes 3 de junio al jueves 20 de junio\)\. Derivá con dato_no_encontrado/,
  );
  // Miró las dos semanas siguientes (sin pasar del evento) y, como ahí tampoco había, de hoy al miércoles.
  assertEquals(agenda.pedidos.map((p) => [p.desde, p.hasta]), [[JUEVES, JUEVES], [VIERNES, FECHA_EVENTO], [LUNES, MIERCOLES]]);
  // Con eso derivar_a_persona ya no la frena por haber buscado poco (busqueda_muy_corta).
  esOk(await ejecutarHerramienta("derivar_a_persona", { motivo: "dato_no_encontrado", mensaje_al_cliente: "Le paso tu consulta al equipo para buscarte un lugar." }, ctx));
  assertEquals((await fila(sql, "select motivo from derivaciones where conversacion_id = $1", [conversacionId])).motivo, "dato_no_encontrado");
});

prueba("el día pegado al evento: dice hasta cuándo puede ser la prueba y ofrece los días de antes (agenda real)", async ({ sql, ctx }) => {
  await sinReserva(sql);
  // Dos días de confección (Mateo, 16/9), por si en la base hay otro número cargado.
  const [col] = (await sql.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'configuracion_agenda' and column_name = 'dias_confeccion'`,
  )).rows;
  if (col) await sql.query("update configuracion_agenda set dias_confeccion = 2");
  ctx.agenda = agendaDesdeBase(ctx.db, TZ);

  // Casamiento el sábado 15 y pide el viernes 14: la última prueba es el jueves 13.
  const r = await buscar(ctx, "2030-06-14", "2030-06-14", "invitado", SABADO_SIGUIENTE);
  esOk(r);
  assertEquals(r.datos.huecos, []);
  const nota = String(r.datos.nota);
  assertMatch(nota, /^El viernes 14 de junio ya queda muy cerca del evento: para que lleguen los ajustes, la prueba tiene que ser hasta el jueves 13 de junio\./);
  assertMatch(nota, /los más cercanos antes de lo que pidió/);
  assert(!nota.includes("completo"), nota);
  const dias = [...new Set((r.datos.alternativas as Ofrecido[]).map((h) => h.dia))];
  assertEquals(dias, ["martes 11 de junio", "miércoles 12 de junio", "jueves 13 de junio"]);
});

prueba("0099: con los otros dos tomados, Lucía da el tercer probador; la migración se puede correr dos veces (agenda real)", async ({ sql, ctx }) => {
  await sinReserva(sql);
  await sql.query("update configuracion_agenda set escalonado_min = 15, probadores_lucia = 2"); // como quedó el 30/9 (0073)
  ctx.agenda = agendaDesdeBase(ctx.db, TZ);
  const otro = await crearCliente(sql);
  await crearTurno(sql, { clienteId: otro, inicio: local(JUEVES, "15:00"), probador: 1 });
  await crearTurno(sql, { clienteId: otro, inicio: local(JUEVES, "15:15"), probador: 2 });
  const primeroDesdeLas1530 = async () => {
    const r = await ejecutarHerramienta("buscar_horarios", {
      desde: JUEVES, hasta: JUEVES, tipo_turno: "invitado", fecha_evento: null, fecha_hora: null, desde_hora: "15:30", hasta_hora: null,
    }, ctx);
    esOk(r);
    return (r.datos.huecos as Ofrecido[])[0]?.hora;
  };
  assertEquals(await primeroDesdeLas1530(), "15:45", "con el tope en 2, a las 15:30 no le quedaba probador a Lucía");

  const version = Number((await fila(sql, "select version from configuracion_agenda")).version);
  for (let vez = 0; vez < 2; vez++) await sql.query(await Deno.readTextFile(MIGRACION_0099));
  const conf = await fila(sql, "select probadores_lucia, version, editado_por from configuracion_agenda");
  assertEquals([conf.probadores_lucia, Number(conf.version)], [null, version + 1], "la segunda vez no cambia nada");
  assertMatch(String(conf.editado_por), /todos los probadores/);

  assertEquals(await primeroDesdeLas1530(), "15:30");
  const a = await agendar(ctx, JUEVES, "15:30", "invitado");
  esOk(a);
  assertEquals(Number((await fila(sql, "select probador from turnos where id = $1", [a.datos.turno_id])).probador), 3);
});
