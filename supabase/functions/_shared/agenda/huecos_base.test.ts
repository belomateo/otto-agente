// La agenda contra la base real (hito 1.13): lee franjas_turnos, configuracion_agenda,
// duraciones_turno y turnos, y va enchufada detrás de buscar_horarios y agendar_turno de agente.
// Cada prueba corre adentro de una transacción que termina en rollback, con fechas de 2030: no
// queda nada en la base.
// Correr: deno test --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=.env supabase/functions/_shared/agenda

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { type ClienteSql, type Db, dbDesde } from "../db.ts";
import { ejecutarHerramienta } from "../herramientas/index.ts";
import { calendarioDeEnsayo, type ContextoHerramienta, type Resultado } from "../herramientas/tipos.ts";
import { horaLocal } from "../tiempo.ts";
import { trazaNueva } from "../traza.ts";
import { agendaDesdeBase } from "./huecos.ts";

const TZ = "America/Argentina/Cordoba";
const local = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00-03:00`);
const LUNES = "2030-06-03";
const SABADO = "2030-06-08";
const DOMINGO = "2030-06-09";
const AHORA = local(LUNES, "10:00");
const EVENTO_ESA_SEMANA = SABADO; // dentro de los 7 días de reserva: urgente
const EVENTO_LEJANO = "2030-07-15";

function urlDeLaBase(): string {
  const u = Deno.env.get("SUPABASE_DB_URL");
  if (!u) throw new Error("Falta SUPABASE_DB_URL: corré los tests con --env-file=.env");
  return u;
}

// Las franjas y la configuración del 14/9, fijadas adentro de la transacción: la prueba no
// depende de lo que el dueño tenga cargado.
async function fijarAgenda(sql: pg.Client) {
  await sql.query("delete from franjas_turnos");
  await sql.query(
    `insert into franjas_turnos (dia_semana, desde, hasta, probadores) values
       (1, '13:00', '19:00', 3), (2, '13:00', '19:00', 3), (3, '13:00', '19:00', 3),
       (4, '13:00', '19:00', 3), (5, '13:00', '19:00', 3),
       (6, '09:30', '12:00', 3), (6, '13:30', '18:30', 2)`,
  );
  await sql.query("update configuracion_agenda set cantidad_probadores = 3, escalonado_min = 15, dias_reserva_urgencia = 7");
  await sql.query(
    `update duraciones_turno set duracion_min = case tipo
       when 'doble' then 90 when 'triple' then 120 when 'prueba_final' then 15 else 45 end`,
  );
}

function prueba(nombre: string, fn: (sql: pg.Client, db: Db) => Promise<void>) {
  Deno.test({
    name: nombre,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const sql = new pg.Client({ connectionString: urlDeLaBase() });
      await sql.connect();
      try {
        await sql.query("begin");
        try {
          await fijarAgenda(sql);
          await fn(sql, dbDesde(sql as unknown as ClienteSql));
        } finally {
          await sql.query("rollback");
        }
      } finally {
        await sql.end();
      }
    },
  });
}

const telefonoDePrueba = () => `+549000${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

async function crearCliente(sql: pg.Client, nombre: string, fechaEvento: string): Promise<{ id: string; telefono: string }> {
  const telefono = telefonoDePrueba();
  const id = (await sql.query(
    `insert into clientes (telefono, nombre, evento, fecha_evento) values ($1, $2, 'casamiento', $3)
     returning id::text as id`,
    [telefono, nombre, fechaEvento],
  )).rows[0].id as string;
  return { id, telefono };
}

async function contexto(sql: pg.Client, db: Db, nombre: string, fechaEvento: string): Promise<ContextoHerramienta> {
  const cliente = await crearCliente(sql, nombre, fechaEvento);
  const conversacionId = (await sql.query(
    "insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id",
    [cliente.id],
  )).rows[0].id as string;
  return {
    db,
    cliente,
    conversacionId,
    ahora: AHORA,
    tz: TZ,
    traza: trazaNueva(),
    agenda: agendaDesdeBase(db, TZ),
    calendario: calendarioDeEnsayo,
    derivacionTel: null,
  };
}

function esOk(r: Resultado): asserts r is Extract<Resultado, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba ok y salió ${r.rechazo}: ${r.mensaje}`);
}

const horas = (huecos: { inicio: string }[]) => huecos.map((h) => horaLocal(new Date(h.inicio), TZ));

prueba("lee franjas, escalonado, reserva y duración de la base", async (_sql, db) => {
  const agenda = agendaDesdeBase(db, TZ);
  const invitado = await agenda.huecos({ desde: LUNES, hasta: DOMINGO, tipo: "invitado", ahora: AHORA, fechaEvento: DOMINGO });
  const lunes = invitado.huecos.filter((h) => h.inicio < local("2030-06-04", "00:00").toISOString());
  assertEquals(horas(lunes)[0], "13:00");
  assertEquals(lunes.length, 22);
  // Con el evento el domingo y 2 días de confección (Mateo), el último día de prueba es el
  // viernes: el sábado ya no se ofrece, porque no llegarían a hacer el arreglo.
  const sabado = horas(invitado.huecos.filter((h) => h.inicio >= local(SABADO, "00:00").toISOString()));
  assertEquals(sabado, []);
  // La prueba final sí puede ir el día antes: a esa altura ya no se arregla nada.
  const final = await agenda.huecos({ desde: LUNES, hasta: DOMINGO, tipo: "prueba_final", ahora: AHORA, fechaEvento: DOMINGO });
  const sabadoFinal = horas(final.huecos.filter((h) => h.inicio >= local(SABADO, "00:00").toISOString()));
  assertEquals([sabadoFinal[0], sabadoFinal.find((h) => h >= "12:00")], ["09:30", "13:30"]);
  const doble = await agenda.huecos({ desde: LUNES, hasta: LUNES, tipo: "doble", ahora: AHORA, fechaEvento: SABADO });
  assertEquals(horas(doble.huecos).at(-1), "17:30");
  const lejano = await agenda.huecos({ desde: LUNES, hasta: "2030-06-12", tipo: "invitado", ahora: AHORA, fechaEvento: EVENTO_LEJANO });
  assertEquals(lejano.huecos[0].inicio, local("2030-06-10", "13:00").toISOString());
  const manana = await agenda.huecos({ desde: LUNES, hasta: LUNES, tipo: "invitado", ahora: AHORA, fechaEvento: "2030-06-04" });
  assertEquals(manana, { huecos: [], derivar: "evento_inminente" });
});

prueba("un turno tomado no se ofrece; uno cancelado o no-vino libera el lugar", async (sql, db) => {
  const agenda = agendaDesdeBase(db, TZ);
  const { id } = await crearCliente(sql, "Ocupa", SABADO);
  const turnoId = (await sql.query(
    `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado)
     values ($1, 'invitado', 45, 1, $2, $3, 'confirmado') returning id::text as id`,
    [id, local(LUNES, "13:00").toISOString(), local(LUNES, "13:45").toISOString()],
  )).rows[0].id as string;
  const pedir = () => agenda.huecos({ desde: LUNES, hasta: LUNES, tipo: "invitado", ahora: AHORA, fechaEvento: SABADO });
  let r = await pedir();
  assertEquals(horas(r.huecos)[0], "13:15");
  assertEquals(r.huecos[0].probador, 2);
  for (const estado of ["cancelado", "no-vino"]) {
    await sql.query("update turnos set estado = $2 where id = $1", [turnoId, estado]);
    r = await pedir();
    assertEquals([horas(r.huecos)[0], r.huecos[0].probador], ["13:00", 1], estado);
  }
});

prueba("h. cambiar la tabla cambia el resultado sin tocar código", async (sql, db) => {
  const agenda = agendaDesdeBase(db, TZ);
  const lunes = (tipo: "invitado" | "novio" = "invitado", fechaEvento = SABADO) =>
    agenda.huecos({ desde: LUNES, hasta: LUNES, tipo, ahora: AHORA, fechaEvento });
  await sql.query("update franjas_turnos set desde = '14:00' where dia_semana = 1");
  assertEquals(horas((await lunes()).huecos)[0], "14:00");
  await sql.query("update duraciones_turno set duracion_min = 60 where tipo = 'novio'");
  assertEquals(horas((await lunes("novio")).huecos).at(-1), "18:00");
  assertEquals((await lunes("invitado", EVENTO_LEJANO)).huecos, []); // reserva de 7 días
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  assertEquals(horas((await lunes("invitado", EVENTO_LEJANO)).huecos)[0], "14:00");
});

prueba("g. dos clientes piden el mismo hueco: entra uno solo y el otro recibe hueco_ocupado", async (sql, db) => {
  const a = await contexto(sql, db, "Cliente A", EVENTO_ESA_SEMANA);
  const b = await contexto(sql, db, "Cliente B", EVENTO_ESA_SEMANA);
  const buscar = (ctx: ContextoHerramienta) =>
    ejecutarHerramienta("buscar_horarios", { desde: LUNES, hasta: LUNES, tipo_turno: "invitado", fecha_evento: null }, ctx);
  const agendar = (ctx: ContextoHerramienta, fechaHora: string) =>
    ejecutarHerramienta("agendar_turno", { fecha_hora: fechaHora, tipo: "invitado", nombre: null, evento: null, fecha_evento: null }, ctx);

  const ra = await buscar(a);
  const rb = await buscar(b);
  esOk(ra);
  esOk(rb);
  const huecosA = ra.datos.huecos as { fecha_hora: string; hora: string }[];
  const huecosB = rb.datos.huecos as { fecha_hora: string; hora: string }[];
  assertEquals([huecosA[0].hora, huecosB[0].hora], ["13:00", "13:00"]); // los dos ven el mismo

  esOk(await agendar(a, huecosA[0].fecha_hora));
  const segundo = await agendar(b, huecosB[0].fecha_hora);
  assert(!segundo.ok && segundo.rechazo === "hueco_ocupado", JSON.stringify(segundo));
  const aEsaHora = (await sql.query(
    "select count(*)::int as n from turnos where inicio = $1 and estado not in ('cancelado', 'no-vino')",
    [local(LUNES, "13:00").toISOString()],
  )).rows[0].n;
  assertEquals(aEsaHora, 1);

  // B vuelve a buscar: la agenda ya no ofrece las 13:00 y el primero es 13:15, en otro probador.
  const rb2 = await buscar(b);
  esOk(rb2);
  const huecosB2 = rb2.datos.huecos as { fecha_hora: string; hora: string }[];
  assertEquals(huecosB2[0].hora, "13:15");
  esOk(await agendar(b, huecosB2[0].fecha_hora));
  const probadores = (await sql.query(
    "select probador from turnos where inicio >= $1 and inicio < $2 order by inicio",
    [local(LUNES, "13:00").toISOString(), local(LUNES, "14:00").toISOString()],
  )).rows.map((f) => Number(f.probador));
  assertEquals(probadores, [1, 2]);
});
