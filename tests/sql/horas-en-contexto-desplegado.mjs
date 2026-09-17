// Control en vivo del hallazgo ALTO 2 de la auditoría (17/9), contra lo DESPLEGADO: traza.ts y
// horario_sin_herramienta.ts prometen que las horas de los turnos activos del cliente y las del
// horario de hoy —las que el contexto del turno YA le muestra al modelo (AGENTE.md § 3 paso 5)—
// quedan sembradas en traza.horasDevueltas, para que repetirlas no cuente como un horario
// inventado. Nadie las sembraba: el cliente preguntando por la hora de SU PROPIO turno hacía
// saltar horario_sin_herramienta dos veces y terminaba en barandilla_doble, mudo — el modo de
// falla más peligroso: el cliente no recibía NADA y en el panel no quedaba ni un error.
//  [1] Con un turno de verdad ya agendado (mismo camino que lucia-desplegada.mjs [2]), preguntar
//      "¿a qué hora era mi turno?" en un turno de charla NUEVO: Lucía tiene que contestar con la
//      hora, sin saltar ninguna barandilla ni derivar.
//  [2] "¿a qué hora abren hoy?", con un cliente sin ningún turno: la respuesta puede salir
//      directo del contexto (sin llamar a buscar_informacion) y antes eso también disparaba
//      horario_sin_herramienta.
// Mismo andamiaje que lucia-desplegada.mjs (registrar_mensaje_entrante + cola_trabajos), con
// teléfonos ficticios propios para no pisar esa corrida si andan al mismo tiempo.
// Uso: node tests/sql/horas-en-contexto-desplegado.mjs
import "dotenv/config";
import pg from "pg";

const TEL_TURNO = "5490000000097";
const TEL_HORARIO = "5490000000098";
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

const formato = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fechaEnArgentina = (dias) => formato.format(new Date(Date.now() + dias * 86_400_000));
const EN_2_MESES = fechaEnArgentina(60);

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const filas = async (sql, valores = []) => (await db.query(sql, valores)).rows;

async function limpiar(tel) {
  const [cli] = await filas("select id from clientes where telefono = $1", [tel]);
  if (!cli) return;
  const convs = (await filas("select id from conversaciones where cliente_id = $1", [cli.id])).map((r) => r.id);
  for (const tabla of ["consumo_llm", "eventos_agente", "derivaciones", "mensajes", "cola_trabajos"]) {
    await db.query(`delete from ${tabla} where conversacion_id = any($1::uuid[])`, [convs]);
  }
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
async function escribir(tel, texto) {
  numero++;
  const crudo = { from: tel, id: `wamid.ALTO2-${Date.now()}-${numero}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'texto', $3, now(), $4::jsonb)", [crudo.id, tel, texto, JSON.stringify(crudo)]);
}

async function charla(tel) {
  const [f] = await filas(
    "select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1",
    [tel],
  );
  return f?.id ?? null;
}

const salientes = async (conv) =>
  (await filas("select contenido from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at", [conv])).map((r) => r.contenido);

async function esperarRespuesta(tel, antes) {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    await esperar(3000);
    const conv = await charla(tel);
    if (!conv) continue;
    const [{ n }] = await filas(
      "select count(*)::int as n from cola_trabajos where conversacion_id = $1 and estado in ('pendiente', 'procesando')",
      [conv],
    );
    if (n === 0) return (await salientes(conv)).slice(antes);
  }
  throw new Error("el worker no terminó el turno a tiempo");
}

async function erroresDelTurno(conv, desde) {
  return (
    await filas("select detalle from eventos_agente where conversacion_id = $1 and tipo = 'error' and creado_at >= $2 order by creado_at", [conv, desde])
  ).map((r) => JSON.stringify(r.detalle).slice(0, 220));
}

async function saltosDeHorario(conv, desde) {
  return (
    await filas(
      `select detalle from eventos_agente
        where conversacion_id = $1 and tipo = 'error' and creado_at >= $2
          and (detalle->>'barandilla' = 'horario_sin_herramienta' or detalle->>'motivo' = 'barandilla_doble')`,
      [conv, desde],
    )
  ).map((r) => JSON.stringify(r.detalle));
}

try {
  await limpiar(TEL_TURNO); // restos de una corrida cortada
  await limpiar(TEL_HORARIO);

  console.log("\n[1] Cliente con un turno ya agendado pregunta por la hora de SU PROPIO turno");
  const pasos = [
    `soy lucas gomez, necesito un turno de invitado para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
    "dale, la primera que tengas me sirve",
    "si, confirmame ese horario porfa",
  ];
  let conv1 = null;
  for (const texto of pasos) {
    conv1 = await charla(TEL_TURNO);
    const antes = conv1 ? (await salientes(conv1)).length : 0;
    await escribir(TEL_TURNO, texto);
    const r = await esperarRespuesta(TEL_TURNO, antes);
    console.log(`    · «${texto}»\n      → «${r.join(" / ").slice(0, 220)}»`);
  }
  conv1 = await charla(TEL_TURNO);
  const [turno] = await filas("select t.* from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1", [TEL_TURNO]);
  assert(Boolean(turno), "quedó un turno de verdad en la base antes de preguntar por él");
  if (!turno) {
    console.log("    errores:", await erroresDelTurno(conv1, new Date(0)));
  } else {
    const [{ hora }] = await filas("select to_char($1::timestamptz at time zone $2, 'HH24:MI') as hora", [turno.inicio, TZ]);
    console.log(`    turno real a las ${hora} (turno_id ${turno.id})`);

    const antesDePreguntar = new Date();
    const antesDeMensajes = (await salientes(conv1)).length;
    await escribir(TEL_TURNO, "¿a qué hora era mi turno?");
    const r2 = await esperarRespuesta(TEL_TURNO, antesDeMensajes);
    console.log(`    · «¿a qué hora era mi turno?»\n      → «${r2.join(" / ").slice(0, 260)}»`);

    assert(r2.length > 0, "Lucía contestó de verdad (antes: mensajesAlCliente: [], el cliente se quedaba sin nada)");
    assert(r2.some((m) => m.includes(hora)), `la respuesta menciona la hora real del turno (${hora})`);
    const saltos = await saltosDeHorario(conv1, antesDePreguntar);
    assert(saltos.length === 0, `sin saltos de horario_sin_herramienta ni barandilla_doble (${saltos.length} encontrados)`);
    const [convFila] = await filas("select estado from conversaciones where id = $1", [conv1]);
    assert(convFila?.estado !== "derivada", `la charla sigue activa, no derivada (estado: ${convFila?.estado})`);
    const [{ n: derivs }] = await filas("select count(*)::int as n from derivaciones where conversacion_id = $1 and creado_at >= $2", [conv1, antesDePreguntar]);
    assert(derivs === 0, `no quedó ninguna derivación nueva (${derivs})`);
  }

  console.log("\n[2] Cliente sin ningún turno pregunta el horario de hoy");
  const [horarioHoy] = await filas(
    // dia_semana: 0 = domingo, convención de Postgres extract(dow) (0003_negocio.sql) — la misma
    // que usa huecos.ts (diaDeLaSemana con getUTCDay()), no isodow.
    `select h.hora_apertura, h.hora_cierre from horarios h
      where h.dia_semana = extract(dow from (now() at time zone $1))::int and h.activo`,
    [TZ],
  );
  console.log(`    horario de hoy en la base: ${horarioHoy ? `${horarioHoy.hora_apertura}–${horarioHoy.hora_cierre}` : "(sin franja hoy)"}`);
  const antesDeHorario = new Date();
  await escribir(TEL_HORARIO, "hola, ¿a qué hora abren hoy?");
  const r3 = await esperarRespuesta(TEL_HORARIO, 0);
  console.log(`    · «¿a qué hora abren hoy?»\n      → «${r3.join(" / ").slice(0, 220)}»`);
  assert(r3.length > 0, "Lucía contestó de verdad");
  const conv2 = await charla(TEL_HORARIO);
  const saltos2 = await saltosDeHorario(conv2, antesDeHorario);
  assert(saltos2.length === 0, `sin saltos de horario_sin_herramienta ni barandilla_doble (${saltos2.length} encontrados)`);
  if (!r3.length || saltos2.length) console.log("    errores:", await erroresDelTurno(conv2, antesDeHorario));
} catch (err) {
  console.error("\n💥 Error inesperado:", err);
  fallas++;
} finally {
  await limpiar(TEL_TURNO);
  await limpiar(TEL_HORARIO);
  const [{ n }] = await filas("select count(*)::int as n from clientes where telefono in ($1, $2)", [TEL_TURNO, TEL_HORARIO]);
  console.log(`\nRestos de la prueba en la base: ${n}`);
  await db.end();
}

console.log(fallas ? `\n❌ ${fallas} control(es) no pasaron.` : "\n✅ ALTO 2: horasDevueltas sembrada de verdad, sin saltos ni charlas mudas.");
process.exit(fallas ? 1 : 0);
