// scripts/documento-lucia.mjs — arma docs/LUCIA-PROMPT-Y-CONOCIMIENTO.md con lo que Lucía tiene
// HOY en producción: el prompt vivo (prompt_vigente()), las reglas, los textos fijos, la base de
// conocimiento, el catálogo, la agenda, los enlaces y las herramientas. Solo lee.
//
// Uso (desde la raíz del repo):
//   deno run --no-lock --node-modules-dir=none -A scripts/_herramientas.ts > /tmp/herr.json   (opcional)
//   node scripts/documento-lucia.mjs [/tmp/herr.json]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(RAIZ, "package.json"));
require("dotenv").config({ path: resolve(RAIZ, ".env") });
const pg = require("pg");

const herrArchivo = process.argv[2];
const herramientas = herrArchivo && existsSync(herrArchivo) ? JSON.parse(readFileSync(herrArchivo, "utf8")) : [];

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const q = (s, p) => db.query(s, p).then((r) => r.rows);

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hm = (t) => String(t ?? "").slice(0, 5);
const pesos = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("es-AR")}`);
const celda = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const hoy = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "long", timeStyle: "short" });

const [base] = await q("select version, editado_por, editado_at from prompt_base");
const [{ p: prompt }] = await q("select prompt_vigente() as p");
const reglas = await q("select numero, texto from reglas_agente where activo order by numero");
const contexto = await q("select clave, valor from contexto_agente order by clave");
const fragmentos = await q("select tema, titulo, texto from fragmentos where activo order by tema, titulo");
const catalogo = await q("select modelo, precio_base, colores, talles, descripcion, fotos from catalogo_alquiler where activo order by orden nulls last, modelo");
const accesorios = await q("select nombre, precio, precio_compra from accesorios_alquiler where activo order by nombre");
const enlaces = await q("select nombre, url from enlaces where activo order by nombre");
const horarios = await q("select dia_semana, hora_apertura, hora_cierre, activo from horarios order by dia_semana");
const franjas = await q("select dia_semana, desde, hasta, probadores from franjas_turnos order by dia_semana, desde");
const [conf] = await q("select * from configuracion_agenda limit 1");
const duraciones = await q("select tipo, duracion_min from duraciones_turno order by duracion_min, tipo");
const cierres = await q("select fecha, motivo from cierres_agenda where fecha >= current_date order by fecha");
const herrBase = await q("select nombre, activa, descripcion from herramientas_agente order by nombre");
await db.end();

const colores = (c) => {
  if (!c) return "—";
  const arr = Array.isArray(c) ? c : [c];
  return arr.map((x) => (typeof x === "string" ? x : x?.nombre ?? x?.color ?? JSON.stringify(x))).join(", ");
};
const listaTalles = (t) => (Array.isArray(t) ? t.join(", ") : t ?? "—");
const cantFotos = (f) => (Array.isArray(f) ? f.length : f ? 1 : 0);

const L = [];
const p = (...xs) => L.push(...xs);

p(
  "# Lucía — prompt y conocimiento en producción",
  "",
  `Generado el ${hoy} directamente desde la base de producción (no es una copia a mano). ` +
    `Prompt vivo: versión ${base.version}, última edición «${base.editado_por}».`,
  "",
  "Para regenerarlo: `node scripts/documento-lucia.mjs`.",
  "",
  "## Cómo está armada Lucía",
  "",
  "En cada mensaje del cliente, Lucía recibe en este orden:",
  "",
  "1. **El prompt principal** (abajo, completo). Es lo único que «sabe de memoria»: quién es, cómo habla, sus reglas y el mapa de dónde buscar cada dato.",
  "2. **El contexto del turno**, armado por el sistema en el momento: la libreta del cliente (nombre, evento, fecha, rol, talle, mail, notas), sus turnos activos, la fecha y hora actual, y el horario del local y de turnos de ese día.",
  "3. **El historial** de la charla (hasta 40 mensajes previos), incluidos los del equipo marcados «[mostrador]».",
  "4. **Las herramientas**: todo lo demás (precios, talles, horarios, políticas) lo consulta en la base cuando lo necesita.",
  "",
  "Además, antes de mandar cada respuesta pasan 16 controles automáticos (barandillas): precio, horario o accesorio sin consultar, negativas comerciales, preguntas de más, relleno, etc.",
  "",
  "## 1. Prompt principal (tal cual lo lee Lucía)",
  "",
  "```text",
  String(prompt).trim(),
  "```",
  "",
  "## 2. Textos fijos",
  "",
  "Los arma el sistema, no Lucía. Se editan en Configuración.",
  "",
  "| Clave | Texto |",
  "|---|---|",
  ...contexto.map((c) => `| \`${c.clave}\` | ${celda(c.valor)} |`),
  "",
  "**Lista del turno** (la manda el sistema al agendar y al actualizar nombre o correo):",
  "",
  "```text",
  "¡Listo! Tu turno ya quedó agendado. Este es el resumen:",
  "",
  "- Nombre: <nombre o «No especificado»>",
  "- Número: <teléfono de la charla>",
  "- Día y hora: <día> a las <hora> hs",
  "- Gmail: <correo o «No especificado»>",
  "",
  "Para completar tus datos, ¿me decís tu nombre y correo electrónico?",
  "```",
  "",
  "## 3. Base de conocimiento (`buscar_informacion`)",
  "",
  "Lucía la consulta por tema, solo cuando la pregunta lo pide.",
  "",
);
let temaActual = null;
for (const f of fragmentos) {
  if (f.tema !== temaActual) {
    p(`### Tema: \`${f.tema}\``, "");
    temaActual = f.tema;
  }
  p(`**${f.titulo}**`, "", String(f.texto).trim(), "");
}

p(
  "## 4. Catálogo de alquiler (`consultar_catalogo`)",
  "",
  "| Modelo | Precio base | Colores | Talles | Fotos | Descripción |",
  "|---|---|---|---|---|---|",
  ...catalogo.map((m) => `| ${celda(m.modelo)} | ${pesos(m.precio_base)} | ${celda(colores(m.colores))} | ${celda(listaTalles(m.talles))} | ${cantFotos(m.fotos)} | ${celda(m.descripcion) || "—"} |`),
  "",
  "**Talles infantiles:** del 4 al 16 (cargado en la base de conocimiento, todavía sin modelos ni precios infantiles en el catálogo).",
  "",
  "## 5. Accesorios (`consultar_accesorios`)",
  "",
  "| Accesorio | Alquiler | Compra |",
  "|---|---|---|",
  ...accesorios.map((a) => `| ${celda(a.nombre)} | ${pesos(a.precio)} | ${pesos(a.precio_compra)} |`),
  "",
  "## 6. Agenda (`buscar_horarios`, `agendar_turno`)",
  "",
  "### Horario del local",
  "",
  "| Día | Horario |",
  "|---|---|",
  ...horarios.map((h) => `| ${DIAS[h.dia_semana]} | ${h.activo ? `${hm(h.hora_apertura)} a ${hm(h.hora_cierre)}` : "**Cerrado**"} |`),
  "",
  "### Franjas de turnos",
  "",
  "| Día | Desde | Hasta | Probadores |",
  "|---|---|---|---|",
  ...franjas.map((f) => `| ${DIAS[f.dia_semana]} | ${hm(f.desde)} | ${hm(f.hasta)} | ${f.probadores} |`),
  "",
  `- Probadores en total: ${conf?.cantidad_probadores ?? "—"}. **Lucía agenda solo en los primeros ${conf?.probadores_lucia ?? "todos"}**; el resto queda para el equipo.`,
  `- Turnos cada ${conf?.escalonado_min ?? "—"} minutos. Días con probadores simultáneos: ${(conf?.dias_simultaneos ?? []).map((d) => DIAS[d]).join(", ") || "ninguno"}.`,
  `- Urgencia: eventos dentro de ${conf?.dias_reserva_urgencia ?? "—"} días. Aviso al equipo ${conf?.aviso_turno_min ?? "—"} min antes de cada turno.`,
  `- Duración por tipo: ${duraciones.map((d) => `${d.tipo} ${d.duracion_min} min`).join(" · ")}.`,
  `- Cierres especiales próximos: ${cierres.length ? cierres.map((c) => `${new Date(c.fecha).toISOString().slice(0, 10)} (${c.motivo ?? "sin motivo"})`).join(", ") : "ninguno cargado"}.`,
  "- Para reservar alcanza con teléfono, día y hora. Si el evento es hoy o mañana, pasa directo al equipo.",
  "",
  "## 7. Enlaces (`enviar_link`)",
  "",
  "| Nombre | URL |",
  "|---|---|",
  ...enlaces.map((e) => `| ${celda(e.nombre)} | ${e.url} |`),
  "",
  "## 8. Reglas numeradas",
  "",
  "Ya están incluidas dentro del prompt; acá sueltas para leerlas rápido.",
  "",
  ...reglas.map((r) => `${r.numero}. ${r.texto}`),
  "",
  "## 9. Herramientas",
  "",
);
const porNombre = new Map(herrBase.map((h) => [h.nombre, h]));
for (const h of herramientas) {
  const b = porNombre.get(h.nombre);
  const desc = (b?.descripcion ?? "").trim() || h.descripcion;
  p(
    `### \`${h.nombre}\` — ${h.tipo === "accion" ? "acción" : h.tipo}${b && !b.activa ? " (DESACTIVADA)" : ""}`,
    "",
    `Parámetros: ${h.parametros.map((x) => `\`${x}\``).join(", ")}`,
    "",
    desc,
    "",
  );
}
if (!herramientas.length) p(...herrBase.map((h) => `- \`${h.nombre}\`${h.activa ? "" : " (desactivada)"}`), "");

p(
  "## 10. Plantillas de WhatsApp (Meta)",
  "",
  "Aprobadas en Meta (es_AR): `recordatorio_turno`, `agradecimiento`, `recontacto_cliente`. Las manda el sistema, no Lucía:",
  "",
  "- **recordatorio_turno**: dentro de las 18 h previas al turno, y también al crear un turno desde el panel.",
  "- **agradecimiento**: después del evento, con el link de reseña de Google.",
  "- **recontacto_cliente**: a 1 y 3 días, a quien consultó y no reservó.",
  "",
  "> Estado al generar este documento: el interruptor `CRONS_ENVIOS` está **apagado**, así que ninguna de las tres se está enviando.",
  "",
);

const destino = resolve(RAIZ, "docs/LUCIA-PROMPT-Y-CONOCIMIENTO.md");
writeFileSync(destino, L.join("\n"));
console.log(`✅ ${destino} — ${L.length} líneas`);
