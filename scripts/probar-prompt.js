// scripts/probar-prompt.js — controles 1, 2, 3, 5 y 6 del hito 1.3 sobre scripts/armar-prompt.mjs.
//
// Corre el generador de verdad (proceso aparte, como lo va a correr el panel) y comprueba
// el código de salida y el mensaje en cada caso. Los casos que tienen que fallar usan un
// archivo de plantilla propio, derivado de la plantilla real y guardado en una carpeta
// temporal, así los casos no se desactualizan cuando la plantilla cambia.
//
//   node scripts/probar-prompt.js            caso 0 contra la base real (SUPABASE_DB_URL):
//                                            genera supabase/functions/_shared/prompt.md
//   node scripts/probar-prompt.js --sin-base usa un JSON mínimo y no toca prompt.md
//
// Sale con 1 si algún caso no da lo esperado.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const GENERADOR = path.join(RAIZ, "scripts", "armar-prompt.mjs");
const PLANTILLA_REAL = path.join(RAIZ, "plantilla-agente", "02-prompt.md");
const SALIDA_REAL = path.join(RAIZ, "supabase", "functions", "_shared", "prompt.md");
const AGENTE_MD = path.join(RAIZ, "AGENTE.md");
const TMP = path.join(os.tmpdir(), "otto-prompt-pruebas");
const SIN_BASE = process.argv.includes("--sin-base");

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const lf = (t) => String(t).replace(/\r\n?/g, "\n");
const plantillaReal = lf(fs.readFileSync(PLANTILLA_REAL, "utf8"));

const FIXTURE_MINIMO = {
  reglas: [
    { numero: 1, texto: "Los descuentos los decide una persona: nunca los ofrecés ni los confirmás.", activo: true },
    { numero: 2, texto: "Si no sabés algo, lo decís y derivás. No inventás.", activo: true },
    { numero: 3, texto: "Ante un reclamo no discutís: derivás enseguida.", activo: true },
  ],
  contexto: {
    presentacion: "Hola, soy Lucía, asistente de Mr. Otto. ¿En qué puedo ayudarte hoy?",
    tono: "Cercano, sin tantos emojis.",
    ancla_de_valor: "Mr Otto no alquila cualquier traje: se ajusta a medida así queda perfecto el día del evento.",
  },
};

let fallas = 0;
const filas = [];

function registrar(caso, esperado, obtenido, ok, detalle = "") {
  filas.push({ caso, esperado, obtenido, ok, detalle });
  if (!ok) fallas++;
}

function escribir(nombre, contenido) {
  const p = path.join(TMP, nombre);
  fs.writeFileSync(p, contenido, "utf8");
  return p;
}

function generar(args) {
  const r = spawnSync(process.execPath, [GENERADOR, ...args], { cwd: RAIZ, encoding: "utf8" });
  return { codigo: r.status, salida: (r.stdout || "") + (r.stderr || "") };
}

// Reemplaza una línea ENTERA del cuerpo (no la primera aparición del texto, que puede
// estar en el comentario de cabecera de la plantilla y el generador la tira).
function reemplazarLinea(texto, lineaExacta, nueva) {
  const re = new RegExp(`^${lineaExacta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");
  if (!re.test(texto)) throw new Error(`La plantilla no tiene una línea "${lineaExacta}": el caso de prueba quedó viejo.`);
  return texto.replace(re, nueva);
}

// Un caso que tiene que FALLAR: código 1, un mensaje que nombre el problema y nada escrito.
// Nunca escribe sobre el prompt.md real: la salida va a TMP.
function debeFallar(caso, plantilla, fixturePath, textoEsperado) {
  const p = escribir(`${caso.replace(/[^a-z0-9]+/gi, "-")}.md`, plantilla);
  const salida = path.join(TMP, `${caso.replace(/[^a-z0-9]+/gi, "-")}.salida.md`);
  const { codigo, salida: msg } = generar(["--plantilla", p, "--entrada", fixturePath, "--salida", salida]);
  const nombra = new RegExp(textoEsperado, "i").test(msg);
  const noEscribio = !fs.existsSync(salida);
  registrar(
    caso,
    `código 1, mensaje que nombre /${textoEsperado}/, sin escribir`,
    `código ${codigo}, ${nombra ? "lo nombra" : "NO lo nombra"}, ${noEscribio ? "no escribió" : "ESCRIBIÓ"}`,
    codigo === 1 && nombra && noEscribio,
    msg.trim().split("\n").slice(0, 3).join(" | "),
  );
}

function debePasar(caso, plantilla, fixturePath) {
  const p = escribir(`${caso.replace(/[^a-z0-9]+/gi, "-")}.md`, plantilla);
  const salida = path.join(TMP, `${caso.replace(/[^a-z0-9]+/gi, "-")}.salida.md`);
  const { codigo, salida: msg } = generar(["--plantilla", p, "--entrada", fixturePath, "--salida", salida]);
  const escrito = fs.existsSync(salida) ? fs.readFileSync(salida, "utf8") : null;
  registrar(caso, "código 0 y prompt escrito", `código ${codigo}, ${escrito ? "escrito" : "NO escrito"}`, codigo === 0 && !!escrito, codigo === 0 ? "" : msg.trim());
  return escrito;
}

// Una sección "## N. Título" de AGENTE.md, hasta la siguiente.
function seccionMd(md, numero) {
  const m = md.match(new RegExp(`^## ${numero}\\. .*$`, "m"));
  if (!m) return "";
  const resto = md.slice(m.index + m[0].length);
  const fin = resto.search(/^## \d+\. /m);
  return fin === -1 ? resto : resto.slice(0, fin);
}

function bloqueDeReglas(prompt) {
  const l = lf(prompt).split("\n");
  const i = l.indexOf("REGLAS QUE NUNCA ROMPES");
  const out = [];
  for (let j = i + 1; i >= 0 && j < l.length && l[j] !== ""; j++) out.push(l[j]);
  return out;
}

(function main() {
  // ── Caso 0: la plantilla real con la base real (o el fixture mínimo) ─────────────────
  let fixturePath = path.join(TMP, "datos.json");
  let promptGenerado = null;
  if (SIN_BASE) {
    fs.writeFileSync(fixturePath, JSON.stringify(FIXTURE_MINIMO, null, 2), "utf8");
    const destino = path.join(TMP, "real.salida.md");
    const { codigo, salida } = generar(["--entrada", fixturePath, "--salida", destino]);
    registrar("0. plantilla real + fixture mínimo", "código 0", `código ${codigo}`, codigo === 0, codigo === 0 ? "" : salida.trim());
    if (codigo === 0) promptGenerado = fs.readFileSync(destino, "utf8");
  } else {
    const { codigo, salida } = generar(["--volcar", fixturePath]);
    registrar("0. plantilla real + base real → prompt.md", "código 0", `código ${codigo}`, codigo === 0, salida.trim());
    if (codigo === 0) promptGenerado = fs.readFileSync(SALIDA_REAL, "utf8");
    if (!fs.existsSync(fixturePath)) fs.writeFileSync(fixturePath, JSON.stringify(FIXTURE_MINIMO, null, 2), "utf8");
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  // ── Control 2 y 3 sobre el prompt generado ───────────────────────────────────────────
  if (promptGenerado !== null) {
    const p = promptGenerado;
    const lineas = p.replace(/\s+$/, "").split("\n").length;
    registrar("0a. sin CRLF", "0 \\r", `${(p.match(/\r/g) || []).length} \\r`, !p.includes("\r"));
    registrar("0b. sin comentarios HTML", "0 <!--", `${(p.match(/<!--/g) || []).length} <!--`, !p.includes("<!--"));
    registrar("0c. ≤ 300 líneas", "≤ 300", `${lineas}`, lineas <= 300);
    registrar("0d. primera línea nombra a Lucía", 'empieza "Sos Lucía,"', JSON.stringify(p.split("\n")[0].slice(0, 12)), p.startsWith("Sos Lucía,"));
    for (const [nombre, re] of [["$", /\$/g], ["hh:mm", /\b\d{1,2}:\d{2}\b/g], ["http", /http/gi], ["minutos", /\bminutos?\b/gi], ["nombres de asesores", /Alejandra|Constantino/g]]) {
      const n = (p.match(re) || []).length;
      registrar(`0e. sin ${nombre} (control 3)`, "0", `${n}`, n === 0);
    }

    // ── Control 5: índice de herramientas y de secciones = AGENTE.md § 4 y § 8 ─────────
    const agente = lf(fs.readFileSync(AGENTE_MD, "utf8"));
    const herramientas = [...seccionMd(agente, 4).matchAll(/^\| `([a-z_]+)\(/gm)].map((m) => m[1]);
    const secciones = [...seccionMd(agente, 8).matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
    registrar("5a. AGENTE.md § 4 tiene 13 herramientas", "13", `${herramientas.length}`, herramientas.length === 13);
    registrar("5b. AGENTE.md § 8 tiene 16 secciones", "16", `${secciones.length}`, secciones.length === 16);
    const faltanH = herramientas.filter((h) => !new RegExp(`\\b${h}\\b`).test(p));
    registrar("5c. las 13 herramientas están en el prompt", "ninguna falta", faltanH.length ? `faltan: ${faltanH.join(", ")}` : "ninguna falta", faltanH.length === 0);
    const permitidos = new Set([...herramientas, "mensaje_al_cliente"]);
    const identificadores = [...new Set([...p.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((m) => m[0]))];
    const extras = identificadores.filter((x) => !permitidos.has(x));
    registrar("5d. el prompt no nombra herramientas que no existen", "ninguna", extras.length ? extras.join(", ") : "ninguna", extras.length === 0);
    const l = p.split("\n");
    const iIndice = l.findIndex((x) => x.includes("TODAS las secciones que hay"));
    const indice = [];
    for (let j = iIndice + 1; iIndice >= 0 && j < l.length && l[j].trim() !== ""; j++) {
      const m = l[j].match(/^\s+([a-z-]+) — /);
      if (m) indice.push(m[1]);
    }
    registrar(
      "5e. índice de secciones = AGENTE.md § 8 (mismo orden)",
      secciones.join(","),
      indice.join(","),
      indice.length === secciones.length && indice.every((s, k) => s === secciones[k]),
    );

    // ── Control 4 (parte que se ve en el prompt): las reglas de AGENTE.md § 5 ──────────
    if (!SIN_BASE) {
      const esperadas = [...seccionMd(agente, 5).matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
      const enPrompt = bloqueDeReglas(p).map((x) => Number((x.match(/^(\d+)\. /) || [])[1]));
      registrar(
        "4a. las reglas del prompt son las de AGENTE.md § 5, numeradas, una por línea",
        esperadas.join(","),
        enPrompt.join(","),
        enPrompt.length === esperadas.length && enPrompt.every((n, k) => n === esperadas[k]),
      );
    }

    // ── Control 6: nada que cambie turno a turno ───────────────────────────────────────
    const fechas = (p.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b20\d{2}\b/g) || []).length;
    registrar("6a. sin fechas (dd/mm, año)", "0", `${fechas}`, fechas === 0);
    const x1 = path.join(TMP, "determinismo-1.md"), x2 = path.join(TMP, "determinismo-2.md");
    generar(["--entrada", fixturePath, "--salida", x1]);
    generar(["--entrada", fixturePath, "--salida", x2]);
    const iguales = fs.existsSync(x1) && fs.existsSync(x2) && fs.readFileSync(x1, "utf8") === fs.readFileSync(x2, "utf8");
    registrar("6b. dos corridas seguidas dan el mismo prompt byte a byte", "idénticos", iguales ? "idénticos" : "DISTINTOS", iguales);
  }

  // ── Control 2: cada motivo de rechazo, con un archivo de prueba por caso ─────────────
  debeFallar("1. queda un {{X}}", plantillaReal + "\nY acá quedó un {{PLACEHOLDER_OLVIDADO}} sin resolver.\n", fixturePath, "\\{\\{");
  debeFallar("2. queda un [[X]]", plantillaReal + "\n[[Esto era opcional y nadie lo resolvió.]]\n", fixturePath, "\\[\\[");
  debeFallar("3. cuerpo > 300 líneas", plantillaReal + "\n" + Array.from({ length: 300 }, (_, i) => `Relleno número ${i + 1}.`).join("\n") + "\n", fixturePath, "300");
  debeFallar(
    "4. reglas sin numerar",
    reemplazarLinea(plantillaReal, "{{REGLAS_NUMERADAS}}", "Los descuentos los decide una persona.\nSi no sabés algo, lo decís y derivás."),
    fixturePath,
    "numeradas",
  );
  debeFallar("5. primera línea con otro nombre", plantillaReal.replace(/^Sos Lucía,/m, "Sos Sofía,"), fixturePath, "Sofía");
  debeFallar("6. primera línea sin la forma Sos X,", plantillaReal.replace(/^Sos Lucía, y/m, "Hola, sos Lucía y"), fixturePath, "primera línea");
  debeFallar("7. un precio ($)", plantillaReal + "\nEl alquiler sale $150.000.\n", fixturePath, "precio");
  debeFallar("8. un horario (hh:mm)", plantillaReal + "\nAbrimos a las 10:00.\n", fixturePath, "horario");
  debeFallar("9. un link (http)", plantillaReal + "\nMirá https://www.mrotto.com.ar/\n", fixturePath, "link");
  debeFallar("10. una duración (minutos)", plantillaReal + "\nEl turno dura 45 minutos.\n", fixturePath, "minutos");
  debeFallar("11. falta el encabezado de reglas", reemplazarLinea(plantillaReal, "REGLAS QUE NUNCA ROMPES", "REGLAS"), fixturePath, "REGLAS QUE NUNCA ROMPES");

  const sinPresentacion = escribir("sin-presentacion.json", JSON.stringify({ ...fixture, contexto: { ...fixture.contexto, presentacion: undefined } }));
  debeFallar("12. falta una clave de contexto", plantillaReal, sinPresentacion, "presentacion");

  const sinReglas = escribir("sin-reglas.json", JSON.stringify({ ...fixture, reglas: [] }));
  debeFallar("13. reglas_agente vacía", plantillaReal, sinReglas, "vac");

  // Una regla con un dato adentro (como la 3 provisoria de Fase 0) también tira el prompt
  // entero: el dato va a un fragmento, no al prompt.
  const conDato = escribir("regla-con-dato.json", JSON.stringify({ ...fixture, reglas: [...fixture.reglas, { numero: 99, texto: "Un acompañante por persona, con 10 minutos de tolerancia.", activo: true }] }));
  debeFallar("14. una regla de la base trae un dato", plantillaReal, conDato, "minutos");

  // ── Control 1 y 2: lo que tiene que pasar ────────────────────────────────────────────
  const crlf = debePasar("15. plantilla con CRLF", plantillaReal.replace(/\n/g, "\r\n"), fixturePath);
  if (crlf !== null) registrar("15a. salida sin \\r", "0", `${(crlf.match(/\r/g) || []).length}`, !crlf.includes("\r"));

  const conComentario = debePasar("16. comentarios HTML en el medio", plantillaReal + "\n<!-- nota del dueño -->\nÚltima línea.\n", fixturePath);
  if (conComentario !== null) registrar("16a. salida sin <!--", "0", `${(conComentario.match(/<!--/g) || []).length}`, !conComentario.includes("<!--"));

  // Cambiar una regla cambia el prompt, y solo en esa línea.
  const a = debePasar("17a. reglas versión A", plantillaReal, fixturePath);
  const reglasB = fixture.reglas.map((r) => (r.numero === fixture.reglas[0].numero ? { ...r, texto: "REGLA CAMBIADA PARA LA PRUEBA." } : r));
  const fixtureB = escribir("datos-b.json", JSON.stringify({ ...fixture, reglas: reglasB }));
  const b = debePasar("17b. reglas versión B (una regla cambiada)", plantillaReal, fixtureB);
  if (a !== null && b !== null) {
    const la = a.split("\n"), lb = b.split("\n");
    const distintas = la.map((x, i) => (x !== lb[i] ? i : -1)).filter((i) => i >= 0);
    registrar(
      "17c. cambiar una regla cambia una sola línea del prompt",
      "1 línea distinta, con el texto nuevo",
      `${distintas.length} distinta(s)${distintas.length === 1 ? `: "${lb[distintas[0]]}"` : ""}`,
      la.length === lb.length && distintas.length === 1 && lb[distintas[0]].includes("REGLA CAMBIADA"),
    );
  }

  // Una regla desactivada no aparece; una con salto de línea adentro queda en una sola línea.
  const reglasC = [...fixture.reglas.map((r, i) => (i === 1 ? { ...r, activo: false } : r)), { numero: 98, texto: "Primera parte\n  y segunda parte de la misma regla.", activo: true }];
  const fixtureC = escribir("datos-c.json", JSON.stringify({ ...fixture, reglas: reglasC }));
  const c = debePasar("18. regla inactiva y regla con salto de línea", plantillaReal, fixtureC);
  if (c !== null) {
    const reglas = bloqueDeReglas(c);
    const inactiva = fixture.reglas[1];
    const sinInactiva = !reglas.some((x) => x.startsWith(`${inactiva.numero}. `));
    const unida = reglas.includes("98. Primera parte y segunda parte de la misma regla.");
    registrar("18a. la regla inactiva no está", "no está", sinInactiva ? "no está" : "ESTÁ", sinInactiva);
    registrar("18b. la regla con salto queda en una línea", "una línea", unida ? "una línea" : "NO", unida);
  }

  // --solo-validar no escribe.
  {
    const salida = path.join(TMP, "solo-validar.salida.md");
    const { codigo } = generar(["--entrada", fixturePath, "--salida", salida, "--solo-validar"]);
    registrar("19. --solo-validar no escribe", "código 0, sin archivo", `código ${codigo}, ${fs.existsSync(salida) ? "ESCRIBIÓ" : "sin archivo"}`, codigo === 0 && !fs.existsSync(salida));
  }

  // ── Informe ──────────────────────────────────────────────────────────────────────────
  console.log(`Pruebas del generador del prompt (H1.3) — archivos de cada caso en ${TMP}\n`);
  for (const f of filas) {
    console.log(`${f.ok ? "✅" : "❌"} ${f.caso}`);
    console.log(`     esperado: ${f.esperado}`);
    console.log(`     obtenido: ${f.obtenido}`);
    if (f.detalle) console.log(`     salida:   ${f.detalle}`);
  }
  console.log(`\n${filas.length - fallas}/${filas.length} casos como se esperaba.`);
  if (fallas > 0) {
    console.error(`❌ ${fallas} caso(s) no dieron lo esperado.`);
    process.exit(1);
  }
})();
