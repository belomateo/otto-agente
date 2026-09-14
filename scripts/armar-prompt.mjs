// scripts/armar-prompt.mjs — genera supabase/functions/_shared/prompt.md (H1.3).
//
// Toma plantilla-agente/02-prompt.md, reemplaza lo que viene de la base
// ({{REGLAS_NUMERADAS}} ← reglas_agente, {{CONTEXTO:clave}} ← contexto_agente) y
// valida el resultado antes de escribirlo. Si no pasa, no escribe nada y sale con
// código 1: el prompt anterior sigue vigente (PROCESOS.md § 8).
//
// Uso:
//   node scripts/armar-prompt.mjs                        base real (SUPABASE_DB_URL de .env)
//   node scripts/armar-prompt.mjs --entrada datos.json   sin base; el JSON trae
//                                                        { reglas: [{numero, texto, activo}],
//                                                          contexto: { clave: valor } }
//   node scripts/armar-prompt.mjs --plantilla p.md --salida s.md
//   node scripts/armar-prompt.mjs --solo-validar         valida y no escribe
//   node scripts/armar-prompt.mjs --volcar datos.json    guarda lo leído de la base en un JSON
//
// Código 0 = prompt válido (y escrito, salvo --solo-validar). Código 1 = no pasa alguna
// validación o faltan datos; los motivos van por stderr, uno por línea.
//
// También se importa como módulo (el panel regenera desde un route handler):
//   import { armarPrompt, nombreDelPrompt } from "../scripts/armar-prompt.mjs"

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const NOMBRE_AGENTE = "Lucía";
export const TECHO_LINEAS = 300;
export const ENCABEZADO_REGLAS = "REGLAS QUE NUNCA ROMPES";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PLANTILLA_POR_DEFECTO = resolve(RAIZ, "plantilla-agente/02-prompt.md");
export const SALIDA_POR_DEFECTO = resolve(RAIZ, "supabase/functions/_shared/prompt.md");

// Lo que es DATO y nunca va en el prompt (CLAUDE.md § 2, principio 2; hito 1.3 control 3).
const DATOS_PROHIBIDOS = [
  { nombre: "un precio ($)", regex: /\$/, destino: "al catálogo (consultar_catalogo)" },
  { nombre: "un horario (hh:mm)", regex: /\b\d{1,2}:\d{2}\b/, destino: "a la tabla horarios o a un fragmento" },
  { nombre: "un link (http)", regex: /http/i, destino: "a la tabla enlaces (enviar_link)" },
  { nombre: "una duración (minutos)", regex: /\bminutos?\b/i, destino: "a la configuración de agenda o a un fragmento" },
];

const lf = (t) => String(t ?? "").replace(/\r\n?/g, "\n");

// Saca los comentarios HTML (línea entera o en medio de una línea) y normaliza finales de
// línea. Deja el cuerpo listo para validar: sin líneas en blanco al principio, una sola
// línea en blanco al final.
export function limpiarPlantilla(texto) {
  let t = lf(texto);
  t = t.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n?/gm, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/^\n+/, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.replace(/\s+$/, "") + "\n";
}

// "Sos Lucía, y atendés..." → "Lucía". Es la única fuente del nombre para el resto del código.
export function nombreDelPrompt(prompt) {
  const primera = lf(prompt).split("\n")[0] ?? "";
  const m = primera.match(/^Sos ([^,]+),/);
  return m ? m[1].trim() : null;
}

// Un valor de contexto_agente lo escribe el dueño desde el panel, como le sale: se deja en
// un solo bloque (sin líneas en blanco adentro, que el prompt usa para separar secciones) y
// con punto final si termina en letra o número. Nada más: el texto es suyo.
export function normalizarValorContexto(valor) {
  let v = lf(valor).trim();
  v = v.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n");
  if (/[\p{L}\p{N}]$/u.test(v)) v += ".";
  return v;
}

function renderizarReglas(reglas) {
  const activas = (reglas ?? [])
    .filter((r) => r && r.activo !== false)
    .sort((a, b) => Number(a.numero) - Number(b.numero));
  return activas
    .map((r) => `${r.numero}. ${lf(r.texto).replace(/\s*\n\s*/g, " ").trim()}`)
    .join("\n");
}

// Devuelve { prompt, errores }. Si errores.length > 0, prompt no sirve para publicar.
export function armarPrompt({ plantilla, reglas, contexto }) {
  const errores = [];
  let cuerpo = limpiarPlantilla(plantilla);

  if (cuerpo.includes("{{REGLAS_NUMERADAS}}")) {
    if (!Array.isArray(reglas) || reglas.length === 0) {
      errores.push("No hay reglas para volcar en {{REGLAS_NUMERADAS}}: reglas_agente está vacía.");
    } else {
      cuerpo = cuerpo.replace("{{REGLAS_NUMERADAS}}", renderizarReglas(reglas));
    }
  }

  cuerpo = cuerpo.replace(/\{\{CONTEXTO:([a-z0-9_]+)\}\}/gi, (todo, clave) => {
    const valor = contexto?.[clave];
    if (typeof valor !== "string" || valor.trim() === "") {
      errores.push(`Falta la clave "${clave}" en contexto_agente (la plantilla pide {{CONTEXTO:${clave}}}).`);
      return todo;
    }
    return normalizarValorContexto(valor);
  });

  cuerpo = cuerpo.replace(/\s+$/, "") + "\n";
  errores.push(...validarPrompt(cuerpo));
  return { prompt: cuerpo, errores };
}

// Las validaciones del hito 1.3 (control 2 y 3). Cada una devuelve un mensaje que dice qué
// y dónde, para que el dueño pueda arreglarlo desde el panel sin leer código.
export function validarPrompt(prompt) {
  const errores = [];
  const lineas = lf(prompt).replace(/\s+$/, "").split("\n");

  for (const [i, l] of lineas.entries()) {
    for (const marca of ["{{", "}}", "[[", "]]"]) {
      if (l.includes(marca)) {
        errores.push(`Queda un "${marca}" sin resolver en la línea ${i + 1}: ${l.trim()}`);
      }
    }
  }

  if (lineas.length > TECHO_LINEAS) {
    errores.push(`El cuerpo tiene ${lineas.length} líneas y el techo es ${TECHO_LINEAS}.`);
  }

  const nombre = nombreDelPrompt(prompt);
  if (!nombre) {
    errores.push(`La primera línea tiene que empezar con "Sos ${NOMBRE_AGENTE}," y dice: ${lineas[0] ?? "(vacía)"}`);
  } else if (nombre !== NOMBRE_AGENTE) {
    errores.push(`La primera línea nombra a "${nombre}" y el agente se llama ${NOMBRE_AGENTE}.`);
  }

  const iEnc = lineas.findIndex((l) => l.trim() === ENCABEZADO_REGLAS);
  if (iEnc === -1) {
    errores.push(`Falta el encabezado "${ENCABEZADO_REGLAS}".`);
  } else {
    const bloque = [];
    for (let i = iEnc + 1; i < lineas.length && lineas[i].trim() !== ""; i++) bloque.push({ n: i + 1, l: lineas[i] });
    if (bloque.length === 0) {
      errores.push(`Debajo de "${ENCABEZADO_REGLAS}" no hay ninguna regla.`);
    }
    let anterior = 0;
    for (const { n, l } of bloque) {
      const m = l.match(/^(\d+)\. \S/);
      if (!m) {
        errores.push(`Las reglas no están numeradas ("N. texto", una por línea): línea ${n}: ${l.trim()}`);
        continue;
      }
      const num = Number(m[1]);
      if (num <= anterior) errores.push(`La numeración de las reglas no va en orden en la línea ${n} (${num} después de ${anterior}).`);
      anterior = num;
    }
  }

  for (const [i, l] of lineas.entries()) {
    for (const d of DATOS_PROHIBIDOS) {
      if (d.regex.test(l)) {
        errores.push(`Hay ${d.nombre} en la línea ${i + 1} y eso es dato, no prompt: va ${d.destino}. Línea: ${l.trim()}`);
      }
    }
  }

  return errores;
}

async function leerDeLaBase() {
  await import("dotenv/config");
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Falta SUPABASE_DB_URL en .env (o pasá --entrada datos.json).");
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const r = await cliente.query("select numero, texto, activo from reglas_agente order by numero");
    const k = await cliente.query("select clave, valor from contexto_agente order by clave");
    return {
      reglas: r.rows.map((f) => ({ numero: Number(f.numero), texto: f.texto, activo: f.activo })),
      contexto: Object.fromEntries(k.rows.map((f) => [f.clave, f.valor])),
    };
  } finally {
    await cliente.end();
  }
}

function argumentos(argv) {
  const a = { plantilla: PLANTILLA_POR_DEFECTO, salida: SALIDA_POR_DEFECTO, entrada: null, volcar: null, soloValidar: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const sig = () => {
      const s = argv[++i];
      if (!s) throw new Error(`Falta el valor de ${v}.`);
      return s;
    };
    if (v === "--plantilla") a.plantilla = resolve(sig());
    else if (v === "--salida") a.salida = resolve(sig());
    else if (v === "--entrada") a.entrada = resolve(sig());
    else if (v === "--volcar") a.volcar = resolve(sig());
    else if (v === "--solo-validar") a.soloValidar = true;
    else throw new Error(`Argumento desconocido: ${v}`);
  }
  return a;
}

export async function main(argv = process.argv.slice(2)) {
  let a;
  try {
    a = argumentos(argv);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    return 1;
  }

  let plantilla;
  try {
    plantilla = readFileSync(a.plantilla, "utf8");
  } catch {
    console.error(`❌ No se pudo leer la plantilla: ${a.plantilla}`);
    return 1;
  }

  let datos;
  try {
    if (a.entrada) {
      datos = JSON.parse(lf(readFileSync(a.entrada, "utf8")));
    } else {
      datos = await leerDeLaBase();
      if (a.volcar) {
        mkdirSync(dirname(a.volcar), { recursive: true });
        writeFileSync(a.volcar, JSON.stringify(datos, null, 2) + "\n", "utf8");
      }
    }
  } catch (e) {
    console.error(`❌ No se pudieron leer las reglas y el contexto: ${e.message}`);
    return 1;
  }

  const { prompt, errores } = armarPrompt({ plantilla, reglas: datos.reglas, contexto: datos.contexto });
  if (errores.length > 0) {
    console.error(`❌ El prompt no pasa ${errores.length} validación(es); no se escribió nada:`);
    for (const e of errores) console.error(`   - ${e}`);
    return 1;
  }

  const lineas = prompt.replace(/\s+$/, "").split("\n").length;
  const reglasActivas = (datos.reglas ?? []).filter((r) => r.activo !== false).length;
  const claves = [...limpiarPlantilla(plantilla).matchAll(/\{\{CONTEXTO:([a-z0-9_]+)\}\}/gi)].map((m) => m[1]);
  if (!a.soloValidar) {
    mkdirSync(dirname(a.salida), { recursive: true });
    writeFileSync(a.salida, prompt, "utf8");
  }
  console.log(
    `✅ prompt ${a.soloValidar ? "válido (no escrito)" : "escrito en " + a.salida}: ${lineas} líneas, ` +
      `${reglasActivas} reglas, nombre "${nombreDelPrompt(prompt)}", contexto: ${claves.join(", ") || "(ninguno)"}`,
  );
  return 0;
}

const esPrincipal = (() => {
  if (!process.argv[1]) return false;
  const a = fileURLToPath(import.meta.url), b = resolve(process.argv[1]);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
})();
if (esPrincipal) process.exit(await main());
