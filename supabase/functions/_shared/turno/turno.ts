// El turno completo de Lucía (AGENTE.md § 3, pasos 3 a 11). Lo llaman probar-agente (H1.7, sin
// Meta) y, en Fase 2, el worker real (logica): el mismo código, dos entradas.
//
// Esto es la ORQUESTA; cada pieza vive en su propio archivo y ya tiene sus tests propios:
// derivación dura por código (derivacion_dura.ts), clasificador y extractor (../llm/), el
// bucle de herramientas (../llm/principal.ts), barandillas (../barandillas/), traza y
// herramientas (../herramientas/). Acá se decide el ORDEN y qué hacer con lo que devuelve cada
// una — nada de lógica de negocio nueva.
//
// Motivo cuando deriva una barandilla (supuesto, sin categoría propia en el enum):
// `anuncia_sin_derivar` (Lucía anunció un pase sin ejecutarlo) → 'pide_persona', el bucket más
// cercano a "alguien va a hablar con una persona". Dos saltos del mismo turno → 'barandilla_doble'.

import { aplicarBarandillas } from "../barandillas/index.ts";
import type { Db } from "../db.ts";
import type { MotivoDerivacion } from "../enums.ts";
import { actualizarFicha, leerFicha } from "../herramientas/ficha.ts";
import { registrarDerivacion, textoDeContexto } from "../herramientas/derivacion.ts";
import { definicionesParaElModelo } from "../herramientas/index.ts";
import type { Calendario } from "../herramientas/tipos.ts";
import { clasificar } from "../llm/clasificador.ts";
import { extraer } from "../llm/extractor.ts";
import { correrPrincipal, type LlamadaLlm, type MensajeLlm, type ResultadoPrincipal } from "../llm/principal.ts";
import { contextoDeHerramientas } from "./contexto_herramientas.ts";
import { armarContextoDelTurno } from "./contexto.ts";
import { derivacionDuraPorEventoInminente, derivacionDuraPorPalabraClave } from "./derivacion_dura.ts";
import { leerHistorial, ultimasLineasParaClasificar, type MensajeChat } from "./historial.ts";
import { agruparRafaga } from "./rafaga.ts";
import { eventosDeLaTraza, registrarConsumo, registrarEventos, type EventoAgente } from "./bitacora.ts";

export const LIMITE_TURNO_MS = 25_000;
const CLAVE_TEXTO_DERIVACION_DURA = "texto_derivacion_dura_generica";
const MOTIVOS_SIN_MENSAJE_PROPIO: readonly MotivoDerivacion[] = ["reclamo", "sin_respuesta", "timeout", "barandilla_doble"];

export type ResultadoTurno = {
  mensajesAlCliente: string[];
  imagenes: string[];
  derivo: boolean;
  motivoDerivacion?: MotivoDerivacion;
  avisoEquipo?: { motivo: string; derivacionId: string };
  bloqueadoPorVentana: boolean;
};

// Meta parte el texto en burbujas por doble salto de línea (AGENTE.md § 3 paso 9). El emulador
// no manda nada por WhatsApp, pero devuelve las mismas burbujas que mandaría el worker real.
function enBurbujas(texto: string | null | undefined): string[] {
  if (!texto) return [];
  return texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

async function derivar(
  db: Db,
  p: { conversacionId: string; motivo: MotivoDerivacion; mensaje: string | null; derivacionTel: string | null },
): Promise<ResultadoTurno> {
  const { id } = await registrarDerivacion({ db, conversacionId: p.conversacionId, derivacionTel: p.derivacionTel }, p.motivo);
  const mensajesAlCliente = MOTIVOS_SIN_MENSAJE_PROPIO.includes(p.motivo) ? [] : enBurbujas(p.mensaje);
  return { mensajesAlCliente, imagenes: [], derivo: true, motivoDerivacion: p.motivo, avisoEquipo: { motivo: p.motivo, derivacionId: id }, bloqueadoPorVentana: false };
}

let promptCacheado: string | null = null;
async function leerPrompt(): Promise<string> {
  if (promptCacheado !== null) return promptCacheado;
  promptCacheado = await Deno.readTextFile(new URL("../prompt.md", import.meta.url));
  return promptCacheado;
}

// El caller (probar-agente, y en Fase 2 el worker) solo tiene que insertar el mensaje entrante
// en `mensajes` ANTES de llamar a esto: el paso 3 (agrupar_rafaga) y el corte del historial se
// resuelven acá adentro, sobre la base, para que los dos entren siempre exactamente igual.
export type ParametrosTurno = {
  clienteId: string;
  telefono: string;
  conversacionId: string;
  ahora: Date;
  tz: string;
  calendario: Calendario;
  derivacionTel: string | null;
  fetcher?: typeof fetch;
};

export async function correrTurno(db: Db, p: ParametrosTurno): Promise<ResultadoTurno> {
  const limiteMs = Date.now() + LIMITE_TURNO_MS;
  const eventos: EventoAgente[] = [];
  const llamadasLlm: LlamadaLlm[] = [];
  let resultado: ResultadoTurno | undefined;
  // Se llena en el try (queda [] si derivó por código antes de leer historial); lo usa el
  // extractor en el finally, con la charla completa y no solo el último intercambio (ver ahí).
  let historial: MensajeChat[] = [];

  // Paso 3 — agrupar ráfaga: todo lo que el cliente mandó desde la última respuesta de Lucía
  // (o desde el principio) hasta ahora, ya insertado en `mensajes` por quien llamó a esto.
  const rafaga = await agruparRafaga(db, p.conversacionId, p.ahora);
  const mensaje = rafaga.texto;
  const ultimoMensajeClienteAt = rafaga.ultimoEnviadoAt ?? p.ahora;

  try {
    if (!mensaje) {
      eventos.push({ tipo: "error", detalle: { etapa: "agrupar-rafaga", error: "no había ningún mensaje entrante nuevo para contestar" } });
      resultado = { mensajesAlCliente: [], imagenes: [], derivo: false, bloqueadoPorVentana: false };
      return resultado;
    }

    // Paso 4a — derivación dura por código: palabra clave en el mensaje, o el evento ya sabido
    // hoy/mañana (decisión #8). Antes de gastar un solo token.
    const ficha = await leerFicha(db, p.clienteId);
    const dura = derivacionDuraPorPalabraClave(mensaje) ?? derivacionDuraPorEventoInminente(ficha.fecha_evento, p.ahora, p.tz);
    if (dura) {
      eventos.push({ tipo: "pensamiento", detalle: { etapa: "derivacion-dura-codigo", motivo: dura.motivo, porQue: dura.porQue } });
      const texto = await textoDeContexto(db, CLAVE_TEXTO_DERIVACION_DURA);
      resultado = await derivar(db, { conversacionId: p.conversacionId, motivo: dura.motivo, mensaje: texto, derivacionTel: p.derivacionTel });
      eventos.push({ tipo: "derivacion", detalle: { motivo: dura.motivo, derivacion_id: resultado.avisoEquipo?.derivacionId, origen: "codigo" } });
      return resultado;
    }

    // Paso 4b — el clasificador, red para la intención de derivar cuando no hay palabra clave.
    historial = await leerHistorial(db, p.conversacionId, rafaga.desde);
    const clasificacion = await clasificar(ultimasLineasParaClasificar(historial, mensaje), p.fetcher);
    if (!clasificacion) {
      eventos.push({ tipo: "error", detalle: { etapa: "clasificar", error: "sin respuesta del clasificador; se sigue sin derivar por esta vía" } });
    } else {
      eventos.push({ tipo: "pensamiento", detalle: { etapa: "clasificar", ...clasificacion.clasificacion } });
      llamadasLlm.push({
        modelo: Deno.env.get("LLM_CLASIFICADOR") ?? "",
        uso: { tokensIn: clasificacion.tokensIn, tokensOut: clasificacion.tokensOut, tokensCacheados: clasificacion.tokensCacheados },
        ms: clasificacion.ms,
      });
      if (clasificacion.clasificacion.derivar_duro && clasificacion.clasificacion.motivo_derivacion) {
        const motivo = clasificacion.clasificacion.motivo_derivacion;
        const texto = await textoDeContexto(db, CLAVE_TEXTO_DERIVACION_DURA);
        resultado = await derivar(db, { conversacionId: p.conversacionId, motivo, mensaje: texto, derivacionTel: p.derivacionTel });
        eventos.push({ tipo: "derivacion", detalle: { motivo, derivacion_id: resultado.avisoEquipo?.derivacionId, origen: "clasificador" } });
        return resultado;
      }
    }

    // Paso 5 — armar contexto, y paso 6 — el principal con herramientas.
    const [contextoTexto, prompt, herramientas] = await Promise.all([
      armarContextoDelTurno(db, { clienteId: p.clienteId, ahora: p.ahora, tz: p.tz }),
      leerPrompt(),
      definicionesParaElModelo(db),
    ]);
    const mensajesLlm: MensajeLlm[] = [
      { role: "system", content: prompt },
      { role: "system", content: contextoTexto },
      ...historial,
      { role: "user", content: mensaje },
    ];
    const ctxHerramientas = contextoDeHerramientas({
      db, tz: p.tz, cliente: { id: p.clienteId, telefono: p.telefono }, conversacionId: p.conversacionId,
      ahora: p.ahora, calendario: p.calendario, derivacionTel: p.derivacionTel,
    });

    let r = await correrPrincipal({ mensajes: mensajesLlm, herramientas, ctxHerramientas, limiteMs, fetcher: p.fetcher });
    llamadasLlm.push(...r.llamadasLlm);

    // ¿Alguna herramienta ya cortó el turno (derivar_a_persona, o evento_inminente adentro del
    // loop)? El aviso de a quién y por qué ya lo trae el efecto: no hay barandilla que aplicarle
    // a un texto que ya salió por una tool, y el texto propio de Lucía (si escribió antes de
    // llamarla) se manda igual, antes de la despedida armada en código.
    const efectoQueCorta = r.efectos.find((e) => e.cortaTurno);
    if (efectoQueCorta) {
      eventos.push(...eventosDeLaTraza(ctxHerramientas.traza));
      if (efectoQueCorta.avisoEquipo) {
        eventos.push({ tipo: "derivacion", detalle: { motivo: efectoQueCorta.avisoEquipo.motivo, derivacion_id: efectoQueCorta.avisoEquipo.derivacionId, origen: "herramienta" } });
      }
      resultado = {
        mensajesAlCliente: [...enBurbujas(r.textoFinal), ...r.efectos.flatMap((e) => e.mensajesAlCliente ?? [])],
        imagenes: r.efectos.flatMap((e) => e.imagenes ?? []),
        derivo: true,
        motivoDerivacion: efectoQueCorta.avisoEquipo?.motivo as MotivoDerivacion | undefined,
        avisoEquipo: efectoQueCorta.avisoEquipo,
        bloqueadoPorVentana: false,
      };
      return resultado;
    }

    // Sin corte de ninguna herramienta: o hay texto para pasar por las barandillas, o no hay
    // nada de nada (principio 8: eso no es un final válido).
    const sinRespuesta = (motivoSiEsAsi: MotivoDerivacion) => {
      eventos.push(...eventosDeLaTraza(ctxHerramientas.traza));
      eventos.push({ tipo: "error", detalle: { etapa: "principal", motivo: motivoSiEsAsi, agotoIteraciones: r.agotoIteraciones, seCortoPorTiempo: r.seCortoPorTiempo } });
      return derivar(db, { conversacionId: p.conversacionId, motivo: motivoSiEsAsi, mensaje: null, derivacionTel: p.derivacionTel }).then((res) => {
        eventos.push({ tipo: "derivacion", detalle: { motivo: motivoSiEsAsi, derivacion_id: res.avisoEquipo?.derivacionId } });
        return res;
      });
    };
    if (r.textoFinal === null) {
      resultado = await sinRespuesta(r.seCortoPorTiempo ? "timeout" : "sin_respuesta");
      return resultado;
    }

    // Paso 8 — barandillas sobre lo que escribió Lucía. Hasta un "rehacer".
    const evaluar = (texto: string, saltosPrevios: number) =>
      aplicarBarandillas({ texto, traza: ctxHerramientas.traza, ahora: p.ahora, ultimoMensajeClienteAt }, { saltosPrevios });

    let b = await evaluar(r.textoFinal, 0);
    if (b.decision === "rehacer") {
      eventos.push({ tipo: "error", detalle: { etapa: "barandilla", saltos: b.saltos, instruccion: b.instruccion } });
      const r2 = await correrPrincipal({
        mensajes: [...r.mensajes, { role: "system", content: `CORRECCIÓN INTERNA, no se la muestres al cliente ni la menciones: ${b.instruccion}` }],
        herramientas, ctxHerramientas, limiteMs, iteracionesYaUsadas: r.iteracionesUsadas, fetcher: p.fetcher,
      });
      llamadasLlm.push(...r2.llamadasLlm);
      r = { ...r2, efectos: [...r.efectos, ...r2.efectos] } as ResultadoPrincipal;

      if (r.textoFinal === null) {
        resultado = await sinRespuesta(r.seCortoPorTiempo ? "timeout" : "sin_respuesta");
        return resultado;
      }
      b = await evaluar(r.textoFinal, 1);
    }
    eventos.push(...eventosDeLaTraza(ctxHerramientas.traza));
    for (const s of b.saltos) eventos.push({ tipo: "error", detalle: { etapa: "barandilla", barandilla: s.barandilla, accion: s.accion, motivo: s.motivo } });

    const efectosMensajes = r.efectos.flatMap((e) => e.mensajesAlCliente ?? []);
    const imagenes = r.efectos.flatMap((e) => e.imagenes ?? []);

    if (b.decision === "bloquear") {
      resultado = { mensajesAlCliente: [], imagenes: [], derivo: false, bloqueadoPorVentana: true };
      return resultado;
    }
    if (b.decision === "derivar") {
      const motivo: MotivoDerivacion = b.ejecutarDerivacion ? "pide_persona" : "barandilla_doble";
      resultado = await derivar(db, { conversacionId: p.conversacionId, motivo, mensaje: b.ejecutarDerivacion ? b.texto : null, derivacionTel: p.derivacionTel });
      eventos.push({ tipo: "derivacion", detalle: { motivo, derivacion_id: resultado.avisoEquipo?.derivacionId, origen: "barandilla" } });
      return resultado;
    }

    resultado = { mensajesAlCliente: [...enBurbujas(b.texto), ...efectosMensajes], imagenes, derivo: false, bloqueadoPorVentana: false };
    return resultado;
  } finally {
    // Paso 9 (la parte de guardar; el envío real por Meta lo hace el worker, no esto) — cada
    // burbuja como su propia fila 'saliente', para que el próximo turno de esta charla la vea
    // en el historial. Timestamps crecientes a mano: dos inserts seguidos pueden caer en el
    // mismo now() de la base, y el id (uuid) no sirve de desempate porque no es secuencial.
    if (resultado && resultado.mensajesAlCliente.length) {
      let t = Date.now();
      for (const texto of resultado.mensajesAlCliente) {
        t += 10;
        await db.consulta(
          "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'saliente', 'texto', $2, $3::timestamptz)",
          [p.conversacionId, texto, new Date(t).toISOString()],
        );
      }
    }

    // Paso 10 — extraer. Con la charla COMPLETA hasta acá, no solo el último intercambio: un
    // dato que el cliente dijo dos turnos atrás (p.ej. "me caso en octubre") tiene que seguir
    // pesando cuando el turno de ahora no lo repite ("es de noche, en un salón"), o el extractor
    // adivina sin contexto y puede llegar a PISAR un campo que ya estaba bien con una suposición
    // (pasó de verdad probando esto: "evento" cambió de casamiento a fiesta en el turno 3, que
    // no volvía a nombrar el casamiento). No bloquea ni rompe el turno si falla.
    try {
      const textoLucia = resultado ? resultado.mensajesAlCliente.join("\n") : "";
      const turnoActual = `Cliente: ${mensaje}` + (textoLucia ? `\nLucía: ${textoLucia}` : "");
      const turnoTexto = [...historial.map((m) => `${m.role === "user" ? "Cliente" : "Lucía"}: ${m.content}`), turnoActual].join("\n");
      const extraccion = await extraer(turnoTexto, p.fetcher);
      if (!extraccion) {
        eventos.push({ tipo: "error", detalle: { etapa: "extraer", error: "sin respuesta del extractor" } });
      } else {
        llamadasLlm.push({
          modelo: Deno.env.get("LLM_EXTRACTOR") ?? "",
          uso: { tokensIn: extraccion.tokensIn, tokensOut: extraccion.tokensOut, tokensCacheados: extraccion.tokensCacheados },
          ms: extraccion.ms,
        });
        if (Object.keys(extraccion.ficha).length > 0) {
          const campos = await actualizarFicha(db, p.clienteId, extraccion.ficha);
          if (campos.length) eventos.push({ tipo: "pensamiento", detalle: { etapa: "extraer", guardado: campos } });
        }
        if (extraccion.descartados.length) eventos.push({ tipo: "error", detalle: { etapa: "extraer", descartados: extraccion.descartados } });
      }
    } catch (e) {
      eventos.push({ tipo: "error", detalle: { etapa: "extraer", error: String((e as Error)?.message ?? e) } });
    }

    // Paso 11 — bitácora. Siempre, pase lo que pase arriba.
    await registrarEventos(db, p.conversacionId, eventos);
    await registrarConsumo(db, p.conversacionId, llamadasLlm);
  }
}
