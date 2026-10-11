// El pedido al modelo del analista de charlas (0102, pedido de Mateo del 9/10 y 10/10): qué se le
// manda y cómo. Todo puro (sin base ni red): lo prueban tests/analista/pedido.test.ts.
//
// Dos mensajes por charla:
//  · developer: las instrucciones del analista + las reglas de Lucía (prompt.md, tal cual) + LO QUE
//    ES VERDAD (fichas de conocimiento, precios, horario y días cerrados). Es igual para todas las
//    charlas de la noche, así OpenAI lo cachea (prompt_cache_key) y cada charla paga solo lo suyo.
//  · user: la charla de ese día, con los mensajes numerados [1], [2]… para que el modelo cite por
//    número, y debajo de cada respuesta de Lucía lo que quedó en la bitácora (herramientas, controles,
//    pases al equipo). Los mensajes de antes de ese día van sin número: son contexto, ya se revisaron
//    la noche que pasaron.

import { SECCIONES } from "../_shared/enums.ts";
import type { PeticionRespuestas } from "../_shared/llm/cliente.ts";
import { esFechaValida, fechaLocal, horaLocal, nombreDia, sumarDias } from "../_shared/tiempo.ts";

// ---------- Lo que llega de la base ----------

export type Autor = "cliente" | "lucia" | "plantilla" | "equipo";

export type MensajeCharla = {
  id: string;
  at: Date;
  direccion: "entrante" | "saliente";
  tipo: string; // texto, template, image, audio…
  contenido: string | null;
  transcripcion: string | null;
  noEnviado: string | null; // mensajes.no_enviado_motivo
};

export type EventoCharla = { at: Date; tipo: string; detalle: Record<string, unknown> };

export type TurnoCliente = { inicio: Date; estado: string; tipo: string | null; creadoAt: Date };

export type CharlaDelDia = {
  conversacionId: string;
  cliente: string | null; // el nombre, si se sabe
  estado: string; // conversaciones.estado HOY (activa, derivada, cerrada)
  luciaActiva: boolean;
  libreta: Record<string, string | null>; // la ficha del cliente (leerFicha), hoy
  antes: MensajeCharla[]; // los últimos mensajes de antes de ese día, para entender de qué venían
  delDia: MensajeCharla[];
  eventos: EventoCharla[]; // eventos_agente de ese día
  turnos: TurnoCliente[];
};

export type Fragmento = { tema: string; titulo: string; texto: string };

export type DatosDeReferencia = {
  prompt: string; // prompt.md, las reglas de Lucía
  fragmentos: Fragmento[];
  catalogo: { modelo: string; precio: number }[];
  accesorios: { nombre: string; precio: number; precioCompra: number | null }[];
  calendario: string; // el horario de ese día y los 13 siguientes, ya armado (base.ts)
};

// ---------- Topes del texto de una charla ----------

// Una charla de un día rara vez pasa de 40 mensajes; si pasa de esto se mandan los últimos (y se
// avisa), para que una charla rarísima no se coma sola el tope de la noche.
export const MAXIMO_MENSAJES_DEL_DIA = 120;
export const MAXIMO_CARACTERES_POR_MENSAJE = 1_500;
export const MENSAJES_DE_CONTEXTO = 8;
const MAXIMO_CARACTERES_DE_ARGUMENTOS = 160;
const MAXIMO_CARACTERES_DE_MOTIVO = 220;

// ---------- Autor y texto de cada mensaje ----------

const MARCA_MOSTRADOR = "[mostrador] ";

export function autorDe(m: Pick<MensajeCharla, "direccion" | "tipo" | "contenido">): Autor {
  if (m.direccion === "entrante") return "cliente";
  if ((m.contenido ?? "").startsWith(MARCA_MOSTRADOR)) return "equipo";
  if (m.tipo === "template") return "plantilla";
  return "lucia";
}

const NOMBRE_AUTOR: Record<Autor, string> = {
  cliente: "Cliente",
  lucia: "Lucía",
  plantilla: "Lucía (plantilla automática)",
  equipo: "[equipo] Persona del local, desde el panel",
};

const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const enUnaLinea = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n").replace(/\n/g, " / ").trim();

// Lo que se le muestra al modelo de un mensaje (y contra lo que después se verifica la cita).
export function textoDeMensaje(m: MensajeCharla): string {
  let contenido = (m.contenido ?? "").trim();
  if (contenido.startsWith(MARCA_MOSTRADOR)) contenido = contenido.slice(MARCA_MOSTRADOR.length).trim();
  const transcripcion = (m.transcripcion ?? "").trim();
  let texto: string;
  if (transcripcion) texto = `(audio) «${transcripcion}»${contenido ? ` ${contenido}` : ""}`;
  else if (m.tipo === "image") texto = contenido ? `(foto) ${contenido}` : "(foto)";
  else if (contenido) texto = contenido;
  else texto = m.tipo && m.tipo !== "texto" ? `(${m.tipo})` : "(vacío)";
  return recortar(enUnaLinea(texto), MAXIMO_CARACTERES_POR_MENSAJE);
}

// ---------- La bitácora, en una línea por evento ----------

function argumentosCompactos(argumentos: unknown): string {
  if (!argumentos || typeof argumentos !== "object") return "";
  const partes = Object.entries(argumentos as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return recortar(partes.join(", "), MAXIMO_CARACTERES_DE_ARGUMENTOS);
}

const cadena = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function salto(s: Record<string, unknown>): string {
  const control = [cadena(s.barandilla), cadena(s.chequeo)].filter(Boolean).join("/");
  const accion = cadena(s.accion);
  const motivo = recortar(enUnaLinea(cadena(s.motivo)), MAXIMO_CARACTERES_DE_MOTIVO);
  return `control ${control || "?"}${accion ? ` (${accion})` : ""}${motivo ? `: ${motivo}` : ""}`;
}

// Etapas de la bitácora que no le dicen nada al analista (el worker que arrancó, la ficha que se
// guardó, el clasificador que ya no deriva desde el 9/10, una ráfaga sin mensajes nuevos…).
const ETAPAS_SIN_INTERES = new Set([
  "worker", "worker-lucia", "extraer", "agrupar-rafaga", "envio_programado", "mostrador", "adjuntos", "cierre-cortes",
]);

// null = no se muestra. El orden y la forma no importan para el código: es para que el modelo lea
// qué consultó Lucía y qué la frenó antes de mandar.
export function describirEvento(e: EventoCharla): string | null {
  const d = e.detalle ?? {};
  const etapa = cadena(d.etapa);
  if (e.tipo === "herramienta") {
    const nombre = cadena(d.herramienta) || "?";
    const resultado = d.ok === false
      ? `rechazada${cadena(d.rechazo) ? ` (${cadena(d.rechazo)})` : ""}${cadena(d.error) ? `: ${recortar(cadena(d.error), 120)}` : ""}`
      : "ok";
    return `herramienta ${nombre}(${argumentosCompactos(d.argumentos)}) → ${resultado}`;
  }
  if (e.tipo === "derivacion") {
    return `pasó la charla al equipo · motivo ${cadena(d.motivo) || "?"}${cadena(d.origen) ? ` (lo decidió: ${cadena(d.origen)})` : ""}`;
  }
  if (etapa && ETAPAS_SIN_INTERES.has(etapa)) return null;
  if (e.tipo === "error") {
    if (Array.isArray(d.saltos) && d.saltos.length) {
      const saltos = (d.saltos as Record<string, unknown>[]).map(salto).join(" · ");
      return `primer intento rehecho por los controles · ${saltos}`;
    }
    if (cadena(d.barandilla)) return salto(d);
    if (etapa === "principal") {
      return `el modelo no terminó la respuesta${cadena(d.motivo) ? ` (${cadena(d.motivo)})` : ""}`;
    }
    const error = cadena(d.error);
    return error ? `error en ${etapa || "el turno"}: ${recortar(enUnaLinea(error), MAXIMO_CARACTERES_DE_MOTIVO)}` : null;
  }
  if (e.tipo === "pensamiento") {
    if (etapa === "clasificar") {
      return d.derivar_duro === true ? `clasificador: derivar (${cadena(d.motivo_derivacion) || "?"})` : null;
    }
    const nota = cadena(d.porQue) || cadena(d.nota);
    if (!nota) return null;
    return `nota (${etapa || "turno"}): ${recortar(enUnaLinea(nota), MAXIMO_CARACTERES_DE_MOTIVO)}`;
  }
  return null;
}

// ---------- La charla de un día, numerada ----------

export type MensajeNumerado = { numero: number; id: string; autor: Autor; texto: string };

export type CharlaArmada = {
  texto: string;
  numerados: MensajeNumerado[]; // solo los del día: lo único que se puede citar
  recortados: number; // mensajes del día que no entraron (los primeros)
};

const NOMBRE_CAMPO_LIBRETA: Record<string, string> = {
  nombre: "nombre", evento: "evento", fecha_evento: "fecha del evento", rol: "rol", dia_o_noche: "día o noche",
  talle_aprox: "talle", ciudad: "ciudad", color_preferido: "color preferido",
  presupuesto_mencionado: "presupuesto que mencionó", email: "mail",
};

function diaYHora(at: Date, tz: string): string {
  const [, m, d] = fechaLocal(at, tz).split("-").map(Number);
  return `${d}/${m} ${horaLocal(at, tz)}`;
}

function fechaLargaYmd(ymd: string): string {
  const [a, m, d] = ymd.split("-").map(Number);
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${nombreDia(new Date(Date.UTC(a, m - 1, d)).getUTCDay())} ${d} de ${meses[m - 1]} de ${a}`;
}

export function armarCharla(c: CharlaDelDia, fecha: string, tz: string): CharlaArmada {
  const delDia = [...c.delDia].sort((a, b) => a.at.getTime() - b.at.getTime());
  const recortados = Math.max(0, delDia.length - MAXIMO_MENSAJES_DEL_DIA);
  const visibles = delDia.slice(recortados);

  const lineas: string[] = [];
  lineas.push(`CHARLA DEL ${fechaLargaYmd(fecha).toUpperCase()} (horas de Argentina)`);
  lineas.push(`Cliente: ${c.cliente?.trim() || "sin nombre"}. Hoy la charla está ${c.estado}${c.luciaActiva ? "" : ", con Lucía apagada"}.`);

  const libreta = Object.entries(c.libreta).filter(([, v]) => v !== null && String(v).trim() !== "");
  lineas.push("", "LIBRETA DEL CLIENTE (cómo quedó la ficha):");
  lineas.push(libreta.length ? libreta.map(([k, v]) => `- ${NOMBRE_CAMPO_LIBRETA[k] ?? k}: ${v}`).join("\n") : "- (vacía)");

  lineas.push("", "SUS TURNOS (estado de hoy):");
  lineas.push(
    c.turnos.length
      ? c.turnos.map((t) => `- ${diaYHora(t.inicio, tz)} · ${t.tipo ?? "turno"} · ${t.estado} · sacado el ${diaYHora(t.creadoAt, tz)}`).join("\n")
      : "- ninguno",
  );

  if (c.antes.length) {
    lineas.push("", "ANTES DE ESE DÍA (solo contexto: no se citan ni se revisan):");
    for (const m of c.antes) lineas.push(`· ${diaYHora(m.at, tz)} ${NOMBRE_AUTOR[autorDe(m)]}: ${textoDeMensaje(m)}`);
  }

  lineas.push("", "MENSAJES DE ESE DÍA (citá por número; las líneas «↳» son la bitácora de Lucía, no le llegan al cliente):");
  if (recortados) lineas.push(`(la charla es muy larga: se dejaron afuera los primeros ${recortados} mensajes del día)`);

  // Mensajes y bitácora en orden de tiempo: los eventos de un turno se guardan apenas salen sus
  // mensajes, así que cada «↳» queda debajo de la respuesta a la que pertenece.
  const desde = visibles[0]?.at.getTime() ?? Number.NEGATIVE_INFINITY;
  const eventos = c.eventos
    .filter((e) => e.at.getTime() >= desde || recortados === 0)
    .map((e) => ({ at: e.at, linea: describirEvento(e) }))
    .filter((e): e is { at: Date; linea: string } => e.linea !== null);
  const numerados: MensajeNumerado[] = [];
  let i = 0;
  let j = 0;
  while (i < visibles.length || j < eventos.length) {
    const tomarMensaje = j >= eventos.length || (i < visibles.length && visibles[i].at.getTime() <= eventos[j].at.getTime());
    if (tomarMensaje) {
      const m = visibles[i++];
      const autor = autorDe(m);
      const t = textoDeMensaje(m);
      const numero = numerados.length + 1;
      numerados.push({ numero, id: m.id, autor, texto: t });
      const noSalio = m.noEnviado ? ` [no le llegó al cliente: ${m.noEnviado}]` : "";
      lineas.push(`[${numero}] ${horaLocal(m.at, tz)} ${NOMBRE_AUTOR[autor]}: ${t}${noSalio}`);
    } else {
      lineas.push(`    ↳ ${eventos[j++].linea}`);
    }
  }
  if (!visibles.length) lineas.push("(sin mensajes)");
  return { texto: lineas.join("\n"), numerados, recortados };
}

// ---------- El horario, día por día ----------

// Como la lista de PRÓXIMOS DÍAS que Lucía ve en su contexto (turno/contexto.ts), pero desde el día
// de las charlas: así el analista sabe si «el lunes» abría o era feriado sin calcularlo.
export function armarCalendario(
  fecha: string,
  horario: { diaSemana: number; apertura: number; cierre: number }[],
  sinTurnos: Map<string, { motivo: string; posibleFeriado: boolean }>,
  dias = 14,
): string {
  const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
  const lineas: string[] = [];
  for (let i = 0; i < dias; i++) {
    const ymd = sumarDias(fecha, i);
    const [a, m, d] = ymd.split("-").map(Number);
    const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    const h = horario.find((x) => x.diaSemana === diaSemana);
    const dia = sinTurnos.get(ymd);
    const estado = dia && !dia.posibleFeriado
      ? `cerrado${dia.motivo ? ` (${dia.motivo})` : ""}`
      : !h
      ? "cerrado"
      : dia
      ? `posible feriado (${dia.motivo.replace(/^Feriado: /, "")}): Lucía no lo ofrece ni lo recomienda`
      : `abre de ${hm(h.apertura)} a ${hm(h.cierre)}`;
    lineas.push(`- ${nombreDia(diaSemana)} ${d}/${m}${i === 0 ? " (el día de las charlas)" : ""}: ${estado}`);
  }
  return lineas.join("\n");
}

// ---------- Las instrucciones del analista (developer) ----------

export const CATEGORIAS_ERROR = [
  "dato_falso",
  "promesa_no_cumplida",
  "derivo_sin_necesidad",
  "no_contesto",
  "no_ofrecio_turno",
  "tono",
  "regla",
] as const;
export const CATEGORIAS_MEJORA = ["dato_faltante", "frase"] as const;
export const GRAVEDADES = ["alta", "media", "baja"] as const;

// Topes de lo que se guarda por charla: los más importantes, no una lista de todo.
export const MAXIMO_ERRORES_POR_CHARLA = 5;
export const MAXIMO_MEJORAS_POR_CHARLA = 3;

export const INSTRUCCIONES_ANALISTA = `Sos el analista de calidad de Lucía, la que atiende el WhatsApp de alquiler de trajes de Mr Otto (Otto Su Misura, Rosario). Cada noche leés las charlas del día anterior, de a una, y le dejás al dueño una lista corta de lo que Lucía hizo mal y de lo que conviene mejorar. No le hablás al cliente ni a Lucía: tu lista la lee una persona del equipo, que decide qué hacer con cada punto. Vos no cambiás nada.

QUÉ TE LLEGA
1. LAS INSTRUCCIONES DE LUCÍA: el prompt que ella sigue, tal cual.
2. LO QUE ES VERDAD: las fichas de conocimiento (lo que Lucía consulta con buscar_informacion), los precios cargados (consultar_catalogo), y el horario del local con los días cerrados (lo que Lucía ve en su contexto y en buscar_horarios). Lucía no ve todo esto junto: lo consulta con herramientas cuando lo necesita. Si algo no está acá, Lucía no tenía de dónde sacarlo.
3. Una charla: la libreta del cliente y sus turnos (como están hoy), algunos mensajes de antes como contexto, y los mensajes de ese día numerados [1], [2]… Debajo de cada respuesta de Lucía, las líneas «↳» son su bitácora: las herramientas que usó (con lo que pidió y si salió bien), los controles que frenaron o corrigieron su respuesta antes de que saliera, y si pasó la charla al equipo.

QUÉ BUSCÁS
Errores de Lucía, solo en los mensajes de ese día:
- dato_falso: afirmó algo que contradice LO QUE ES VERDAD, o dijo un precio, horario, política, talle o disponibilidad que no sale de ningún lado (lo inventó).
- promesa_no_cumplida: prometió algo que no hizo o que no puede hacer: que alguien del equipo le va a escribir sin haber pasado la charla, que le manda algo que nunca mandó, que le reservó un turno que no figura en sus turnos.
- derivo_sin_necesidad: pasó la charla al equipo cuando podía resolverla con sus herramientas o con LO QUE ES VERDAD (por un modelo o un color, un mensaje abreviado, varias preguntas juntas, un horario ocupado, un dato que estaba cargado).
- no_contesto: el cliente preguntó algo y Lucía no lo contestó, o el último mensaje del cliente quedó sin respuesta. Citá el mensaje del cliente. No cuenta un «gracias», «ok», «chau» o «muchas gracias» suelto con el que el cliente cierra: a eso Lucía no contesta a propósito, para no quedar en un ida y vuelta de agradecimientos.
- no_ofrecio_turno: ya había dado el precio o explicado cómo funciona, sabía la fecha del evento, el cliente no tenía turno, y Lucía no le ofreció buscarle uno. No cuenta si el cliente dijo que solo estaba averiguando, si ya se lo había ofrecido antes, o si el evento era dentro de dos días (eso lo resuelve el equipo).
- tono: frío, robótico, repetitivo, insistente, con cierres de relleno, con más de una pregunta, demasiado largo, o se volvió a presentar.
- regla: rompió otra de sus instrucciones (por ejemplo: sumó precios, negó algo sin buscarlo, recomendó modelos, pidió datos de tarjeta, dio otro teléfono).

Mejoras:
- dato_faltante: el cliente preguntó algo que no está en LO QUE ES VERDAD, y por eso Lucía pasó la charla, contestó a medias o tuvo que improvisar. Decí en qué ficha iría (tema) y escribí el texto para cargar: corto, en tercera persona, solo hechos, como las fichas que ya hay. Si no sabés el dato real, dejá el lugar marcado entre corchetes, por ejemplo [completar: precio del chaleco]. Nunca inventes el dato.
- frase: una respuesta de Lucía que en el fondo estuvo bien pero se puede decir mejor. Escribí cómo la dirías, en la voz de Lucía (voseo rioplatense, corto, como un WhatsApp).

CÓMO LO DECIDÍS
- La pregunta de siempre es: ¿el dato estaba cargado? Si no estaba, no es un error de Lucía: es una mejora (dato_faltante). Si estaba y no lo usó, o lo dijo mal, es un error.
- LO QUE ES VERDAD está como quedó cargado hoy: un día cerrado o una ficha pueden haberse cargado después de la charla. Si la diferencia puede venir de eso, decilo en «qué estuvo mal» en vez de darlo por seguro.
- Los controles ya arreglaron algunas cosas antes de que salieran (un precio sin consultar, una pregunta de más, una frase repetida): lo que ves en los mensajes es lo que le llegó al cliente. No anotes lo que un control corrigió bien. Pero si un control se equivocó (frenó algo que no estaba mal, por ejemplo tomó una fecha, una hora o un talle como si fuera un precio) y eso terminó mal, anotalo y decí que fue el control: si por eso la charla pasó al equipo (motivo barandilla_doble), es derivo_sin_necesidad.
- Cada vez que la charla pasó al equipo, preguntate si hacía falta.
- Si después de Lucía el equipo le contestó otra cosa (un horario que Lucía dijo que no había, un dato que ella no tenía), es una pista fuerte de que Lucía o sus datos estaban mal: miralo.
- Algunos mensajes los arma el código (la confirmación del turno con la dirección, el aviso de que pasa la charla, los recordatorios y recontactos): igual cuentan como de Lucía.
- Los mensajes «[equipo]» los escribió una persona del local: no son errores de Lucía, pero sí cuentan para saber si al cliente le contestaron.
- Cada punto cita un mensaje de ese día por su número y copia su texto tal cual, letra por letra (alcanza con la parte que importa). Sin una cita textual no hay punto. Una mejora de dato_faltante cita la pregunta del cliente.
- Exigente pero justo: la mayoría de las charlas están bien, y una charla sin problemas devuelve las dos listas vacías. No inventes problemas para llenar. Como mucho ${MAXIMO_ERRORES_POR_CHARLA} errores y ${MAXIMO_MEJORAS_POR_CHARLA} mejoras por charla: los que más importan.
- No anotes dos veces lo mismo: si un error se repite en varios mensajes, anotalo una vez, en el primero.
- gravedad: alta si le hace perder el cliente o le da un dato falso que lo perjudica (un precio, un horario, que tiene turno cuando no lo tiene); media si la charla sigue pero peor; baja si es de forma.
- Escribí en castellano rioplatense, claro y corto. Qué estuvo mal: una o dos oraciones. Qué conviene: concreto (qué cargar, qué decir, qué regla mirar).`;

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

export function armarInstrucciones(d: DatosDeReferencia): string {
  const fichas = d.fragmentos.length
    ? d.fragmentos.map((f) => `### ${f.tema} · ${f.titulo}\n${f.texto.replace(/\r\n?/g, "\n").trim()}`).join("\n\n")
    : "(no hay fichas cargadas)";
  const precios = d.catalogo.filter((c) => c.precio > 0);
  const catalogo = precios.length
    ? `El alquiler arranca en ${plata(Math.min(...precios.map((c) => c.precio)))} («a partir de»). Por modelo:\n` +
      precios.map((c) => `- ${c.modelo}: ${plata(c.precio)}`).join("\n")
    : "(no hay precios de alquiler cargados)";
  const accesorios = d.accesorios.length
    ? d.accesorios.map((a) => `- ${a.nombre}: alquiler ${plata(a.precio)}${a.precioCompra !== null ? `, compra ${plata(a.precioCompra)}` : ""}`).join("\n")
    : "(no hay accesorios cargados)";
  return [
    INSTRUCCIONES_ANALISTA,
    "",
    "=== LAS INSTRUCCIONES DE LUCÍA (su prompt, tal cual) ===",
    d.prompt.replace(/\r\n?/g, "\n").trim(),
    "=== FIN DE LAS INSTRUCCIONES DE LUCÍA ===",
    "",
    "=== LO QUE ES VERDAD ===",
    "FICHAS DE CONOCIMIENTO (sección · título):",
    fichas,
    "",
    "PRECIOS DEL ALQUILER (consultar_catalogo):",
    catalogo,
    "",
    "ACCESORIOS (consultar_catalogo con accesorios=true):",
    accesorios,
    "",
    "HORARIO DEL LOCAL Y DÍAS CERRADOS (como están cargados hoy, desde el día de las charlas):",
    d.calendario.trim() || "(sin horario cargado)",
    "=== FIN DE LO QUE ES VERDAD ===",
  ].join("\n");
}

// ---------- El esquema de la respuesta (JSON estricto) ----------

export const ESQUEMA_ANALISIS = {
  type: "object",
  properties: {
    errores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoria: { type: "string", enum: [...CATEGORIAS_ERROR] },
          gravedad: { type: "string", enum: [...GRAVEDADES] },
          mensaje: { type: "integer", description: "Número [n] del mensaje de ese día donde está el error." },
          cita: { type: "string", description: "El texto de ese mensaje, copiado tal cual (la parte que importa)." },
          que_estuvo_mal: { type: "string" },
          que_conviene: { type: "string" },
        },
        required: ["categoria", "gravedad", "mensaje", "cita", "que_estuvo_mal", "que_conviene"],
        additionalProperties: false,
      },
    },
    mejoras: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoria: { type: "string", enum: [...CATEGORIAS_MEJORA] },
          mensaje: { type: ["integer", "null"], description: "Número [n] del mensaje de ese día del que sale la mejora." },
          cita: { type: ["string", "null"], description: "El texto de ese mensaje, copiado tal cual." },
          tema: { type: ["string", "null"], enum: [...SECCIONES, null], description: "En dato_faltante, la ficha donde iría." },
          que_falto: { type: "string" },
          texto_sugerido: { type: "string" },
        },
        required: ["categoria", "mensaje", "cita", "tema", "que_falto", "texto_sugerido"],
        additionalProperties: false,
      },
    },
  },
  required: ["errores", "mejoras"],
  additionalProperties: false,
} as const;

// ---------- La petición ----------

export type Razonamiento = NonNullable<PeticionRespuestas["reasoning"]>["effort"];
const RAZONAMIENTOS: readonly Razonamiento[] = ["minimal", "low", "medium", "high"];

// Cuánto piensa el analista (LLM_RAZONAMIENTO_ANALISTA). «low» por defecto: con low el principal
// dejó de inventar (8/10) y una noche de 30 charlas queda en centavos; medium es más caro y más lento.
export function razonamientoDelAnalista(valor: string | undefined | null): Razonamiento {
  const r = (valor ?? "").trim().toLowerCase() as Razonamiento;
  return RAZONAMIENTOS.includes(r) ? r : "low";
}

// El modelo: LLM_ANALISTA y, si no está, el mismo de Lucía (pedido del 10/10).
export function modeloDelAnalista(analista: string | undefined | null, principal: string | undefined | null): string {
  return (analista ?? "").trim() || (principal ?? "").trim();
}

// Cupo de salida por charla: el razonamiento sale de acá también. La respuesta en sí es chica (como
// mucho 8 puntos); lo demás es margen para pensar. Si se pasa, el JSON llega cortado y la charla
// queda como fallo (se reintenta una vez).
export const MAXIMO_SALIDA = 8_000;
export const CLAVE_CACHE = "otto-analista";

export function armarPeticion(p: { modelo: string; instrucciones: string; charla: string; fecha: string; hoy: string; razonamiento: Razonamiento }): PeticionRespuestas {
  return {
    model: p.modelo,
    input: [
      { role: "developer", content: p.instrucciones },
      {
        role: "user",
        content: `Revisá esta charla. Las charlas son del ${fechaLargaYmd(p.fecha)}; el análisis se hace el ${fechaLargaYmd(p.hoy)}.\n\n${p.charla}`,
      },
    ],
    reasoning: { effort: p.razonamiento },
    store: false,
    prompt_cache_key: CLAVE_CACHE,
    max_output_tokens: MAXIMO_SALIDA,
    text: { format: { type: "json_schema", name: "analisis_charla", schema: ESQUEMA_ANALISIS, strict: true } },
  };
}

// ---------- El pedido HTTP a la función ----------

// Hasta cuántas veces se pide relevo una misma noche: alcanza para cientos de charlas (cada llamada
// analiza 6 a 12), y si algo anda mal la cadena no sigue para siempre.
export const MAXIMO_RELEVOS = 30;

export type PedidoNoche = { fecha: string; relevo: number };

// { fecha?: 'AAAA-MM-DD', relevo?: n }. Sin fecha, ayer en hora de Argentina (el cron de las 03:00).
// Solo días que ya terminaron: una charla analizada a la mitad del día no se vuelve a mirar.
export function leerPedido(cuerpo: unknown, ahora: Date, tz: string): PedidoNoche | { error: string } {
  const c = cuerpo && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>) : {};
  const hoy = fechaLocal(ahora, tz);
  let fecha = sumarDias(hoy, -1);
  if (c.fecha !== undefined && c.fecha !== null && c.fecha !== "") {
    if (typeof c.fecha !== "string" || !esFechaValida(c.fecha)) return { error: "fecha tiene que ser AAAA-MM-DD" };
    if (c.fecha >= hoy) return { error: `solo se analizan días que ya terminaron (hoy es ${hoy})` };
    fecha = c.fecha;
  }
  let relevo = 0;
  if (c.relevo !== undefined && c.relevo !== null) {
    if (typeof c.relevo !== "number" || !Number.isInteger(c.relevo) || c.relevo < 0) return { error: "relevo tiene que ser un entero" };
    relevo = c.relevo;
  }
  return { fecha, relevo };
}
