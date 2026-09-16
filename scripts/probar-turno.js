// scripts/probar-turno.js — los 14 guiones de AGENTE.md § 13 (más evento-manana-deriva, la
// decisión #8 del 14/9) contra el emulador `probar-agente` (H1.7).
//
// Cada guion es un cliente de prueba con su propio teléfono ficticio (+549341000090N), para que
// dos guiones nunca se pisen aunque queden restos de una corrida anterior. Se corren de a uno
// (CLAUDE.md § 7). Cada uno se verifica contra la BASE, no contra lo que dijo Lucía (principio
// 9): si dijo que agendó, hay fila en turnos; si derivó, hay fila en derivaciones con un motivo
// del enum; si dio un precio, hay consultar_catalogo en eventos_agente de ese turno.
//
// El catálogo real todavía está vacío (supuesto #15: lo carga el dueño). Los guiones que
// necesitan un precio siembran modelos de catálogo TEMPORALES antes de correr y los borran al
// terminar — el mismo patrón que tests/herramientas/_arnes.ts usa para pruebas de herramientas
// sueltas; acá se extiende a una charla completa porque no se puede envolver una conversación de
// varios pedidos HTTP en una sola transacción con rollback.
//
// Uso:
//   node scripts/probar-turno.js                 corre los 15 guiones, de a uno
//   node scripts/probar-turno.js <guion>          corre uno solo
//   node scripts/probar-turno.js --listar         lista los guiones
//
// Necesita el emulador corriendo (ver supabase/functions/probar-agente/index.ts) y
// OPENAI_API_KEY real en el proceso (si el entorno ya tiene una OPENAI_API_KEY de otra cosa —
// pasó en esta máquina con un valor para Ollama — hay que limpiarla antes: `env -u
// OPENAI_API_KEY node scripts/probar-turno.js`).

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pg = require("pg");

const URL_EMULADOR = process.env.PROBAR_AGENTE_URL || "http://localhost:8811";
const TZ = "America/Argentina/Cordoba";

// "Hoy" para estas fechas tiene que ser el "hoy" de Argentina (NEGOCIO_TZ, _shared/tiempo.ts),
// no el de UTC: pasadas las 21 hs en Rosario, UTC ya cruzó a mañana, y con nueva Date() +
// toISOString() (que es UTC) esta prueba y el turno real quedan un día desfasados — pasó de
// verdad corriendo esto a la noche. Sumar milisegundos de a día entero y recién ahí formatear en
// la zona de Argentina da lo mismo que fechaLocal()+sumarDias() de tiempo.ts porque Argentina no
// tiene horario de verano: un día siempre son 86.400.000 ms, sin importar la zona.
const formateadorArgentina = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
function fechaEnArgentina(diasDesdeAhora) {
  const partes = formateadorArgentina.formatToParts(new Date(Date.now() + diasDesdeAhora * 86_400_000));
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return { ymd: `${obj.year}-${obj.month}-${obj.day}`, esDomingo: obj.weekday === "Sun" };
}
function hoyMasDias(dias) {
  return fechaEnArgentina(dias).ymd;
}
// EN_4_DIAS y EN_2_MESES se usan como datos DENTRO de un mensaje: quedan fijos apenas arranca la
// corrida y no importa si de ahí a que se verifiquen pasan minutos. manana() en cambio se compara
// contra lo que guardó el turno real, calculado con la hora en que ese mensaje se procesó: si
// esta corrida completa tarda tanto que cruza la medianoche (de Argentina), una constante fija
// quedaría vieja. Por eso se llama recién al verificar, no al arrancar.
const EN_4_DIAS = hoyMasDias(4);
const EN_2_MESES = hoyMasDias(60);
const manana = () => hoyMasDias(1);

// Un domingo el local no atiende (franjas_turnos no tiene fila ese día): si una fecha pensada
// como "otro día para venir al local" cae domingo, el guion termina probando "pediste un día sin
// servicio" en vez de "reprogramar a un día válido". Nunca domingo.
function diaHabilFuturo(dias) {
  let d = dias;
  while (fechaEnArgentina(d).esDomingo) d++;
  return fechaEnArgentina(d).ymd;
}

// ── infraestructura mínima: mandar un mensaje, leer la base, limpiar ──────────────────────

async function mandar(telefono, mensaje) {
  const r = await fetch(URL_EMULADOR, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ telefono, mensaje }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`emulador respondió ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function limpiarTelefono(sql, telefono) {
  const cli = (await sql.query("select id from clientes where telefono = $1", [telefono])).rows[0];
  if (!cli) return;
  const convs = (await sql.query("select id from conversaciones where cliente_id = $1", [cli.id])).rows.map((r) => r.id);
  for (const cid of convs) {
    await sql.query("delete from consumo_llm where conversacion_id = $1", [cid]);
    await sql.query("delete from eventos_agente where conversacion_id = $1", [cid]);
    await sql.query("delete from derivaciones where conversacion_id = $1", [cid]);
    await sql.query("delete from mensajes where conversacion_id = $1", [cid]);
  }
  await sql.query("delete from turnos where cliente_id = $1", [cli.id]); // on delete restrict: hay que borrarlos antes que al cliente
  await sql.query("delete from notas where cliente_id = $1", [cli.id]);
  await sql.query("delete from conversaciones where cliente_id = $1", [cli.id]);
  await sql.query("delete from clientes where id = $1", [cli.id]);
}

async function sembrarCatalogo(sql) {
  await sql.query("update catalogo_alquiler set activo = false where activo"); // no se borra lo real si hubiera; se desactiva mientras dura el guion
  const ids = [];
  for (const [modelo, precio, colores, talles] of [
    ["Clásico azul marino", 165000, ["Azul marino", "Negro"], ["44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64", "66", "68"]],
    ["Slim gris oxford", 195000, ["Gris"], ["44", "46", "48", "50", "52"]],
  ]) {
    const r = await sql.query(
      "insert into catalogo_alquiler (modelo, precio_base, colores, talles, fotos) values ($1, $2, $3::jsonb, $4, $5) returning id",
      [modelo, precio, JSON.stringify(colores.map((nombre) => ({ nombre, hex: "#000000" }))), talles, ["foto-de-prueba.jpg"]],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

async function borrarCatalogo(sql, ids) {
  for (const id of ids) await sql.query("delete from catalogo_alquiler where id = $1", [id]);
  await sql.query("update catalogo_alquiler set activo = true where not activo");
}

async function conversacionDe(sql, telefono) {
  return (await sql.query(
    `select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1`,
    [telefono],
  )).rows[0]?.id ?? null;
}

async function fila(sql, texto, valores = []) {
  return (await sql.query(texto, valores)).rows;
}

// ── los 15 guiones ─────────────────────────────────────────────────────────────────────────
// Cada uno: telefono fijo, si necesita catálogo (needsCatalogo), los mensajes tal como los
// escribiría un cliente (sin tildes, con errores, a veces en ráfaga: varios strings seguidos se
// mandan sin esperar respuesta, como escribir varios WhatsApp uno atrás del otro), y verificar,
// que corre después de mandar todos los mensajes y devuelve {ok, detalles[]}.

const GUIONES = {
  "novio-noche": {
    telefono: "+5493410001001",
    mensajes: ["hola", "me caso en octubre y quiero ver trajes", "es de noche, en un salon"],
    async verificar(sql, telefono, respuestas) {
      const d = [];
      const todo = respuestas.flat().join(" ").toLowerCase();
      d.push([/felicit/.test(todo), "en algún momento la dice felicitaciones (guion de novio)"]);
      const cli = (await fila(sql, "select rol, evento, dia_o_noche from clientes where telefono=$1", [telefono]))[0];
      d.push([cli?.evento === "casamiento", `evento quedó casamiento (fue: ${cli?.evento})`]);
      d.push([cli?.rol === "novio", `rol quedó novio (fue: ${cli?.rol})`]);
      d.push([cli?.dia_o_noche === "noche", `dia_o_noche quedó noche (fue: ${cli?.dia_o_noche})`]);
      return d;
    },
  },

  "invitado-casamiento": {
    telefono: "+5493410001002",
    mensajes: ["hola buenas", "me invitaron a un casamiento el mes que viene y no se q ponerme", "es de dia"],
    async verificar(sql, telefono) {
      const cli = (await fila(sql, "select rol, evento, dia_o_noche from clientes where telefono=$1", [telefono]))[0];
      return [
        [cli?.evento === "casamiento", `evento quedó casamiento (fue: ${cli?.evento})`],
        [cli?.rol === "invitado" || cli?.rol === null, `rol es invitado o no se aventuró (fue: ${cli?.rol})`],
      ];
    },
  },

  "graduado-desde-otra-ciudad": {
    telefono: "+5493410001003",
    mensajes: ["hola, estuve mirando la pagina", "mi hijo se recibe del secundario en noviembre y necesito un ambo", "somos de roldan, no de rosario"],
    async verificar(sql, telefono, respuestas) {
      const todo = respuestas.flat().join(" ").toLowerCase();
      const cli = (await fila(sql, "select evento, ciudad from clientes where telefono=$1", [telefono]))[0];
      return [
        [cli?.evento === "graduacion", `evento quedó graduacion (fue: ${cli?.evento})`],
        [cli?.ciudad !== null, `guardó la ciudad (fue: ${cli?.ciudad})`],
        [!/envia|mandamos a roldan/.test(todo), "no ofrece enviar el traje a otra ciudad (regla 10)"],
      ];
    },
  },

  "solo-precio": {
    telefono: "+5493410001004",
    necesitaCatalogo: true,
    mensajes: ["cuanto sale el alquiler de un traje"],
    async verificar(sql, telefono, respuestas) {
      const todo = respuestas.flat().join(" ");
      const convId = await conversacionDe(sql, telefono);
      const usoTool = (await fila(sql, "select 1 from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='consultar_catalogo' and (detalle->>'ok')::boolean", [convId])).length > 0;
      return [
        [usoTool, "hay consultar_catalogo en la bitácora de este turno"],
        [/\$\s?1[69]5\.?000|\$\s?165000|\$\s?195000/.test(todo.replace(/\s/g, "")) || /\$/.test(todo), "el precio que dice viene de la herramienta (aparece un $ en la respuesta)"],
        [/sastrer|tintorer/i.test(todo), "menciona sastrería/tintorería junto con el precio"],
        [/\?/.test(todo), "no se queda solo en el precio: suma una pregunta (regla de oro)"],
      ];
    },
  },

  "urgente-misma-semana": {
    telefono: "+5493410001005",
    mensajes: [`hola, necesito un traje urgente, el evento es el ${EN_4_DIAS}`, "es un cumpleaños de 15 de mi sobrina"],
    async verificar(sql, telefono, respuestas) {
      const todo = respuestas.flat().join(" ").toLowerCase();
      return [
        [!/no (se puede|hay lugar|podemos)/.test(todo), "no dice que no se puede por lo urgente"],
        [!/no tenemos lugar|sin lugar/.test(todo), "no dice que no hay lugar sin antes buscar"],
      ];
    },
  },

  "pregunta-horarios": {
    telefono: "+5493410001006",
    mensajes: ["q horario tienen"],
    async verificar(sql, telefono, respuestas) {
      const todo = respuestas.flat().join(" ");
      const convId = await conversacionDe(sql, telefono);
      const usoInfo = (await fila(sql, "select 1 from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='buscar_informacion' and (detalle->>'ok')::boolean", [convId])).length > 0;
      return [
        [usoInfo, "llamó a buscar_informacion (no dice el horario de memoria)"],
        [/lunes|sabado/i.test(todo), "el horario que dice menciona los días"],
        [/\?/.test(todo), "suma una pregunta (qué día vendría), no se queda solo en el horario"],
      ];
    },
  },

  accesorios: {
    telefono: "+5493410001007",
    mensajes: ["hola, alquilan zapatos y cinturon tambien o solo el traje"],
    async verificar(sql, telefono) {
      const convId = await conversacionDe(sql, telefono);
      const usoTool = (await fila(sql, "select 1 from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='consultar_accesorios' and (detalle->>'ok')::boolean", [convId])).length > 0;
      return [[usoTool, "llamó a consultar_accesorios antes de contestar sobre zapatos/cinturón"]];
    },
  },

  "es-caro": {
    telefono: "+5493410001008",
    necesitaCatalogo: true,
    mensajes: ["hola cuanto sale un traje para casamiento", "uy que caro, en otro lado alquilan mas barato"],
    async verificar(sql, telefono, respuestas, resultadoFinal) {
      const ultima = (respuestas[respuestas.length - 1] || []).join(" ").toLowerCase();
      return [
        [resultadoFinal?.motivo_derivacion !== "barandilla_doble", "no terminó en barandilla_doble (no_a_secas no falló dos veces)"],
        [/medida|sastrer|tintorer|calidad|servicio/.test(ultima), "responde apoyándose en el valor (a medida, sastrería, calidad), no solo bajando el precio"],
      ];
    },
  },

  "lo-voy-a-pensar": {
    telefono: "+5493410001009",
    mensajes: ["hola, info de alquiler de trajes para una boda", "dale, lo voy a pensar y despues te aviso"],
    async verificar(sql, telefono, respuestas) {
      // "Cuando lo confirmes, buscamos un turno" (futuro, sin pregunta) es aceptar el freno sin
      // culpa; lo que no puede pasar es que vuelva a preguntar algo en el mismo mensaje, porque
      // eso sí es la insistencia que la regla prohíbe.
      const ultima = (respuestas[respuestas.length - 1] || []).join(" ").toLowerCase();
      return [[!/\?/.test(ultima), "no insiste con otra pregunta después de que el cliente frenó"]];
    },
  },

  "reclamo-deriva": {
    telefono: "+5493410001010",
    mensajes: ["hola, tengo un reclamo, el traje que alquile la semana pasada vino manchado"],
    async verificar(sql, telefono, respuestas) {
      const convId = await conversacionDe(sql, telefono);
      const der = (await fila(sql, "select motivo, estado from derivaciones where conversacion_id=$1", [convId]))[0];
      const conv = (await fila(sql, "select estado from conversaciones where id=$1", [convId]))[0];
      return [
        [!!der, "hay una fila en derivaciones"],
        [der?.motivo === "reclamo" || der?.motivo === "prenda_danada", `motivo es reclamo o prenda_danada (fue: ${der?.motivo})`],
        [conv?.estado === "derivada", "la conversación quedó derivada"],
        [respuestas.flat().length === 0, "no le mandó ningún mensaje propio (reclamo va sin despedida armada)"],
      ];
    },
  },

  "corporativo-deriva": {
    telefono: "+5493410001011",
    mensajes: ["hola, necesito cotizar uniformes corporativos para mi empresa"],
    async verificar(sql, telefono) {
      const convId = await conversacionDe(sql, telefono);
      const der = (await fila(sql, "select motivo, estado from derivaciones where conversacion_id=$1", [convId]))[0];
      return [
        [!!der, "hay una fila en derivaciones"],
        [der?.motivo === "corporativo", `motivo es corporativo (fue: ${der?.motivo})`],
      ];
    },
  },

  "fuera-de-horario-agenda-igual": {
    telefono: "+5493410001012",
    necesitaCatalogo: true,
    // El emulador usa la hora real del server; este guion no fuerza que "ahora" sea de
    // madrugada (correrTurno no recibe una hora de prueba en el emulador), así que lo que se
    // verifica es lo que sí es siempre cierto pase la hora que pase: que cualquier horario que
    // ofrezca esté dentro de una franja de turnos real, nunca inventado.
    mensajes: [
      "hola, quiero reservar un turno para probarme un traje",
      "es para un cumpleaños de 15 en dos meses, " + EN_2_MESES,
      "soy martina perez",
      "dale, la primera que me ofrezcas",
    ],
    async verificar(sql, telefono) {
      const convId = await conversacionDe(sql, telefono);
      const huecos = (await fila(
        sql,
        "select detalle->'argumentos' as args from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='buscar_horarios'",
        [convId],
      ));
      return [[huecos.length > 0, "en algún momento llamó a buscar_horarios (no inventa un horario)"]];
    },
  },

  reprograma: {
    telefono: "+5493410001013",
    necesitaCatalogo: true,
    // Todo lo obligatorio en el primer mensaje (nombre, evento, fecha, tipo) para no depender
    // de en qué orden pregunta cada cosa; y en el pedido de cambio, un día concreto en vez de
    // "la segunda opción", para no depender de que haya enumerado horarios antes tal cual.
    mensajes: [
      `hola soy lucas gomez, necesito un turno de invitado para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
      "dale, la primera que tengas me sirve",
      // Tiene que ser antes de la fecha del evento (EN_2_MESES = 13/11): si no, agendar_turno
      // la rechaza con turno_despues_del_evento, y con razón.
      `en realidad ese dia no puedo, ¿tenes algo para el ${diaHabilFuturo(40)}?`,
      "dale, la mas temprano de esas dos",
    ],
    async verificar(sql, telefono) {
      const cli = (await fila(sql, "select id from clientes where telefono=$1", [telefono]))[0];
      const turnos = await fila(sql, "select estado, version from turnos where cliente_id=$1 order by creado_at", [cli.id]);
      return [
        [turnos.length === 1, `queda exactamente 1 turno, no uno nuevo encima del viejo (hay ${turnos.length})`],
        [turnos[0]?.version > 1, `el turno único tiene más de una versión, o sea que se movió (v${turnos[0]?.version})`],
        [turnos[0]?.estado === "sin-confirmar", `el turno movido vuelve a sin-confirmar (fue: ${turnos[0]?.estado})`],
      ];
    },
  },

  "talle-grande": {
    telefono: "+5493410001014",
    necesitaCatalogo: true,
    mensajes: ["hola soy bastante grande, uso talle 62, tienen para mi?"],
    async verificar(sql, telefono, respuestas) {
      const todo = respuestas.flat().join(" ").toLowerCase();
      return [
        [!/^no\b/.test(todo.trim()), "no dice que no a secas"],
        [/62|68|medida|confeccion/.test(todo), "menciona el talle, el rango hasta el 68, o que se puede confeccionar"],
      ];
    },
  },

  "evento-manana-deriva": {
    telefono: "+5493410001015",
    mensajes: ["hola buenas tardes", "necesito alquilar un traje para un casamiento es mañana a la noche", "tienen algo? puedo pasar hoy mismo o mañana temprano"],
    async verificar(sql, telefono, respuestas) {
      const convId = await conversacionDe(sql, telefono);
      const der = (await fila(sql, "select motivo, estado from derivaciones where conversacion_id=$1", [convId]))[0];
      const conv = (await fila(sql, "select estado from conversaciones where id=$1", [convId]))[0];
      const cli = (await fila(sql, "select fecha_evento::text as f from clientes where telefono=$1", [telefono]))[0];
      const texto = respuestas.flat().join(" ").toLowerCase();
      const esperada = manana();
      return [
        [!!der && der.motivo === "evento_inminente", `motivo es evento_inminente (fue: ${der?.motivo})`],
        [conv?.estado === "derivada", "la conversación quedó derivada"],
        [cli?.f === esperada, `la fecha del evento quedó guardada como mañana (fue: ${cli?.f}, esperado ${esperada})`],
        [!texto.includes(" no ") && !texto.startsWith("no"), "el texto al cliente no dice que no"],
        [!/\d{1,2}:\d{2}/.test(texto), "no ofrece ningún horario (no hay que ofrecer turnos en este caso)"],
      ];
    },
  },
};

// ── correr uno, correr todos, informe ────────────────────────────────────────────────────

// Una conexión NUEVA por guion (no una compartida para toda la corrida): si el pooler de
// Supabase corta una conexión ociosa a mitad de un guion — pasó de verdad el 15/9, "Connection
// terminated unexpectedly" en medio de una corrida larga — el próximo guion arranca con una
// conexión sana en vez de heredar una ya rota. `sql.on("error", ...)` es imprescindible:
// pg.Client es un EventEmitter, y un 'error' sin escuchar tira una excepción no capturada que
// mata el proceso de Node entero (así se cayó la corrida esa vez, a mitad de "lo-voy-a-pensar").
async function conConexionPropia(url, fn) {
  const sql = new pg.Client({ connectionString: url });
  let seRompio = null;
  sql.on("error", (err) => { seRompio = err; });
  await sql.connect();
  try {
    const resultado = await fn(sql);
    if (seRompio) throw seRompio;
    return resultado;
  } finally {
    await sql.end().catch(() => {});
  }
}

async function correrUno(url, nombre) {
  const g = GUIONES[nombre];
  const resultado = { nombre, ok: true, detalles: [], error: null, respuestas: [] };
  try {
    await conConexionPropia(url, async (sql) => {
      let idsCatalogo = [];
      try {
        await limpiarTelefono(sql, g.telefono);
        if (g.necesitaCatalogo) idsCatalogo = await sembrarCatalogo(sql);

        let ultimaRespuesta = null;
        for (const mensaje of g.mensajes) {
          ultimaRespuesta = await mandar(g.telefono, mensaje);
          resultado.respuestas.push(ultimaRespuesta.mensajes || []);
          if (ultimaRespuesta.derivo) break; // si ya derivó, no tiene sentido seguir mandando mensajes del guion
        }

        for (const [ok, detalle] of await g.verificar(sql, g.telefono, resultado.respuestas, ultimaRespuesta)) {
          resultado.detalles.push({ ok: !!ok, detalle });
          if (!ok) resultado.ok = false;
        }
      } finally {
        if (idsCatalogo.length) await borrarCatalogo(sql, idsCatalogo).catch(() => {});
        await limpiarTelefono(sql, g.telefono).catch(() => {});
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
    console.log(Object.keys(GUIONES).join("\n"));
    return;
  }
  const pedidos = args.filter((a) => !a.startsWith("--"));
  const nombres = pedidos.length ? pedidos : Object.keys(GUIONES);
  for (const n of nombres) {
    if (!GUIONES[n]) {
      console.error(`No existe el guion "${n}". Guiones: ${Object.keys(GUIONES).join(", ")}`);
      process.exitCode = 1;
      return;
    }
  }

  const url = process.env.SUPABASE_DB_URL;
  if (!url) { console.error("Falta SUPABASE_DB_URL"); process.exit(1); }

  const resultados = [];
  for (const nombre of nombres) {
    process.stdout.write(`▶ ${nombre} ... `);
    const r = await correrUno(url, nombre);
    resultados.push(r);
    console.log(r.ok ? "✅" : "❌");
    if (!r.ok) {
      if (r.error) console.log(`   💥 ${r.error}`);
      for (const d of r.detalles) if (!d.ok) console.log(`   ❌ ${d.detalle}`);
    }
    for (const [i, msj] of r.respuestas.entries()) {
      console.log(`   [${i + 1}] ${g_mensajes(nombre, i)} → ${msj.join(" | ") || "(sin mensaje)"}`);
    }
  }

  function g_mensajes(nombre, i) {
    return JSON.stringify(GUIONES[nombre].mensajes[i]);
  }

  const ok = resultados.filter((r) => r.ok).length;
  console.log(`\n${ok}/${resultados.length} guiones pasaron.`);
  if (ok !== resultados.length) process.exitCode = 1;
}

main();
