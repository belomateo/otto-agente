// Control de 2.1 contra lo DESPLEGADO: Lucía en el worker real (el turno completo de agente con
// el LLM de verdad, el prompt como archivo estático de la función y la conexión directa a la base)
// sin mandar nada por Meta: usa un teléfono ficticio (5490000000…), al que el worker le contesta
// pero no le escribe por WhatsApp. Ese teléfono tiene que estar en LUCIA_TELEFONOS.
//  [1] Ráfaga: dos mensajes seguidos → una sola respuesta, con el segundo trabajo absorbido.
//  [2] Reserva con la lógica del negocio: con los datos completos, Lucía busca horarios y agenda un
//      turno de verdad (fila en turnos, sin confirmar, adentro de una franja y respetando la
//      reserva de urgencia). Mismo arranque que el guion "reprograma" del emulador.
// Los mensajes entran por registrar_mensaje_entrante, como los registra el webhook, y el trigger
// despierta al worker desplegado. Borra todo lo que crea; gasta unos centavos de OpenAI.
// Uso: node tests/sql/lucia-desplegada.mjs
import "dotenv/config";
import pg from "pg";

const TEL = "5490000000079";
const TZ = "America/Argentina/Cordoba";
const ESPERA_MAX_MS = 150_000;

if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

let fallas = 0;
const assert = (ok, msg) => {
  console.log(`  ${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fallas++;
};
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// El "hoy" de Argentina (NEGOCIO_TZ), no el de UTC: igual que scripts/probar-turno.js.
const formato = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fechaEnArgentina = (dias) => formato.format(new Date(Date.now() + dias * 86_400_000));
const EN_2_MESES = fechaEnArgentina(60);

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const filas = async (sql, valores = []) => (await db.query(sql, valores)).rows;

async function limpiar() {
  const [cli] = await filas("select id from clientes where telefono = $1", [TEL]);
  if (!cli) return;
  const convs = (await filas("select id from conversaciones where cliente_id = $1", [cli.id])).map((r) => r.id);
  for (const tabla of ["consumo_llm", "eventos_agente", "derivaciones", "mensajes", "cola_trabajos"]) {
    await db.query(`delete from ${tabla} where conversacion_id = any($1::uuid[])`, [convs]);
  }
  // turnos → clientes es ON DELETE RESTRICT: primero los turnos, con su historial.
  const turnos = (await filas("select id from turnos where cliente_id = $1", [cli.id])).map((r) => r.id);
  if (turnos.length) {
    await db.query("delete from historial_ediciones where tabla = 'turnos' and fila_id = any($1::uuid[])", [turnos]);
    await db.query("delete from turnos where id = any($1::uuid[])", [turnos]);
  }
  await db.query("delete from historial_ediciones where tabla = 'clientes' and fila_id = $1", [cli.id]);
  await db.query("delete from notas where cliente_id = $1", [cli.id]);
  await db.query("delete from conversaciones where cliente_id = $1", [cli.id]);
  await db.query("delete from clientes where id = $1", [cli.id]);
}

let numero = 0;
async function escribir(texto) {
  numero++;
  const crudo = {
    from: TEL,
    id: `wamid.LUCIA21-${Date.now()}-${numero}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: texto },
  };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'texto', $3, now(), $4::jsonb)", [crudo.id, TEL, texto, JSON.stringify(crudo)]);
}

async function charla() {
  const [f] = await filas(
    "select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1",
    [TEL],
  );
  return f?.id ?? null;
}

const salientes = async (conv) =>
  (await filas("select contenido from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at", [conv])).map(
    (r) => r.contenido,
  );

// Hasta que la charla no tenga trabajos abiertos; devuelve lo que Lucía contestó en el medio.
async function esperarRespuesta(antes) {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    await esperar(3000);
    const conv = await charla();
    if (!conv) continue;
    const [{ n }] = await filas(
      "select count(*)::int as n from cola_trabajos where conversacion_id = $1 and estado in ('pendiente', 'procesando')",
      [conv],
    );
    if (n === 0) return (await salientes(conv)).slice(antes);
  }
  throw new Error("el worker no terminó el turno a tiempo");
}

// 2.2 (decisión #17): lo que manda el sistema sale sin «¡» ni «¿» y en 3 mensajes como máximo.
function revisarFormato(respuesta, cuando) {
  assert(
    respuesta.every((m) => !/[¡¿]/.test(m)) && respuesta.length <= 3,
    `${cuando}: sin ¡ ni ¿ y en ${respuesta.length} mensaje/s (máximo 3)`,
  );
}

async function erroresDelTurno(conv) {
  return (await filas("select detalle from eventos_agente where conversacion_id = $1 and tipo = 'error' order by creado_at", [conv])).map(
    (r) => JSON.stringify(r.detalle).slice(0, 200),
  );
}

try {
  await limpiar(); // restos de una corrida cortada

  console.log("\n[1] Ráfaga: dos mensajes seguidos, una sola respuesta");
  await escribir("hola");
  await escribir("queria saber como es lo del alquiler de trajes");
  const r1 = await esperarRespuesta(0);
  const conv = await charla();
  assert(r1.length > 0, `Lucía contestó desde el worker desplegado: «${r1.join(" / ").slice(0, 180)}»`);
  if (!r1.length) console.log("    errores:", await erroresDelTurno(conv));
  revisarFormato(r1, "la respuesta a la ráfaga");
  const trabajos = await filas("select estado, payload from cola_trabajos where conversacion_id = $1", [conv]);
  assert(
    trabajos.length === 2 && trabajos.every((t) => t.estado === "hecho") && trabajos.filter((t) => t.payload.absorbido_por).length === 1,
    `los dos mensajes, en un solo turno: el segundo trabajo quedó absorbido (${trabajos.map((t) => t.estado).join(", ")})`,
  );
  const turnosLucia = await filas("select detalle from eventos_agente where conversacion_id = $1 and detalle->>'etapa' = 'worker-lucia'", [conv]);
  assert(
    turnosLucia.length === 1 && turnosLucia[0].detalle.simulado === true,
    "un solo turno de Lucía, y al teléfono ficticio no le salió nada por Meta (simulado)",
  );
  const [{ n: llamadas }] = await filas("select count(*)::int as n from consumo_llm where conversacion_id = $1", [conv]);
  assert(llamadas > 0, `el turno llamó al LLM de verdad desde la función desplegada (${llamadas} filas en consumo_llm)`);

  console.log("\n[2] Reserva: con los datos completos, Lucía agenda con la lógica del negocio");
  const pasos = [
    `soy lucas gomez, necesito un turno de invitado para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
    "dale, la primera que tengas me sirve",
    "si, confirmame ese horario porfa",
  ];
  let turno = null;
  let usados = 0;
  for (const texto of pasos) {
    const antes = (await salientes(conv)).length;
    await escribir(texto);
    usados++;
    const r = await esperarRespuesta(antes);
    console.log(`    · «${texto}»\n      → «${r.join(" / ").slice(0, 260)}»`);
    revisarFormato(r, `la respuesta a «${texto.slice(0, 30)}…»`);
    [turno] = await filas("select t.* from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1", [TEL]);
    if (turno) break;
  }
  assert(Boolean(turno), `quedó un turno en la base (con ${usados} mensaje/s)`);
  if (turno) {
    assert(turno.estado === "sin-confirmar" && turno.tipo === "invitado", `sin confirmar y de invitado (${turno.estado}, ${turno.tipo})`);
    const [franja] = await filas(
      `select f.desde, f.hasta from franjas_turnos f
        where f.dia_semana = extract(isodow from ($1::timestamptz at time zone $3))::int
          and ($1::timestamptz at time zone $3)::time >= f.desde and ($2::timestamptz at time zone $3)::time <= f.hasta`,
      [turno.inicio, turno.fin, TZ],
    );
    const [{ dia, hora, dias }] = await filas(
      `select to_char($1::timestamptz at time zone $2, 'YYYY-MM-DD') as dia, to_char($1::timestamptz at time zone $2, 'HH24:MI') as hora,
              (($1::timestamptz at time zone $2)::date - (now() at time zone $2)::date) as dias`,
      [turno.inicio, TZ],
    );
    assert(Boolean(franja), `cae adentro de una franja de turnos real (${dia} ${hora}, probador ${turno.probador})`);
    assert(dias >= 7 && dia < EN_2_MESES, `respeta la reserva de urgencia y la fecha del evento: a ${dias} días, antes del ${EN_2_MESES}`);
    const herramientas = (await filas(
      "select distinct detalle->>'herramienta' as h from eventos_agente where conversacion_id = $1 and tipo = 'herramienta'",
      [conv],
    )).map((r) => r.h);
    assert(
      herramientas.includes("buscar_horarios") && herramientas.includes("agendar_turno"),
      `pasó por buscar_horarios y agendar_turno (${herramientas.join(", ")})`,
    );
  } else {
    console.log("    errores:", await erroresDelTurno(conv));
  }

  console.log("\n[3] Responder desde el panel: el equipo toma la charla y escribe");
  await db.query("update conversaciones set estado = 'derivada' where id = $1", [conv]);
  const [{ r: enviado }] = await filas("select mostrador_enviar($1, $2) as r", [conv, "Hola Lucas, soy del local: te espero el martes."]);
  let salio = null;
  for (let i = 0; i < 20 && !salio; i++) {
    await esperar(2000);
    [salio] = await filas("select detalle from eventos_agente where conversacion_id = $1 and detalle->>'etapa' = 'mostrador'", [conv]);
  }
  assert(
    salio?.detalle.mensaje_id === enviado.mensaje_id && salio.detalle.simulado === true,
    "el worker desplegado lo tomó y lo mandó (simulado: el teléfono es ficticio), sin pasar por Lucía",
  );
  const [enCharla] = await filas("select contenido from mensajes where id = $1", [enviado.mensaje_id]);
  assert(enCharla?.contenido.startsWith("[mostrador] "), "queda en la charla con la marca [mostrador]: Lucía sabe que lo escribió una persona");
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await limpiar();
  const [{ n }] = await filas("select count(*)::int as n from clientes where telefono = $1", [TEL]);
  console.log(`\nRestos de la prueba en la base: ${n}`);
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ 2.1: Lucía contesta y agenda desde el worker desplegado.");
process.exit(fallas ? 1 : 0);
