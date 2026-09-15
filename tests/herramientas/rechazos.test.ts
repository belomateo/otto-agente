// Control 2 del hito 1.4: un test por cada rechazo de la tabla de AGENTE.md § 4, y al lado el
// caso parecido que tiene que pasar (así el rechazo no es un "rechaza todo"). Cada uno verifica
// además que la base quedó como estaba.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import {
  agendar,
  buscar,
  contar,
  crearCliente,
  crearModelo,
  crearTurno,
  DOMINGO,
  esOk,
  esRechazo,
  fichaCompleta,
  fila,
  hueco,
  iso,
  JUEVES,
  local,
  MARTES,
  MIERCOLES,
  prueba,
  SABADO,
} from "./_arnes.ts";

const turnosDe = "select count(*)::int as n from turnos where cliente_id = $1";

// ── agendar_turno ────────────────────────────────────────────────────────────────────────

prueba("agendar_turno rechaza un hueco que no salió de buscar_horarios en este turno", async ({ ctx, sql, clienteId }) => {
  await fichaCompleta(sql, clienteId);
  const r = await agendar(ctx, JUEVES, "11:00", "invitado");
  esRechazo(r, "hueco_no_ofrecido");
  assertMatch(r.mensaje, /buscar_horarios/);
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno rechaza una hora que buscar_horarios dio para otro tipo de turno", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esRechazo(await agendar(ctx, JUEVES, "11:00", "novio"), "hueco_no_ofrecido");
  esRechazo(await agendar(ctx, JUEVES, "11:15", "invitado"), "hueco_no_ofrecido");
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno acepta el hueco que salió de buscar_horarios en este turno (caso parecido)", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esOk(await agendar(ctx, JUEVES, "11:00", "invitado"));
  assertEquals(await contar(sql, turnosDe, [clienteId]), 1);
});

prueba("agendar_turno rechaza fuera de horario aunque la agenda lo haya dado: domingo", async ({ ctx, sql, clienteId }) => {
  await fichaCompleta(sql, clienteId);
  ctx.traza.huecosOfrecidos.push({ ...hueco(DOMINGO, "11:00", 45), tipo: "invitado" }); // una agenda con un error
  const r = await agendar(ctx, DOMINGO, "11:00", "invitado");
  esRechazo(r, "fuera_de_horario");
  assertMatch(r.mensaje, /domingos/);
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno rechaza fuera de horario: dentro del corte del mediodía", async ({ ctx, sql, clienteId }) => {
  await fichaCompleta(sql, clienteId);
  ctx.traza.huecosOfrecidos.push({ ...hueco(MARTES, "13:30", 45), tipo: "invitado" });
  const r = await agendar(ctx, MARTES, "13:30", "invitado");
  esRechazo(r, "fuera_de_horario");
  assertMatch(r.mensaje, /los turnos son de 10:00 a 14:00 y de 15:00 a 19:00/);
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno rechaza fuera de horario: termina después del cierre", async ({ ctx, sql, clienteId }) => {
  await fichaCompleta(sql, clienteId);
  ctx.traza.huecosOfrecidos.push({ ...hueco(MIERCOLES, "18:30", 45), tipo: "invitado" });
  esRechazo(await agendar(ctx, MIERCOLES, "18:30", "invitado"), "fuera_de_horario");
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno acepta el último hueco que termina justo al cierre (caso parecido)", async ({ ctx, sql, clienteId }) => {
  await fichaCompleta(sql, clienteId);
  ctx.traza.huecosOfrecidos.push({ ...hueco(MIERCOLES, "18:15", 45), tipo: "invitado" });
  esOk(await agendar(ctx, MIERCOLES, "18:15", "invitado"));
});

prueba("agendar_turno rechaza si el cliente ya tiene un turno activo", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00"), probador: 2 });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await agendar(ctx, JUEVES, "11:00", "invitado");
  esRechazo(r, "turno_activo");
  assertMatch(r.mensaje, /reprogramar_turno/);
  assertEquals(await contar(sql, turnosDe, [clienteId]), 1);
});

prueba("agendar_turno agenda si el turno anterior está cancelado (caso parecido)", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00"), probador: 2, estado: "cancelado" });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esOk(await agendar(ctx, JUEVES, "11:00", "invitado"));
  assertEquals(await contar(sql, `${turnosDe} and estado = 'sin-confirmar'`, [clienteId]), 1);
});

prueba("agendar_turno rechaza si falta el nombre", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId, { nombre: null });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await agendar(ctx, JUEVES, "11:00", "invitado", { nombre: "   " });
  esRechazo(r, "falta_nombre");
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno usa el nombre de la ficha si el modelo no lo manda (caso parecido)", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId, { nombre: "Lautaro" });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await agendar(ctx, JUEVES, "11:00", "invitado");
  esOk(r);
  assertMatch(r.efectos?.mensajesAlCliente?.[0] ?? "", /¡Listo, Lautaro!/);
});

prueba("agendar_turno rechaza si falta la fecha del evento", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId, { fecha_evento: null });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esRechazo(await agendar(ctx, JUEVES, "11:00", "invitado"), "falta_fecha_evento");
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno rechaza un turno que cae después del evento", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId, { fecha_evento: MIERCOLES });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esRechazo(await agendar(ctx, JUEVES, "11:00", "invitado"), "turno_despues_del_evento");
  assertEquals(await contar(sql, turnosDe, [clienteId]), 0);
});

prueba("agendar_turno rechaza una fecha del evento que ya pasó", async ({ ctx, sql, clienteId, agenda }) => {
  await fichaCompleta(sql, clienteId);
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  esRechazo(await agendar(ctx, JUEVES, "11:00", "invitado", { fecha_evento: "2030-05-01" }), "fecha_evento_pasada");
});

prueba("agendar_turno rechaza un día y hora con formato inventado (sin zona)", async ({ ctx, sql, clienteId }) => {
  await fichaCompleta(sql, clienteId);
  const r = await ejecutarHerramienta(
    "agendar_turno",
    { fecha_hora: "jueves 11hs", tipo: "invitado", nombre: null, evento: null, fecha_evento: null },
    ctx,
  );
  esRechazo(r, "argumentos_invalidos");
  assertMatch(r.mensaje, /fecha_hora/);
});

// ── reprogramar_turno ────────────────────────────────────────────────────────────────────

prueba("reprogramar_turno rechaza un turno de otro cliente", async ({ ctx, sql, agenda }) => {
  const otro = await crearCliente(sql);
  const turno = await crearTurno(sql, { clienteId: otro, inicio: local(SABADO, "10:00"), probador: 2 });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await ejecutarHerramienta("reprogramar_turno", { turno_id: turno, fecha_hora: iso(JUEVES, "11:00") }, ctx);
  esRechazo(r, "turno_de_otro_cliente");
  const t = await fila(sql, "select inicio, probador from turnos where id = $1", [turno]);
  assertEquals(new Date(t.inicio).getTime(), local(SABADO, "10:00").getTime());
  assertEquals(t.probador, 2);
});

prueba("reprogramar_turno rechaza un hueco que no salió de buscar_horarios en este turno", async ({ ctx, sql, clienteId }) => {
  const turno = await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00") });
  const r = await ejecutarHerramienta("reprogramar_turno", { turno_id: turno, fecha_hora: iso(JUEVES, "11:00") }, ctx);
  esRechazo(r, "hueco_no_ofrecido");
  const t = await fila(sql, "select inicio from turnos where id = $1", [turno]);
  assertEquals(new Date(t.inicio).getTime(), local(SABADO, "10:00").getTime());
});

prueba("reprogramar_turno rechaza un hueco fuera de horario aunque esté en la traza", async ({ ctx, sql, clienteId }) => {
  const turno = await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00") });
  ctx.traza.huecosOfrecidos.push({ ...hueco(DOMINGO, "10:00", 45), tipo: "invitado" });
  const r = await ejecutarHerramienta("reprogramar_turno", { turno_id: turno, fecha_hora: iso(DOMINGO, "10:00") }, ctx);
  esRechazo(r, "fuera_de_horario");
});

prueba("reprogramar_turno rechaza un turno que ya no está activo", async ({ ctx, sql, clienteId, agenda }) => {
  const turno = await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00"), estado: "cancelado" });
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await ejecutarHerramienta("reprogramar_turno", { turno_id: turno, fecha_hora: iso(JUEVES, "11:00") }, ctx);
  esRechazo(r, "turno_no_activo");
});

// ── cancelar_turno ───────────────────────────────────────────────────────────────────────

prueba("cancelar_turno rechaza un turno de otro cliente", async ({ ctx, sql }) => {
  const otro = await crearCliente(sql);
  const turno = await crearTurno(sql, { clienteId: otro, inicio: local(SABADO, "10:00") });
  const r = await ejecutarHerramienta("cancelar_turno", { turno_id: turno, motivo: "no puede ir" }, ctx);
  esRechazo(r, "turno_de_otro_cliente");
  assertEquals((await fila(sql, "select estado from turnos where id = $1", [turno])).estado, "sin-confirmar");
});

prueba("cancelar_turno rechaza un id que no existe", async ({ ctx }) => {
  const r = await ejecutarHerramienta("cancelar_turno", { turno_id: crypto.randomUUID(), motivo: "no puede ir" }, ctx);
  esRechazo(r, "turno_inexistente");
});

// ── enviar_fotos ─────────────────────────────────────────────────────────────────────────

prueba("enviar_fotos rechaza más de tres modelos", async ({ ctx }) => {
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const r = await ejecutarHerramienta("enviar_fotos", { modelo_ids: ids }, ctx);
  esRechazo(r, "argumentos_invalidos");
  assertMatch(r.mensaje, /como máximo 3/);
});

prueba("enviar_fotos rechaza un id que no existe en el catálogo", async ({ ctx, sql }) => {
  const existe = await crearModelo(sql, { modelo: "Modelo de prueba", fotos: ["foto-de-prueba.jpg"] });
  const noExiste = crypto.randomUUID();
  const r = await ejecutarHerramienta("enviar_fotos", { modelo_ids: [existe, noExiste] }, ctx);
  esRechazo(r, "modelo_inexistente");
  assertMatch(r.mensaje, new RegExp(noExiste));
});

prueba("enviar_fotos manda la primera foto de cada modelo que existe (caso parecido)", async ({ ctx, sql }) => {
  const a = await crearModelo(sql, { modelo: "Modelo A", fotos: ["a1.jpg", "a2.jpg"] });
  const b = await crearModelo(sql, { modelo: "Modelo B", fotos: ["b1.jpg"] });
  const r = await ejecutarHerramienta("enviar_fotos", { modelo_ids: [a, b] }, ctx);
  esOk(r);
  assertEquals(r.efectos?.imagenes, ["a1.jpg", "b1.jpg"]);
});

prueba("enviar_fotos rechaza un modelo sin fotos cargadas", async ({ ctx, sql }) => {
  const sinFotos = await crearModelo(sql, { modelo: "Modelo sin fotos" });
  esRechazo(await ejecutarHerramienta("enviar_fotos", { modelo_ids: [sinFotos] }, ctx), "modelo_sin_fotos");
});

// ── enviar_link ──────────────────────────────────────────────────────────────────────────

prueba("enviar_link rechaza un tipo fuera de mapa, resena y web", async ({ ctx }) => {
  for (const tipo of ["pago", "mercadopago", "instagram"]) {
    const r = await ejecutarHerramienta("enviar_link", { tipo }, ctx);
    esRechazo(r, "argumentos_invalidos");
    assertMatch(r.mensaje, /mapa, resena, web/);
  }
});

// ── derivar_a_persona ────────────────────────────────────────────────────────────────────

const derivacionesDe = "select count(*)::int as n from derivaciones where conversacion_id = $1";

prueba("derivar_a_persona rechaza un motivo fuera del enum", async ({ ctx, sql, conversacionId }) => {
  const r = await ejecutarHerramienta("derivar_a_persona", { motivo: "cliente_enojado", mensaje_al_cliente: null }, ctx);
  esRechazo(r, "argumentos_invalidos");
  assertEquals(await contar(sql, derivacionesDe, [conversacionId]), 0);
  assertEquals((await fila(sql, "select estado from conversaciones where id = $1", [conversacionId])).estado, "activa");
});

prueba("derivar_a_persona rechaza una despedida con pregunta", async ({ ctx, sql, conversacionId }) => {
  for (const mensaje of ["Te paso con el equipo, ¿te parece?", "Le paso tu consulta. ¿Me dejás tu mail?"]) {
    const r = await ejecutarHerramienta("derivar_a_persona", { motivo: "pide_persona", mensaje_al_cliente: mensaje }, ctx);
    esRechazo(r, "mensaje_con_pregunta");
  }
  assertEquals(await contar(sql, derivacionesDe, [conversacionId]), 0);
  assertEquals((await fila(sql, "select estado from conversaciones where id = $1", [conversacionId])).estado, "activa");
});

prueba("derivar_a_persona acepta una despedida sin pregunta (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  const r = await ejecutarHerramienta(
    "derivar_a_persona",
    { motivo: "pide_persona", mensaje_al_cliente: "Le paso tu consulta a alguien del equipo y te escriben en un rato." },
    ctx,
  );
  esOk(r);
  assert(r.efectos?.cortaTurno);
  assertEquals(await contar(sql, derivacionesDe, [conversacionId]), 1);
});

// Hallazgo propio, 15/9, al re-correr los 15 guiones después del fix de C2: con la puerta de
// evento_inminente cerrada, el guion evento-manana-deriva derivó igual con motivo
// turno_urgente_sin_hueco sin haber llamado nunca a buscar_horarios — la fecha del evento no se
// guardó y salió un texto propio en vez del fijo. Mismo problema que C2, un escalón más abajo.
prueba("derivar_a_persona rechaza turno_urgente_sin_hueco si no llamó a buscar_horarios en este turno", async ({ ctx, sql, conversacionId }) => {
  const r = await ejecutarHerramienta(
    "derivar_a_persona",
    { motivo: "turno_urgente_sin_hueco", mensaje_al_cliente: "Como el evento es pronto, te paso con un asesor." },
    ctx,
  );
  esRechazo(r, "sin_buscar_horarios");
  assertEquals(await contar(sql, derivacionesDe, [conversacionId]), 0);
});

prueba("derivar_a_persona acepta turno_urgente_sin_hueco si buscar_horarios ya corrió en este turno (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  ctx.traza.llamadas.push({ herramienta: "buscar_horarios", argumentos: { desde: "2026-09-20", hasta: "2026-09-27" }, ok: true });
  const r = await ejecutarHerramienta(
    "derivar_a_persona",
    { motivo: "turno_urgente_sin_hueco", mensaje_al_cliente: "No encontramos un hueco a tiempo, te paso con el equipo." },
    ctx,
  );
  esOk(r);
  assertEquals(await contar(sql, derivacionesDe, [conversacionId]), 1);
});

// ── cualquier herramienta ────────────────────────────────────────────────────────────────

prueba("una herramienta que no existe o un parámetro de más se rechazan sin tocar nada", async ({ ctx }) => {
  esRechazo(await ejecutarHerramienta("dar_descuento", { porcentaje: 10 }, ctx), "herramienta_desconocida");
  esRechazo(await ejecutarHerramienta("anotar", { texto: "hola que tal", autor: "yo" }, ctx), "argumentos_invalidos");
  esRechazo(await ejecutarHerramienta("anotar", "esto no es json", ctx), "argumentos_invalidos");
  assertEquals(ctx.traza.llamadas.length, 3);
  assert(ctx.traza.llamadas.every((l) => !l.ok));
});
