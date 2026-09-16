// Cierre de Fase 2: los 19 guiones de scripts/guiones-agente.cjs (AGENTE.md § 13) corridos de
// punta a punta contra el WORKER DESPLEGADO, no contra el emulador. Mismas conversaciones y
// mismos chequeos que scripts/probar-turno.js: es el mismo módulo de guiones, para que las dos
// corridas prueben exactamente lo mismo (ver el comentario de guiones-agente.cjs).
//
// Transporte: mensajes por registrar_mensaje_entrante, como los deja el webhook real; se espera
// a que cola_trabajos quede vacía (o a que la charla quede derivada) antes de mandar el
// siguiente; teléfonos ficticios 5490000000NNN, SIN "+" (formato de Meta — con "+" el worker no
// los toma como ficticios y probaría mandar algo por Meta de verdad). Cada guion se corre de a
// uno, con su propia conexión, y se limpia antes y después.
//
// OJO: esto prueba lo que está DESPLEGADO en la función `worker`, no el código de este worktree.
// Si el worker no se redesplegó con los últimos commits de agente, esto lo va a mostrar.
// OJO 2: gasta OpenAI real (hasta 4 turnos por guion, ~3 llamadas al LLM por turno: son 19
// guiones, así que puede ser una corrida de varios minutos y unos cuantos centavos.
//
// Uso:
//   node tests/sql/guiones-desplegado.mjs                 corre los 19, de a uno
//   node tests/sql/guiones-desplegado.mjs <guion>          corre uno o más, por nombre
//   node tests/sql/guiones-desplegado.mjs --listar         lista los guiones
import "dotenv/config";
import pg from "pg";
import guionesAgente from "../../scripts/guiones-agente.cjs";

const { crearGuiones, sembrarCatalogo, borrarCatalogo, limpiarTelefono } = guionesAgente;

const ESPERA_MAX_MS = 150_000;

if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

const GUIONES = crearGuiones();
// Mismo orden en que quedaron declarados en guiones-agente.cjs. 5490000000NNN, sin "+": no pisa
// los teléfonos de otros guiones sueltos de tests/sql (079, 091 a 093).
const NOMBRES_EN_ORDEN = Object.keys(GUIONES);
const telefonoDe = (nombre) => `5490000000${String(NOMBRES_EN_ORDEN.indexOf(nombre) + 1).padStart(3, "0")}`;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

let numeroDeMensaje = 0;
async function escribir(db, telefono, texto) {
  numeroDeMensaje++;
  const crudo = { from: telefono, id: `wamid.GUION15-${Date.now()}-${numeroDeMensaje}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } };
  await db.query("select registrar_mensaje_entrante($1, $2, null, 'texto', $3, now(), $4::jsonb)", [crudo.id, telefono, texto, JSON.stringify(crudo)]);
}

async function conversacionDe(db, telefono) {
  return (await db.query(
    "select c.id, c.estado from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1",
    [telefono],
  )).rows[0] ?? null;
}

async function salientes(db, conv) {
  return (await db.query("select contenido from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at", [conv])).rows.map(
    (r) => r.contenido,
  );
}

// Espera a que el worker termine (cola vacía) y devuelve lo que contestó desde `antes`, más si
// la charla quedó derivada (para no seguir mandando mensajes del guion, como hace el emulador).
async function esperarRespuesta(db, telefono, antes) {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (Date.now() < limite) {
    await esperar(3000);
    const conv = await conversacionDe(db, telefono);
    if (!conv) continue;
    const [{ n }] = (await db.query(
      "select count(*)::int as n from cola_trabajos where conversacion_id = $1 and estado in ('pendiente', 'procesando')",
      [conv.id],
    )).rows;
    if (n === 0) return { mensajes: (await salientes(db, conv.id)).slice(antes), derivo: conv.estado === "derivada", convId: conv.id };
  }
  throw new Error(`el worker no terminó a tiempo (${telefono})`);
}

async function motivoDeLaDerivacion(db, convId) {
  const [d] = (await db.query("select motivo from derivaciones where conversacion_id = $1 order by creado_at desc limit 1", [convId])).rows;
  return d?.motivo ?? null;
}

async function conConexionPropia(fn) {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  let seRompio = null;
  db.on("error", (err) => { seRompio = err; });
  await db.connect();
  try {
    const resultado = await fn(db);
    if (seRompio) throw seRompio;
    return resultado;
  } finally {
    await db.end().catch(() => {});
  }
}

async function correrUno(nombre) {
  const g = GUIONES[nombre];
  const telefono = telefonoDe(nombre);
  const resultado = { nombre, ok: true, detalles: [], error: null, respuestas: [] };
  try {
    await conConexionPropia(async (db) => {
      let idsCatalogo = [];
      try {
        await limpiarTelefono(db, telefono); // restos de una corrida cortada
        if (g.necesitaCatalogo) idsCatalogo = await sembrarCatalogo(db);

        let convId = null;
        let derivo = false;
        for (const mensaje of g.mensajes) {
          const conv = await conversacionDe(db, telefono);
          const antes = conv ? (await salientes(db, conv.id)).length : 0;
          await escribir(db, telefono, mensaje);
          const r = await esperarRespuesta(db, telefono, antes);
          resultado.respuestas.push(r.mensajes);
          convId = r.convId;
          derivo = r.derivo;
          if (derivo) break; // si ya derivó, no tiene sentido seguir mandando mensajes del guion
        }

        const resultadoFinal = { motivo_derivacion: convId ? await motivoDeLaDerivacion(db, convId) : null };
        for (const [ok, detalle] of await g.verificar(db, telefono, resultado.respuestas, resultadoFinal)) {
          resultado.detalles.push({ ok: !!ok, detalle });
          if (!ok) resultado.ok = false;
        }
      } finally {
        if (idsCatalogo.length) await borrarCatalogo(db, idsCatalogo).catch(() => {});
        await limpiarTelefono(db, telefono).catch(() => {});
      }
    });
  } catch (e) {
    resultado.ok = false;
    resultado.error = String(e?.message ?? e);
  }
  return resultado;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--listar")) {
    console.log(NOMBRES_EN_ORDEN.join("\n"));
    return;
  }
  const pedidos = args.filter((a) => !a.startsWith("--"));
  const nombres = pedidos.length ? pedidos : NOMBRES_EN_ORDEN;
  for (const n of nombres) {
    if (!GUIONES[n]) {
      console.error(`No existe el guion "${n}". Guiones: ${NOMBRES_EN_ORDEN.join(", ")}`);
      process.exitCode = 1;
      return;
    }
  }

  const resultados = [];
  for (const nombre of nombres) {
    process.stdout.write(`▶ ${nombre} (${telefonoDe(nombre)}) ... `);
    const r = await correrUno(nombre);
    resultados.push(r);
    console.log(r.ok ? "✅" : "❌");
    if (!r.ok) {
      if (r.error) console.log(`   💥 ${r.error}`);
      for (const d of r.detalles) if (!d.ok) console.log(`   ❌ ${d.detalle}`);
    }
    for (const [i, msj] of r.respuestas.entries()) {
      console.log(`   [${i + 1}] ${JSON.stringify(GUIONES[nombre].mensajes[i])} → ${msj.join(" | ") || "(sin mensaje)"}`);
    }
  }

  const ok = resultados.filter((r) => r.ok).length;
  console.log(`\n${ok}/${resultados.length} guiones pasaron contra el worker desplegado.`);
  if (ok !== resultados.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("💥 Error inesperado:", e);
  process.exit(1);
});
