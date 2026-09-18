// Control contra lo DESPLEGADO: cancelar el TURNO y cancelar el ALQUILER no son lo mismo.
//
// Lucía tiene cancelar_turno, y en el prompt figura sin aclarar qué cancela. Un cliente que ya
// pagó y escribe "quiero cancelar" está hablando de PLATA: hay un contrato con penalidad (30%
// dentro de los 5 días hábiles de firmarlo, 70% hasta 10 días antes del uso, nada después) y
// Lucía no tiene herramienta para eso. El riesgo concreto: que le cancele el turno, le diga
// "listo" y el cliente se quede creyendo que canceló el alquiler, con la plata sin resolver.
//
//  [1] "cancelame el turno" → cancelar_turno es lo correcto: el turno queda cancelado. Esto no
//      tiene que romperse por arreglar lo otro.
//  [2] "ya pagué el alquiler, quiero cancelarlo" → no puede darlo por hecho sola: o explica la
//      política, o deriva. Y si menciona un porcentaje, tiene que ser uno de los reales.
//
// Borra todo lo que crea; gasta unos centavos de OpenAI.
// Uso: node tests/sql/cancelacion-desplegada.mjs
import "dotenv/config";
import pg from "pg";

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
const EN_2_MESES = formato.format(new Date(Date.now() + 60 * 86_400_000));

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const filas = async (sql, valores = []) => (await db.query(sql, valores)).rows;

async function limpiar(tel) {
  const [cli] = await filas("select id from clientes where telefono = $1", [tel]);
  if (!cli) return;
  const convs = (await filas("select id from conversaciones where cliente_id = $1", [cli.id])).map((r) => r.id);
  for (const tabla of ["consumo_llm", "eventos_agente", "derivaciones", "mensajes", "cola_trabajos"]) {
    await db.query("delete from " + tabla + " where conversacion_id = any($1::uuid[])", [convs]);
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
  const crudo = {
    from: tel,
    id: "wamid.CANCEL-" + Date.now() + "-" + numero,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: texto },
  };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'texto', $3, now(), $4::jsonb)", [
    crudo.id,
    tel,
    texto,
    JSON.stringify(crudo),
  ]);
}

const charla = async (tel) =>
  (
    await filas(
      "select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1",
      [tel],
    )
  )[0]?.id ?? null;

const salientes = async (conv) =>
  (
    await filas("select contenido from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at", [conv])
  ).map((r) => r.contenido);

async function esperarRespuesta(tel, antes) {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    await esperar(3000);
    const conv = await charla(tel);
    if (!conv) continue;
    const [{ n }] = await filas(
      "select count(*)::int as n from cola_trabajos where conversacion_id = $1 and estado in ('pendiente','procesando')",
      [conv],
    );
    if (n === 0) return (await salientes(conv)).slice(antes);
  }
  throw new Error("el worker no terminó el turno a tiempo");
}

async function decir(tel, texto) {
  const conv = await charla(tel);
  const antes = conv ? (await salientes(conv)).length : 0;
  await escribir(tel, texto);
  const r = await esperarRespuesta(tel, antes);
  console.log("    · «" + texto + "»\n      → «" + r.join(" / ").slice(0, 300) + "»");
  return r;
}

const turnoDe = async (tel) =>
  (
    await filas(
      "select t.id, t.estado from turnos t join clientes c on c.id = t.cliente_id where c.telefono = $1 order by t.creado_at desc limit 1",
      [tel],
    )
  )[0] ?? null;

const derivacionesDe = async (tel) =>
  await filas(
    "select d.motivo from derivaciones d join conversaciones c on c.id = d.conversacion_id join clientes cl on cl.id = c.cliente_id where cl.telefono = $1",
    [tel],
  );

async function reservar(tel, nombre) {
  const pasos = [
    "hola, soy " + nombre + ", necesito un traje de invitado para un casamiento el " + EN_2_MESES,
    "dale, el primer horario que tengas me sirve",
    "si, confirmame ese",
  ];
  for (const texto of pasos) {
    await decir(tel, texto);
    if (await turnoDe(tel)) return true;
  }
  return Boolean(await turnoDe(tel));
}

try {
  const TEL_1 = "5490000000094";
  const TEL_2 = "5490000000095";
  await limpiar(TEL_1);
  await limpiar(TEL_2);

  console.log("\n[1] Cancelar el TURNO: es lo que cancelar_turno tiene que hacer");
  {
    assert(await reservar(TEL_1, "martin perez"), "quedó un turno agendado antes de pedir cancelarlo");
    await decir(TEL_1, "no voy a poder ir, cancelame el turno por favor");
    const t = await turnoDe(TEL_1);
    assert(t?.estado === "cancelado", "el turno quedó cancelado (estado: " + t?.estado + ")");
  }

  console.log("\n[2] Cancelar el ALQUILER ya pagado: hay plata de por medio, no lo cierra sola");
  {
    assert(await reservar(TEL_2, "diego sosa"), "quedó un turno agendado antes de pedir cancelar el alquiler");
    const r = await decir(
      TEL_2,
      "ya pague el alquiler completo y me quiero arrepentir, quiero cancelarlo y que me devuelvan la plata",
    );
    const dicho = r.join(" ").toLowerCase();
    const t = await turnoDe(TEL_2);
    const derivs = await derivacionesDe(TEL_2);

    // Callarse acá es correcto: el prompt manda dejar la despedida vacía ante un reclamo o un
    // descuento, para que siga una persona. Lo que no puede pasar es quedarse callada Y sin
    // derivar — ahí el cliente no tiene ni respuesta ni nadie del otro lado.
    assert(
      r.length > 0 || derivs.length > 0,
      "no deja al cliente sin nada y sin nadie (contestó: " + (r.length > 0) + ", derivó: " + (derivs.length > 0) + ")",
    );

    const hablaDePolitica = /penalidad|30\s*%|70\s*%|no hay devoluci|sin devoluci|contrato/.test(dicho);
    const derivo = derivs.length > 0;
    assert(
      hablaDePolitica || derivo,
      "explica la política o deriva — política: " + hablaDePolitica + ", derivaciones: " + derivs.length,
    );

    const porcentajes = [...dicho.matchAll(/(\d{1,3})\s*%/g)].map((m) => m[1]);
    assert(
      porcentajes.every((p) => p === "30" || p === "70" || p === "100"),
      "no inventa porcentajes (dijo: " + (porcentajes.length ? porcentajes.join(", ") : "ninguno") + ")",
    );

    const daPorHecho =
      /(cancel[ée]|cancelado|dado de baja)[^.]{0,40}(alquiler|contrato)|te (devolvemos|devuelven) (todo|la plata)/.test(dicho);
    assert(
      !(daPorHecho && !derivo),
      "no da por cerrada la cancelación del alquiler sin derivar (turno: " + t?.estado + ", derivó: " + derivo + ")",
    );

    const detalle = derivs.length ? " (" + derivs.map((d) => d.motivo).join("; ").slice(0, 120) + ")" : "";
    console.log("    · estado real → turno: " + (t?.estado ?? "ninguno") + " · derivaciones: " + derivs.length + detalle);
  }

  await limpiar(TEL_1);
  await limpiar(TEL_2);
  const [{ n }] = await filas("select count(*)::int as n from clientes where telefono in ($1,$2)", [TEL_1, TEL_2]);
  console.log("\nRestos de la prueba en la base: " + n);
} finally {
  await db.end();
}

console.log(
  fallas === 0
    ? "\n✅ Cancelar el turno y cancelar el alquiler se tratan distinto.\n"
    : "\n❌ " + fallas + " control(es) no pasaron.\n",
);
process.exit(fallas === 0 ? 0 : 1);
