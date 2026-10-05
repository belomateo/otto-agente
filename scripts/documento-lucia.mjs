// scripts/documento-lucia.mjs — arma, con lo que Lucía tiene HOY en producción, dos documentos:
//   · docs/LUCIA-PROMPT.md: el prompt principal tal cual lo lee en cada mensaje (prompt_vigente(),
//     con las reglas y los textos de contexto ya completados).
//   · docs/LUCIA-INFORMACION-ADICIONAL.md: lo que NO sabe de memoria y consulta con herramientas
//     (base de conocimiento, catálogo, accesorios, agenda, enlaces, textos fijos, herramientas y
//     plantillas).
// Pedido de Mateo (3/10): el prompt y la información adicional por separado. Solo lee.
//
// Uso (desde la raíz del repo):
//   deno run --no-lock --node-modules-dir=none -A scripts/_herramientas.ts > herr.json   (opcional)
//   node scripts/documento-lucia.mjs [herr.json]

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
const origen = `Generado el ${hoy} desde la base de producción (no es una copia a mano). ` +
  `Prompt vivo: versión ${base.version}, última edición «${base.editado_por}».`;

// ── 1. El prompt principal ─────────────────────────────────────────────────────────────────
const P = [
  "# Lucía — prompt principal",
  "",
  origen,
  "",
  "Es lo único que Lucía lee en **todos** los mensajes: quién es, cómo habla y responde, qué no puede hacer, " +
    "los datos fijos y el mapa de dónde buscar todo lo demás. Las reglas numeradas y los textos de tono y " +
    "presentación ya están completados acá, tal cual le llegan.",
  "",
  "Junto con el prompt, en cada mensaje recibe también:",
  "",
  "- **El contexto del turno**, armado por el sistema en el momento: la libreta del cliente (nombre, evento, fecha, rol, talle, mail, notas), sus turnos activos, la fecha y hora actual y el horario del local de ese día (de corrido).",
  "- **El historial** de la charla (hasta 40 mensajes previos), con los del equipo marcados «[mostrador]».",
  "",
  "Todo lo situacional (precios, talles, políticas, pagos, agenda) está en `LUCIA-INFORMACION-ADICIONAL.md`.",
  "",
  "Se edita en `plantilla-agente/02-prompt.md` y se carga con `node scripts/cargar-prompt.mjs \"<quién y por qué>\"`; " +
    "las reglas numeradas y los textos de contexto se editan desde el panel. Para regenerar este documento: " +
    "`node scripts/documento-lucia.mjs`.",
  "",
  "```text",
  String(prompt).trim(),
  "```",
  "",
];

// ── 2. La información adicional ────────────────────────────────────────────────────────────
// Los temas en el orden del mapa del prompt (así se lee igual que lo ve Lucía); los que no están
// en el mapa van al final.
const ordenMapa = [...String(prompt).matchAll(/^- ([a-z-]+): /gm)].map((m) => m[1]);
const temas = [...new Set(fragmentos.map((f) => f.tema))]
  .sort((a, b) => (ordenMapa.indexOf(a) + 1 || 999) - (ordenMapa.indexOf(b) + 1 || 999) || a.localeCompare(b));
const descripcionDelMapa = Object.fromEntries(
  [...String(prompt).matchAll(/^- ([a-z-]+): (.+)$/gm)].map((m) => [m[1], m[2].trim()]),
);

const A = [
  "# Lucía — información adicional",
  "",
  origen,
  "",
  "Todo esto Lucía **no lo sabe de memoria**: lo consulta con sus herramientas solo cuando la charla lo necesita, " +
    "y recién ahí lo afirma. El prompt principal (`LUCIA-PROMPT.md`) le dice dónde está cada cosa. Se edita desde " +
    "el panel y Lucía lo usa en menos de un minuto, sin tocar el prompt.",
  "",
  "| Sección | Herramienta que la consulta |",
  "|---|---|",
  "| 1. Base de conocimiento (políticas, pagos, talles, guiones) | `buscar_informacion` |",
  "| 2. Catálogo de alquiler | `consultar_catalogo` |",
  "| 3. Accesorios | `consultar_accesorios` |",
  "| 4. Agenda | `buscar_horarios`, `agendar_turno` |",
  "| 5. Enlaces | `enviar_link` |",
  "| 6. Textos fijos | los manda el sistema, no Lucía |",
  "| 7. Herramientas | qué hace cada una |",
  "| 8. Plantillas de WhatsApp | las manda el sistema, no Lucía |",
  "",
  "## 1. Base de conocimiento (`buscar_informacion`)",
  "",
];
for (const tema of temas) {
  A.push(`### \`${tema}\``, "");
  if (descripcionDelMapa[tema]) A.push(`*En el mapa del prompt: ${descripcionDelMapa[tema]}*`, "");
  for (const f of fragmentos.filter((x) => x.tema === tema)) A.push(`**${f.titulo}**`, "", String(f.texto).trim(), "");
}

A.push(
  "## 2. Catálogo de alquiler (`consultar_catalogo`)",
  "",
  "Desde el 5/10 Lucía **no asesora sobre modelos**: de esta tabla solo le llega el precio (o desde cuánto, si cambia según el modelo) y lo que incluye. Los modelos y colores se ven en el catálogo online (`enviar_link`, tipo `web`), y la disponibilidad depende del talle y de la fecha del alquiler. `enviar_fotos` está apagada en Configuración › Herramientas.",
  "",
  "| Modelo | Precio base | Colores | Talles | Fotos | Descripción |",
  "|---|---|---|---|---|---|",
  ...catalogo.map((m) => `| ${celda(m.modelo)} | ${pesos(m.precio_base)} | ${celda(colores(m.colores))} | ${celda(listaTalles(m.talles))} | ${cantFotos(m.fotos)} | ${celda(m.descripcion) || "—"} |`),
  "",
  "**Talles infantiles:** del 4 al 16 (en la base de conocimiento, tema `talles`; todavía sin modelos ni precios infantiles en el catálogo).",
  "",
  "## 3. Accesorios (`consultar_accesorios`)",
  "",
  "| Accesorio | Alquiler | Compra |",
  "|---|---|---|",
  ...accesorios.map((a) => `| ${celda(a.nombre)} | ${pesos(a.precio)} | ${pesos(a.precio_compra)} |`),
  "",
  "## 4. Agenda (`buscar_horarios`, `agendar_turno`)",
  "",
  "### Horario del local",
  "",
  "| Día | Horario |",
  "|---|---|",
  ...horarios.map((h) => `| ${DIAS[h.dia_semana]} | ${h.activo ? `${hm(h.hora_apertura)} a ${hm(h.hora_cierre)}` : "**Cerrado**"} |`),
  "",
  "El local abre de corrido. Lucía dice este horario; las franjas de abajo son internas de la agenda (cuántos probadores hay en cada tramo) y ya no se las pasa a Lucía: los turnos libres salen de `buscar_horarios`.",
  "",
  "### Franjas de turnos",
  "",
  "| Día | Desde | Hasta | Probadores |",
  "|---|---|---|---|",
  ...franjas.map((f) => `| ${DIAS[f.dia_semana]} | ${hm(f.desde)} | ${hm(f.hasta)} | ${f.probadores} |`),
  "",
  `- Probadores en total: ${conf?.cantidad_probadores ?? "—"}. **Lucía agenda solo en los primeros ${conf?.probadores_lucia ?? "todos"}**; el resto queda para el equipo.`,
  `- Turnos cada ${conf?.escalonado_min ?? "—"} minutos. Días con probadores simultáneos: ${(conf?.dias_simultaneos ?? []).map((d) => DIAS[d]).join(", ") || "ninguno"}.`,
  conf?.dias_reserva_urgencia
    ? `- Reserva de urgencia: los próximos ${conf.dias_reserva_urgencia} días (hoy incluido) quedan para eventos que caen dentro de ese plazo. A un evento más lejano, o si no se sabe la fecha, se le ofrece desde después; si el día pedido cae en la reserva y no se sabe la fecha, Lucía pregunta para cuándo es el evento.`
    : "- Reserva de urgencia: ninguna, todos los días se ofrecen a todos.",
  `- Aviso al equipo ${conf?.aviso_turno_min ?? "—"} minutos antes de cada turno.`,
  `- Duración por tipo: ${duraciones.map((d) => `${d.tipo} ${d.duracion_min} min`).join(" · ")}. En un mismo turno pueden venir dos personas a probarse.`,
  `- Cierres especiales próximos: ${cierres.length ? cierres.map((c) => `${new Date(c.fecha).toISOString().slice(0, 10)} (${c.motivo ?? "sin motivo"})`).join(", ") : "ninguno cargado"}.`,
  "- Para reservar alcanza con teléfono, día y hora. Si el evento es hoy o mañana, la charla pasa al equipo y el sistema le manda al cliente el teléfono del local (`texto_evento_inminente`).",
  "- Devolución: el día hábil siguiente al evento; si el evento es el fin de semana, sí o sí el lunes. Si quiere devolverlo más tarde, Lucía deriva con motivo `devolucion_tardia` y el sistema le manda el teléfono del local (`texto_devolucion_tardia`).",
  "",
  "## 5. Enlaces (`enviar_link`)",
  "",
  "| Nombre | URL |",
  "|---|---|",
  ...enlaces.map((e) => `| ${celda(e.nombre)} | ${e.url} |`),
  "",
  "## 6. Textos fijos",
  "",
  "Los arma el sistema, no Lucía (por ejemplo, al derivar o al confirmar un turno). Se editan desde el panel.",
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
  "## 7. Herramientas",
  "",
  "Cada herramienta trae su propia descripción, que el modelo lee junto con ella (no se repite en el prompt).",
  "",
);
const porNombre = new Map(herrBase.map((h) => [h.nombre, h]));
for (const h of herramientas) {
  const b = porNombre.get(h.nombre);
  const desc = (b?.descripcion ?? "").trim() || h.descripcion;
  A.push(
    `### \`${h.nombre}\` — ${h.tipo === "accion" ? "acción" : h.tipo}${b && !b.activa ? " (DESACTIVADA)" : ""}`,
    "",
    `Parámetros: ${h.parametros.map((x) => `\`${x}\``).join(", ")}`,
    "",
    desc,
    "",
  );
}
if (!herramientas.length) A.push(...herrBase.map((h) => `- \`${h.nombre}\`${h.activa ? "" : " (desactivada)"}`), "");

A.push(
  "## 8. Plantillas de WhatsApp (Meta)",
  "",
  "Aprobadas en Meta (es_AR): `recordatorio_turno`, `agradecimiento`, `recontacto_cliente`. Las manda el sistema, no Lucía:",
  "",
  "- **recordatorio_turno**: dentro de las 18 h previas al turno (si se sacó con más de 24 h), y también al crear un turno desde el panel.",
  "- **agradecimiento**: después de devolver el traje, con el link de reseña de Google.",
  "- **recontacto_cliente**: a 1 y 3 días, a quien consultó y no reservó.",
  "",
  "Los clientes sin teléfono válido se saltean; los números argentinos sin 549 se corrigen antes de enviar.",
  "",
);

for (const [archivo, lineas] of [["docs/LUCIA-PROMPT.md", P], ["docs/LUCIA-INFORMACION-ADICIONAL.md", A]]) {
  writeFileSync(resolve(RAIZ, archivo), lineas.join("\n"));
  console.log(`✅ ${archivo} — ${lineas.length} líneas`);
}
