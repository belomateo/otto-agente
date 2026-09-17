// scripts/probar-busqueda.js — control 3 del hito 1.6: cada fragmento se encuentra escribiendo
// como un cliente.
//
// Corre 3 consultas por cada uno de los 16 temas, escritas como escribe un cliente desde el
// celular (sin tildes, con errores, abreviaturas, sin repetir el título), con EXACTAMENTE la
// misma búsqueda que usa buscar_informacion (supabase/functions/_shared/conocimiento/
// busqueda.ts, cargado tal cual) y sin decirle la sección: tiene que encontrar el tema solo.
// Muestra consulta → tema esperado → tema obtenido. Para cerrar el hito: 48/48 en el primer
// resultado.
//
// También controla el contenido: los 16 temas tienen al menos un fragmento activo y ninguno
// tiene un precio (los precios salen del catálogo).
//
//   node scripts/probar-busqueda.js                   contra lo que hay en la base
//   node scripts/probar-busqueda.js --en-transaccion  aplica supabase/seeds/fragmentos.sql dos
//                                                     veces adentro de una transacción (la
//                                                     segunda tiene que escribir 0 filas),
//                                                     prueba y hace rollback
//   node scripts/probar-busqueda.js --solo <tema>     solo las consultas de ese tema

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const RAIZ = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(RAIZ, ".env") });
const pg = require("pg");

// Node carga los .ts compartidos sin compilar y avisa que el package.json no declara el tipo
// de módulo: ese aviso no dice nada de la prueba.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") console.warn(w.message);
});

const SEED = path.join(RAIZ, "supabase", "seeds", "fragmentos.sql");

// [tema esperado, consulta como la escribe un cliente]
const CONSULTAS = [
  ["que-incluye", "q incluye el alquiler"],
  ["que-incluye", "viene con camisa o es solo el traje"],
  ["que-incluye", "el precio es solo del saco y pantalon?"],
  ["como-funciona", "como es el tema, cuando lo retiro y cuando lo devuelvo"],
  ["como-funciona", "lo tengo q devolver al otro dia?"],
  ["como-funciona", "cuando se busca el traje, el mismo dia de la fiesta?"],
  ["reserva-y-garantia", "hay que dejar seña?"],
  ["reserva-y-garantia", "se abona todo junto o una parte"],
  ["reserva-y-garantia", "me piden la tarjeta de credito?"],
  ["ubicacion-horarios", "donde queda el local"],
  ["ubicacion-horarios", "en q calle estan"],
  ["ubicacion-horarios", "a q hora abren los sabados"],
  ["talles", "soy grandote tienen para mi?"],
  ["talles", "tienen para nenes de 6 años"],
  ["talles", "hasta q numero tienen?"],
  ["a-medida", "si me queda largo me lo arreglan?"],
  ["a-medida", "me lo achican si me queda grande"],
  ["a-medida", "le hacen el ruedo al pantalon?"],
  ["anticipacion", "cuanto antes tengo q reservar"],
  ["anticipacion", "es para el sabado q viene, llego?"],
  ["anticipacion", "es urgente, es para pasado mañana"],
  ["accesorios", "tienen sapatos?"],
  ["accesorios", "alquilan corbata tmb?"],
  ["accesorios", "necesito cinto y zapatos negros"],
  ["objecion-precio", "es re caro"],
  ["objecion-precio", "uff mucha plata"],
  ["objecion-precio", "me sale muy caro para alquilar"],
  ["objecion-turno", "lo voy a pensar"],
  ["objecion-turno", "lo hablo con mi novia y te aviso"],
  ["objecion-turno", "despues te confirmo"],
  ["objecion-competencia", "vi otro local mas barato"],
  ["objecion-competencia", "estoy mirando en otros lados"],
  ["objecion-competencia", "estoy comparando precios"],
  ["que-no-hacemos", "me lo mandan a casa?"],
  ["que-no-hacemos", "hacen envios a cordoba?"],
  ["que-no-hacemos", "hacen uniformes para mi empresa?"],
  ["descuentos", "me haces un descuentito?"],
  ["descuentos", "hay alguna promo?"],
  ["descuentos", "si alquilo dos me rebajan algo?"],
  ["novio", "me caso en diciembre"],
  ["novio", "soy el novio"],
  ["novio", "me voy a casar en el campo"],
  ["graduado", "egresados de quinto año"],
  ["graduado", "fiesta de egreso del secundario"],
  ["graduado", "es para mi hijo q termina el colegio"],
  ["invitado", "voy al casamiento de un amigo"],
  ["invitado", "tengo un cumple de 15 de mi sobrina"],
  ["invitado", "me invitaron a una boda"],
];

const PRECIO = /\$|\b\d{5,}\b|\b\d{1,3}\.\d{3}\b/;

(async () => {
  const cargar = (rel) => import(pathToFileURL(path.join(RAIZ, rel)).href);
  const { buscarFragmentos } = await cargar("supabase/functions/_shared/conocimiento/busqueda.ts");
  const { SECCIONES } = await cargar("supabase/functions/_shared/enums.ts");

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Falta SUPABASE_DB_URL en .env");
    process.exit(1);
  }
  const enTransaccion = process.argv.includes("--en-transaccion");
  const iSolo = process.argv.indexOf("--solo");
  const solo = iSolo > 0 ? process.argv[iSolo + 1] : null;

  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  const db = { consulta: async (sql, valores) => (await cliente.query(sql, valores)).rows };
  let fallas = 0;
  try {
    if (enTransaccion) {
      await cliente.query("begin");
      const sql = fs.readFileSync(SEED, "utf8").replace(/\r\n?/g, "\n");
      const r1 = await cliente.query(sql);
      const r2 = await cliente.query(sql);
      console.log(`seed adentro de una transacción: primera corrida ${r1.rowCount} filas, segunda ${r2.rowCount} (idempotente si es 0)`);
      if (r2.rowCount !== 0) fallas++;
    }

    const filas = (await cliente.query("select tema, titulo, texto from fragmentos where activo order by tema, titulo")).rows;
    const temas = new Set(filas.map((f) => f.tema));
    const sinFragmento = SECCIONES.filter((t) => !temas.has(t));
    const conPrecio = filas.filter((f) => PRECIO.test(f.texto) || PRECIO.test(f.titulo));
    console.log(`fragmentos activos: ${filas.length} · temas con fragmento: ${temas.size}/16`);
    if (sinFragmento.length) {
      console.log(`❌ temas sin fragmento: ${sinFragmento.join(", ")}`);
      fallas++;
    }
    if (conPrecio.length) {
      console.log(`❌ fragmentos con un precio (va en el catálogo): ${conPrecio.map((f) => f.titulo).join(", ")}`);
      fallas++;
    }
    // La confirmación de un turno (herramientas/confirmacion.ts) busca en como-funciona el
    // fragmento que habla del turno en el local: tiene que ser ese y no el paso a paso.
    const conf = await buscarFragmentos(db, { seccion: "como-funciona", consulta: "turno local acompañante tolerancia", limite: 1 });
    const deConfirmacion = conf.encontrados[0]?.texto ?? "";
    const confirmacionOk = /acompañante/.test(deConfirmacion) && /tolerancia/.test(deConfirmacion) && /España 764/.test(deConfirmacion);
    console.log(`${confirmacionOk ? "✅" : "❌"} la confirmación de un turno usa «${conf.encontrados[0]?.titulo ?? "nada"}»`);
    if (!confirmacionOk) fallas++;

    const consultas = CONSULTAS.filter(([t]) => !solo || t === solo);
    let aciertos = 0;
    console.log("\nconsulta → esperado → obtenido");
    for (const [esperado, consulta] of consultas) {
      const r = await buscarFragmentos(db, { seccion: null, consulta, limite: 3 });
      const primero = r.encontrados[0];
      const ok = primero?.tema === esperado;
      if (ok) aciertos++;
      const correcciones = Object.entries(r.corregidos).map(([de, a]) => `${de}→${a}`).join(" ");
      const detalle = ok ? "" : `   [${r.encontrados.map((e) => `${e.tema} ${e.puntaje}`).join(" · ") || "sin resultados"}]`;
      console.log(
        `${ok ? "✅" : "❌"} «${consulta}» → ${esperado} → ${primero ? `${primero.tema} (${primero.puntaje})` : "nada"}` +
          (correcciones ? `   corrige: ${correcciones}` : "") + detalle,
      );
    }
    console.log(`\n${aciertos}/${consultas.length} en el primer resultado.`);
    if (aciertos !== consultas.length) fallas++;
  } finally {
    if (enTransaccion) await cliente.query("rollback");
    await cliente.end();
  }
  process.exit(fallas ? 1 : 0);
})();
