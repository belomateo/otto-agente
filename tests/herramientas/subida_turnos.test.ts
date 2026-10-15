// Subida de turnos (0105): la corrida de la noche contra la base real, adentro de una transacción que termina en
// rollback. El modelo que lee la charla es un doble con la respuesta fija; lo que se prueba es lo que hace el
// código con eso: no escribir en modo prueba, cargar sin duplicar, mover el turno que ya tiene, no pisar a nadie
// y poner o sacar la etiqueta.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { correrNoche, ETIQUETA_FALTA_DATOS, type Modo } from "../../supabase/functions/subida-turnos/noche.ts";
import type { Acuerdo } from "../../supabase/functions/subida-turnos/lector.ts";
import { AHORA, crearTurno, local, MIERCOLES, prueba, TZ } from "./_arnes.ts";

type Sql = import("npm:pg@8.13.1").Client;

const MIGRACION = await Deno.readTextFile(new URL("../../supabase/migrations/0105_subida_de_turnos.sql", import.meta.url));
// Sin el cron: pg_cron/Vault no entran en una prueba.
const TABLAS = MIGRACION.slice(0, MIGRACION.indexOf("-- El reloj"));

async function prepararTabla(sql: Sql) {
  await sql.query(TABLAS);
}

const mensaje = (sql: Sql, conversacionId: string, direccion: "entrante" | "saliente", contenido: string, hora: string) =>
  sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, $2, 'texto', $3, $4::timestamptz)",
    [conversacionId, direccion, contenido, `2030-06-03T${hora}:00-03:00`],
  );

const acuerdo = (o: Partial<Acuerdo> = {}): Acuerdo => ({
  frase: "dale, ese me sirve", hayAcuerdo: true, dia: MIERCOLES, hora: "15:00", propuso: "local", acepto: "cliente",
  nombre: null, email: null, intencionSinHora: false, motivo: "", ...o,
});

async function charlaConAcuerdo(sql: Sql, conversacionId: string) {
  await mensaje(sql, conversacionId, "saliente", "[mostrador] te puedo el miercoles a las 15", "10:00");
  await mensaje(sql, conversacionId, "entrante", "dale, ese me sirve", "10:05");
}

const correr = (e: { ctx: { db: import("../../supabase/functions/_shared/db.ts").Db }; conversacionId: string }, modo: Modo, a: Acuerdo | null) =>
  correrNoche(e.ctx.db, { ahora: AHORA, tz: TZ, modo, conversaciones: [e.conversacionId], leer: () => Promise.resolve(a) });

const turnosDe = async (sql: Sql, clienteId: string) =>
  (await sql.query("select id::text, inicio, estado, probador, editado_por from turnos where cliente_id = $1 order by inicio", [clienteId])).rows;

prueba("modo prueba: lee y anota qué haría, pero no escribe ningún turno", async (e) => {
  await prepararTabla(e.sql);
  await charlaConAcuerdo(e.sql, e.conversacionId);
  const r = await correr(e, "prueba", acuerdo());
  assertEquals(r.cargados.length, 1);
  assert(r.cargados[0].includes("prueba"));
  assertEquals((await turnosDe(e.sql, e.clienteId)).length, 0);
  const log = (await e.sql.query("select accion, modo from subida_turnos where conversacion_id = $1", [e.conversacionId])).rows;
  assertEquals(log, [{ accion: "cargar", modo: "prueba" }]);
});

prueba("modo real: carga el turno firmado «subida-automatica» y una segunda corrida no lo duplica", async (e) => {
  await prepararTabla(e.sql);
  await charlaConAcuerdo(e.sql, e.conversacionId);
  const r = await correr(e, "real", acuerdo());
  assertEquals(r.cargados.length, 1);
  const turnos = await turnosDe(e.sql, e.clienteId);
  assertEquals(turnos.length, 1);
  assertEquals(turnos[0].editado_por, "subida-automatica");
  assertEquals(turnos[0].estado, "sin-confirmar");
  assertEquals(new Date(turnos[0].inicio as string).toISOString(), local(MIERCOLES, "15:00").toISOString());
  // Segunda vez, mismo día: la charla ya está registrada, no se lee ni se carga de nuevo.
  const r2 = await correr(e, "real", acuerdo());
  assertEquals(r2.charlas, 0);
  assertEquals((await turnosDe(e.sql, e.clienteId)).length, 1);
});

prueba("si ya tiene un turno otro día, lo mueve y no deja dos (decisión de Mateo)", async (e) => {
  await prepararTabla(e.sql);
  await charlaConAcuerdo(e.sql, e.conversacionId);
  const id = await crearTurno(e.sql, { clienteId: e.clienteId, inicio: local("2030-06-07", "11:00") });
  const r = await correr(e, "real", acuerdo());
  assertEquals(r.movidos.length, 1);
  const turnos = await turnosDe(e.sql, e.clienteId);
  assertEquals(turnos.length, 1);
  assertEquals(turnos[0].id, id);
  assertEquals(new Date(turnos[0].inicio as string).toISOString(), local(MIERCOLES, "15:00").toISOString());
});

prueba("si el horario ya existe para el cliente, no hace nada (ya estaba)", async (e) => {
  await prepararTabla(e.sql);
  await charlaConAcuerdo(e.sql, e.conversacionId);
  await crearTurno(e.sql, { clienteId: e.clienteId, inicio: local(MIERCOLES, "15:00") });
  const r = await correr(e, "real", acuerdo());
  assertEquals(r.yaEstaban, 1);
  assertEquals((await turnosDe(e.sql, e.clienteId)).length, 1);
});

prueba("sin hora: no carga y deja la etiqueta «Falta datos para agendar»; modo prueba no la pone", async (e) => {
  await prepararTabla(e.sql);
  await mensaje(e.sql, e.conversacionId, "entrante", "quiero sacar un turno, voy el miércoles", "10:00");
  const sinHora = acuerdo({ hayAcuerdo: false, hora: null, intencionSinHora: true, motivo: "falta la hora" });
  const enPrueba = await correr(e, "prueba", sinHora);
  assertEquals(enPrueba.faltaDatos.length, 1);
  assertEquals((await e.sql.query("select etiquetas from conversaciones where id = $1", [e.conversacionId])).rows[0].etiquetas, []);
  await e.sql.query("delete from subida_turnos");
  const real = await correr(e, "real", sinHora);
  assertEquals(real.faltaDatos.length, 1);
  assertEquals((await e.sql.query("select etiquetas from conversaciones where id = $1", [e.conversacionId])).rows[0].etiquetas, [ETIQUETA_FALTA_DATOS]);
  assertEquals((await turnosDe(e.sql, e.clienteId)).length, 0);
});

prueba("caso parecido: con los tres probadores ocupados a esa hora no pisa a nadie y va a revisión", async (e) => {
  await prepararTabla(e.sql);
  await charlaConAcuerdo(e.sql, e.conversacionId);
  const otro = (await e.sql.query("insert into clientes (telefono) values ('+5490009999999') returning id::text as id")).rows[0].id as string;
  for (const probador of [1, 2, 3]) await crearTurno(e.sql, { clienteId: otro, inicio: local(MIERCOLES, "15:00"), probador });
  const r = await correr(e, "real", acuerdo());
  assertEquals(r.cargados.length, 0);
  assertEquals(r.dudosos.length, 1);
  assertEquals((await turnosDe(e.sql, e.clienteId)).length, 0);
});

prueba("si el modelo no pudo leer la charla, no carga nada", async (e) => {
  await prepararTabla(e.sql);
  await charlaConAcuerdo(e.sql, e.conversacionId);
  const r = await correr(e, "real", null);
  assertEquals(r.cargados.length + r.movidos.length, 0);
  assertEquals(r.dudosos.length, 1);
  assertEquals((await turnosDe(e.sql, e.clienteId)).length, 0);
});
