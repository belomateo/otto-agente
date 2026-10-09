// Arreglos de la revisión del 8/10 que necesitan la base: cada uno con su caso real y el caso
// parecido que tiene que seguir andando. Todo adentro de la transacción del arnés (rollback).

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { type ClienteSql, dbDesde } from "../../supabase/functions/_shared/db.ts";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { armarContextoDelTurno } from "../../supabase/functions/_shared/turno/contexto.ts";
import { leerHistorial } from "../../supabase/functions/_shared/turno/historial.ts";
import {
  AHORA,
  agendar,
  buscar,
  contar,
  crearTurno,
  esOk,
  esRechazo,
  fichaCompleta,
  hueco,
  iso,
  JUEVES,
  local,
  prueba,
  SABADO,
  soloEstosFragmentos,
  TZ,
} from "./_arnes.ts";

// En la transacción del arnés now() no avanza: los mensajes llevan la hora puesta a mano para que
// el de Lucía quede antes que la respuesta del cliente.
type Sql = import("npm:pg@8.13.1").Client;
const mensaje = (sql: Sql, conversacionId: string, direccion: "entrante" | "saliente", texto: string, haceMinutos: number) =>
  sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, $2, 'texto', $3, clock_timestamp() - make_interval(mins => $4))",
    [conversacionId, direccion, texto, haceMinutos],
  );
const turnosDe = "select count(*)::int as n from turnos where cliente_id = $1";

// ── agendar_turno / reprogramar_turno: el horario lo elige el cliente ──────────────────────

prueba("agendar_turno no reserva si el cliente solo preguntó algo (8/10)", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  await mensaje(sql, conversacionId, "saliente", "Tengo el jueves 6 a las 17:00 o el sábado 8 a las 17:00. ¿Cuál te queda mejor?", 5);
  await mensaje(sql, conversacionId, "entrante", "Ah perdón, el jueves me dijiste por la mañana, pero es feriado, ¿trabajan igual?", 1);
  agenda.lista = [hueco(JUEVES, "17:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await agendar(ctx, JUEVES, "17:00", "invitado");
  esRechazo(r, "horario_no_elegido");
  assertMatch(r.mensaje, /pregunta/);
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno reserva si el cliente nombró la hora, aunque haya preguntado otra cosa (caso parecido)", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  await mensaje(sql, conversacionId, "saliente", "Tengo el jueves 6 a las 11:00 o a las 17:00. ¿Cuál preferís?", 5);
  await mensaje(sql, conversacionId, "entrante", "Para el jueves 1700", 2);
  await mensaje(sql, conversacionId, "entrante", "¿Dirección?", 1);
  agenda.lista = [hueco(JUEVES, "17:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esOk(await agendar(ctx, JUEVES, "17:00", "invitado"));
  assertEquals(await contar(sql, turnosDe, [clienteId]), 1);
});

prueba("agendar_turno: un «sí» alcanza con un solo horario ofrecido, no con dos (caso parecido)", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  agenda.lista = [hueco(JUEVES, "11:00", 45), hueco(JUEVES, "17:00", 45)];
  await mensaje(sql, conversacionId, "saliente", "Tengo el jueves 6 a las 11:00 o a las 17:00. ¿Cuál preferís?", 5);
  await mensaje(sql, conversacionId, "entrante", "Sí", 1);
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await agendar(ctx, JUEVES, "17:00", "invitado");
  esRechazo(r, "horario_no_elegido");
  assertMatch(r.mensaje, /cuál prefiere/);
  // «el segundo» sí elige (las 17:00 eran la segunda opción).
  await mensaje(sql, conversacionId, "entrante", "el segundo", 0);
  esOk(await agendar(ctx, JUEVES, "17:00", "invitado"));
  assertEquals(await contar(sql, turnosDe, [clienteId]), 1);
});

prueba("agendar_turno: «Pero el jueves / Es feriado» no elige el jueves; «El sábado» sí (8/10, repitiendo la charla)", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  agenda.lista = [hueco(JUEVES, "14:00", 45), hueco(SABADO, "13:00", 45)];
  await mensaje(sql, conversacionId, "saliente", "Por la tarde tengo el jueves 6 a las 14:00 o el sábado 8 a las 13:00. ¿Cuál te queda mejor?", 5);
  await mensaje(sql, conversacionId, "entrante", "Pero el jueves", 2);
  await mensaje(sql, conversacionId, "entrante", "Es feriado", 1);
  esOk(await buscar(ctx, JUEVES, SABADO, "invitado"));
  const r = await agendar(ctx, JUEVES, "14:00", "invitado");
  esRechazo(r, "horario_no_elegido");
  assertMatch(r.mensaje, /reparo/);
  await sql.query("delete from mensajes where conversacion_id = $1 and direccion = 'entrante'", [conversacionId]);
  await mensaje(sql, conversacionId, "entrante", "El sábado", 1);
  esOk(await agendar(ctx, SABADO, "13:00", "invitado"));
  assertEquals(await contar(sql, turnosDe, [clienteId]), 1);
});

prueba("agendar_turno: un «sí» a dos días con la misma hora no elige el día (caso parecido)", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  agenda.lista = [hueco(JUEVES, "17:00", 45), hueco(SABADO, "17:00", 45)];
  await mensaje(sql, conversacionId, "saliente", "Tengo el jueves 6 a las 17:00 o el sábado 8 a las 17:00. ¿Cuál te queda mejor?", 5);
  await mensaje(sql, conversacionId, "entrante", "Sí", 1);
  esOk(await buscar(ctx, JUEVES, SABADO, "invitado"));
  esRechazo(await agendar(ctx, JUEVES, "17:00", "invitado"), "horario_no_elegido");
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno: «sí» a una única propuesta reserva (caso parecido)", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  await mensaje(sql, conversacionId, "saliente", "¿Te reservo el jueves 6 de junio a las 17:00?", 5);
  await mensaje(sql, conversacionId, "entrante", "Sí, dale", 1);
  agenda.lista = [hueco(JUEVES, "17:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esOk(await agendar(ctx, JUEVES, "17:00", "invitado"));
});

prueba("reprogramar_turno no mueve el turno por un comentario (8/10), sí con «a la misma hora»", async ({ ctx, sql, clienteId, conversacionId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  const turnoId = await crearTurno(sql, { clienteId, inicio: local("2030-06-05", "17:00") });
  await mensaje(sql, conversacionId, "saliente", "Puedo pasarte al jueves 6 a las 11:00 o a las 17:00. ¿Cuál te sirve?", 5);
  await mensaje(sql, conversacionId, "entrante", "Llegaron a instalar una máquina en el galpón y tienen para todo el día", 1);
  agenda.lista = [hueco(JUEVES, "11:00", 45), hueco(JUEVES, "17:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const mover = (hm: string) => ejecutarHerramienta("reprogramar_turno", { turno_id: turnoId, fecha_hora: iso(JUEVES, hm) }, ctx);
  esRechazo(await mover("11:00"), "horario_no_elegido");
  await mensaje(sql, conversacionId, "entrante", "¿Lo podemos pasar a mañana a la misma hora?", 0);
  esOk(await mover("17:00"));
});

// ── buscar_informacion: un precio de un fragmento queda respaldado ─────────────────────────

prueba("buscar_informacion deja respaldado el precio que trae un fragmento (venta desde $540.000)", async ({ ctx, sql }) => {
  await soloEstosFragmentos(sql, [{
    tema: "que-no-hacemos",
    titulo: "Comprar en vez de alquilar",
    texto: "Mr Otto también vende trajes. Los trajes para compra arrancan desde $540.000.",
  }]);
  esOk(await ejecutarHerramienta("buscar_informacion", { seccion: "que-no-hacemos", consulta: "compra trajes" }, ctx));
  assert(ctx.traza.preciosDevueltos.includes(540000), String(ctx.traza.preciosDevueltos));
});

// ── derivar_a_persona: la despedida es el mensaje entero ───────────────────────────────────

prueba("derivar_a_persona: «A listo» no deriva; «Dale, el jueves a las 15» no es despedida (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  const derivar = () => ejecutarHerramienta("derivar_a_persona", { motivo: "dato_no_encontrado", mensaje_al_cliente: "Te lo confirma el equipo." }, ctx);
  await mensaje(sql, conversacionId, "saliente", "Los zapatos con cinturón son $55.000.", 3);
  await mensaje(sql, conversacionId, "entrante", "A listo", 1);
  const r = await derivar();
  esRechazo(r, "despedida_no_es_derivacion");
  assert(!/cualquier cosa/.test(r.mensaje), r.mensaje);
  await sql.query("delete from mensajes where conversacion_id = $1 and direccion = 'entrante'", [conversacionId]);
  await mensaje(sql, conversacionId, "entrante", "Dale, el jueves a las 15", 1);
  const r2 = await derivar();
  assert(r2.ok || r2.rechazo !== "despedida_no_es_derivacion", JSON.stringify(r2));
});

// ── historial: los audios anteriores del cliente ───────────────────────────────────────────

prueba("el historial trae los audios y las fotos anteriores del cliente (8/10)", async ({ sql, conversacionId }) => {
  await sql.query(
    `insert into mensajes (conversacion_id, direccion, tipo, contenido, transcripcion, enviado_at) values
      ($1, 'entrante', 'audio', null, 'el cumple de 15 de mi nena es el 17', clock_timestamp() - interval '5 minutes'),
      ($1, 'saliente', 'texto', 'Perfecto, Juan.', null, clock_timestamp() - interval '4 minutes'),
      ($1, 'entrante', 'image', 'este me gusta', null, clock_timestamp() - interval '3 minutes')`,
    [conversacionId],
  );
  const h = await leerHistorial(dbDesde(sql as unknown as ClienteSql), conversacionId, new Date(Date.now() + 60_000));
  assertEquals(h.length, 3);
  assertMatch(h[0].content, /audio.*cumple de 15/);
  assertMatch(h[2].content, /foto con el comentario: "este me gusta"/);
});

// ── contexto: el calendario de los próximos días ───────────────────────────────────────────

prueba("el contexto trae los próximos 14 días, con el día cerrado que cargó el equipo", async ({ ctx, sql, clienteId }) => {
  await sql.query("insert into cierres_agenda (fecha, motivo) values ('2030-06-10', 'PRUEBA feriado')");
  const c = await armarContextoDelTurno(ctx.db, { clienteId, ahora: AHORA, tz: TZ, diasDesdeUltimoMensaje: null });
  assertMatch(c.texto, /PRÓXIMOS 14 DÍAS/);
  assertMatch(c.texto, /- lunes 3\/6 \(hoy\): /);
  assertMatch(c.texto, /- martes 4\/6 \(mañana\): /);
  assertMatch(c.texto, /- domingo 9\/6: cerrado/);
  assertMatch(c.texto, /- lunes 10\/6: cerrado \(PRUEBA feriado\)/);
  assertMatch(c.texto, /- sábado 8\/6: abre de 9:30 a 18:30/);
  assertEquals((c.texto.match(/^- \S+ \d+\/\d+/gm) ?? []).length, 14);
});
