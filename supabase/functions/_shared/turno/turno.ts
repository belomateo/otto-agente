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
import {
  CLAVE_TEXTO_DERIVACION_DURA_GENERICA,
  CLAVE_TEXTO_DERIVACION_FALLO,
  CLAVE_TEXTO_DERIVACION_RECLAMO,
  registrarDerivacion,
  textoDeContexto,
  textoDeDerivacion,
} from "../herramientas/derivacion.ts";
import { definicionesParaElModelo } from "../herramientas/index.ts";
import type { Calendario } from "../herramientas/tipos.ts";
import { clasificar } from "../llm/clasificador.ts";
import { extraer } from "../llm/extractor.ts";
import { correrPrincipal, type ContenidoLlm, type LlamadaLlm, type MensajeLlm, type ResultadoPrincipal } from "../llm/principal.ts";
import { trazaNueva } from "../traza.ts";
import type { AccesoStorage } from "../whatsapp/medios.ts";
import { contextoDeHerramientas } from "./contexto_herramientas.ts";
import { armarContextoDelTurno } from "./contexto.ts";
import { derivacionDuraPorEventoInminente, derivacionDuraPorPalabraClave } from "./derivacion_dura.ts";
import { leerHistorial, ultimasLineasParaClasificar, type MensajeChat } from "./historial.ts";
import { agruparRafaga, MAXIMO_CARACTERES_RAFAGA } from "./rafaga.ts";
import { eventosDeLaTraza, registrarConsumo, registrarEventos, type EventoAgente } from "./bitacora.ts";
import { prepararParaEnviar } from "../whatsapp/preparar.ts";

export const LIMITE_TURNO_MS = 25_000;
const CLAVE_TEXTO_MENSAJE_NO_SOPORTADO = "texto_mensaje_no_soportado";
// Pedido de Mateo, 19/9: un adjunto que TODAVÍA se está bajando no es un error (bajarMediosPendientes,
// en el worker, le pone un tope de tiempo/cantidad al turno) — decir "no pude leerlo" acá sería
// mentir, porque sí se va a leer. No necesita respaldo en código como los textos de derivación
// (textoDeDerivacion): si la fila queda vacía, como mucho no se manda nada, la charla sigue sin
// pausar y el cliente puede volver a escribir — mismo criterio que texto_mensaje_no_soportado.
const CLAVE_TEXTO_ADJUNTO_PENDIENTE = "texto_adjunto_pendiente";
// Pedido de Mateo, 19/9: toda derivación le tiene que dejar algo al cliente, no importa quién la
// haya decidido. Estos dos motivos, en cambio, son la excepción a propósito: es el CLIENTE el
// que dejó de escribir (sin_respuesta/timeout), así que "en breve te contestan" sería un mensaje
// no pedido — y si ya pasaron 24 hs, Meta lo rechaza igual (fuera_ventana_meta). Quedan mudos
// hasta que Mateo decida lo contrario; si dice que sí, se agrega con una plantilla aprobada, no
// con texto libre. No confundir con MOTIVOS_SIN_MENSAJE de _shared/enums.ts: esa otra es sobre
// la despedida que ESCRIBE EL MODELO al llamar derivar_a_persona (otra lista, para una pregunta
// parecida, resuelta ahí con texto fijo en vez de silencio — ver derivar_a_persona.ts).
const MOTIVOS_QUE_QUEDAN_MUDOS: readonly MotivoDerivacion[] = ["sin_respuesta", "timeout"];
// reclamo/cliente_enojado: mismo texto fijo, decida esto el código (palabra clave o
// clasificador) o el modelo por derivar_a_persona.ts — para que la charla se vea igual del lado
// del cliente sin importar quién detectó el motivo.
const MOTIVOS_CON_TEXTO_RECLAMO: readonly MotivoDerivacion[] = ["reclamo", "cliente_enojado"];
// barandilla_doble: dos saltos del mismo turno son un problema DEL SISTEMA (Lucía no logró
// escribir algo que pasara las barandillas), no del cliente ni de su reclamo — texto propio, con
// tono de disculpa, en vez del genérico o el de reclamo.
const MOTIVOS_CON_TEXTO_FALLO: readonly MotivoDerivacion[] = ["barandilla_doble"];

export type ResultadoTurno = {
  mensajesAlCliente: string[];
  imagenes: string[];
  derivo: boolean;
  motivoDerivacion?: MotivoDerivacion;
  avisoEquipo?: { motivo: string; derivacionId: string };
  bloqueadoPorVentana: boolean;
};

// Invariante (pedido de Mateo, 19/9): si el turno deriva (derivo === true), mensajesAlCliente
// tiene que tener algo — salvo tres excepciones documentadas: la ventana de Meta cerrada
// (bloqueadoPorVentana, más abajo: ahí ni siquiera se intenta y derivo queda false), y
// sin_respuesta/timeout (MOTIVOS_QUE_QUEDAN_MUDOS, arriba). Antes el silencio era la respuesta
// por defecto para varios motivos y una despedida vacía del modelo; ahora es al revés: el
// silencio es la excepción, documentada acá, y todo lo demás manda un texto fijo aprobado si no
// hay uno propio que valga.
async function derivar(
  db: Db,
  p: { conversacionId: string; motivo: MotivoDerivacion; mensaje: string | null; derivacionTel: string | null },
): Promise<ResultadoTurno> {
  const { id } = await registrarDerivacion({ db, conversacionId: p.conversacionId, derivacionTel: p.derivacionTel }, p.motivo);
  let mensajesAlCliente: string[];
  if (MOTIVOS_QUE_QUEDAN_MUDOS.includes(p.motivo)) {
    mensajesAlCliente = [];
  } else {
    const clave = MOTIVOS_CON_TEXTO_RECLAMO.includes(p.motivo)
      ? CLAVE_TEXTO_DERIVACION_RECLAMO
      : MOTIVOS_CON_TEXTO_FALLO.includes(p.motivo)
      ? CLAVE_TEXTO_DERIVACION_FALLO
      : null;
    if (clave) {
      // textoDeDerivacion nunca devuelve vacío: si la fila de contexto_agente está en blanco, cae
      // al respaldo de código (hallazgo de logica, 19/9) en vez de repetir el silencio que se
      // acaba de cerrar. usoRespaldo solo se loguea (no hay a quién devolvérselo desde acá: esta
      // derivación la decidió el código, no una herramienta con `datos` propio).
      const { texto, usoRespaldo } = await textoDeDerivacion(db, clave);
      if (usoRespaldo) console.error(`derivar(${p.motivo}): la fila de contexto_agente (${clave}) está vacía, se usó el respaldo de código`);
      mensajesAlCliente = prepararParaEnviar([texto]);
    } else {
      mensajesAlCliente = prepararParaEnviar([p.mensaje]);
    }
  }
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
  // El prompt ya armado. Lo manda el worker, que lo saca de la base (prompt_vigente(), 0050) para
  // que lo que la dueña edita en el panel le llegue a Lucía sin volver a publicar. Si no viene, se
  // usa el prompt.md que viaja adentro de la función.
  prompt?: string;
  // El bucket privado de adjuntos (mismo `d.adjuntos` que ya usa el worker para las fotos del
  // mostrador), para leer los audios/imágenes que mandó el cliente (medios.ts). Sin esto (el
  // emulador no tiene Storage ni Meta), cualquier adjunto queda como "no legible" — mismo
  // comportamiento que antes del 19/9.
  acceso?: AccesoStorage;
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
  // (o desde el principio) hasta ahora, ya insertado en `mensajes` por quien llamó a esto. Desde
  // el 19/9 esto también transcribe audios y prepara imágenes (rafaga.ts): sale con lo que hay
  // para pasarle al modelo, y lo que costó (llamadasLlm) para la bitácora.
  const rafaga = await agruparRafaga(db, p.conversacionId, p.ahora, { acceso: p.acceso, fetcher: p.fetcher });
  const mensaje = rafaga.texto;
  const hayImagenes = rafaga.imagenes.length > 0;
  const ultimoMensajeClienteAt = rafaga.ultimoEnviadoAt ?? p.ahora;
  llamadasLlm.push(...rafaga.llamadasLlm);
  if (rafaga.recortada) {
    eventos.push({ tipo: "error", detalle: { etapa: "agrupar-rafaga", error: `ráfaga recortada a ${MAXIMO_CARACTERES_RAFAGA} caracteres antes del clasificador y el principal` } });
  }
  if (rafaga.hayAdjuntoNoLegible) {
    eventos.push({ tipo: "pensamiento", detalle: { etapa: "adjuntos", nota: "algún adjunto de esta ráfaga no se pudo leer (tipo no soportado, bajada fallida o transcripción vacía)" } });
  }
  if (rafaga.adjuntosDeMas > 0) {
    eventos.push({ tipo: "pensamiento", detalle: { etapa: "adjuntos", nota: `${rafaga.adjuntosDeMas} adjunto(s) de más en la ráfaga, no procesados (tope por turno)` } });
  }

  try {
    if (!mensaje && !hayImagenes) {
      // Pedido de Mateo, 19/9: un adjunto que TODAVÍA se está bajando no es un error — el worker
      // le puso un tope de tiempo/cantidad a bajarMediosPendientes, y este va a estar listo en el
      // turno que viene. Decir "no pude leerlo" acá sería mentir.
      if (rafaga.hayAdjuntoPendiente) {
        eventos.push({ tipo: "pensamiento", detalle: { etapa: "adjuntos", nota: "adjunto todavía bajándose: se lee en el próximo turno, no es un error" } });
        const texto = await textoDeContexto(db, CLAVE_TEXTO_ADJUNTO_PENDIENTE);
        resultado = { mensajesAlCliente: prepararParaEnviar([texto]), imagenes: [], derivo: false, bloqueadoPorVentana: false };
        return resultado;
      }
      // Supuesto #33: llegó algo (sticker, ubicación, un adjunto que no se pudo leer...) pero no
      // hay nada de texto ni imagen para leer — no es lo mismo que "no pasó nada" (rafaga.
      // soloNoTexto lo distingue). No tiene sentido gastar el clasificador ni el principal en
      // esto: no hay una palabra que entender, así que el texto es fijo, en código, como el de
      // una derivación dura.
      if (rafaga.soloNoTexto) {
        eventos.push({ tipo: "pensamiento", detalle: { etapa: "no-es-texto", nota: "mensaje entrante sin nada legible: contesta con el texto fijo, sin pasar por el modelo" } });
        const texto = await textoDeContexto(db, CLAVE_TEXTO_MENSAJE_NO_SOPORTADO);
        resultado = { mensajesAlCliente: prepararParaEnviar([texto]), imagenes: [], derivo: false, bloqueadoPorVentana: false };
        return resultado;
      }
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
      const { texto, usoRespaldo } = await textoDeDerivacion(db, CLAVE_TEXTO_DERIVACION_DURA_GENERICA);
      if (usoRespaldo) eventos.push({ tipo: "error", detalle: { etapa: "derivacion-dura-codigo", error: `contexto_agente.${CLAVE_TEXTO_DERIVACION_DURA_GENERICA} está vacío, se usó el respaldo de código` } });
      resultado = await derivar(db, { conversacionId: p.conversacionId, motivo: dura.motivo, mensaje: texto, derivacionTel: p.derivacionTel });
      eventos.push({ tipo: "derivacion", detalle: { motivo: dura.motivo, derivacion_id: resultado.avisoEquipo?.derivacionId, origen: "codigo" } });
      return resultado;
    }

    // Paso 4b — el clasificador, red para la intención de derivar cuando no hay palabra clave.
    historial = await leerHistorial(db, p.conversacionId, rafaga.desde);
    // Sin nada antes de esta ráfaga, es la primera vez que Lucía le contesta algo en esta charla
    // (hallazgo M2 del tester, 15/9: lo usa presentacion_repetida para no dejar que se vuelva a
    // presentar en un mensaje que no es el primero).
    const esPrimerMensaje = historial.length === 0;
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
        const { texto, usoRespaldo } = await textoDeDerivacion(db, CLAVE_TEXTO_DERIVACION_DURA_GENERICA);
        if (usoRespaldo) eventos.push({ tipo: "error", detalle: { etapa: "clasificar", error: `contexto_agente.${CLAVE_TEXTO_DERIVACION_DURA_GENERICA} está vacío, se usó el respaldo de código` } });
        resultado = await derivar(db, { conversacionId: p.conversacionId, motivo, mensaje: texto, derivacionTel: p.derivacionTel });
        eventos.push({ tipo: "derivacion", detalle: { motivo, derivacion_id: resultado.avisoEquipo?.derivacionId, origen: "clasificador" } });
        return resultado;
      }
    }
    // venta_sin_resolver.ts la necesita: la única barandilla que mira la intención del
    // clasificador en vez del texto o la traza de herramientas (pedido de logica, 20/9).
    const intencion = clasificacion?.clasificacion.intencion ?? null;

    // Paso 5 — armar contexto, y paso 6 — el principal con herramientas.
    const [contexto, prompt, herramientas] = await Promise.all([
      armarContextoDelTurno(db, { clienteId: p.clienteId, ahora: p.ahora, tz: p.tz }),
      p.prompt ?? leerPrompt(),
      definicionesParaElModelo(db),
    ]);
    // Pedido de Mateo, 19/9: que Lucía vea las fotos que manda el cliente. Con imágenes, el
    // mensaje del cliente pasa de string a un array de bloques (formato de visión de Chat
    // Completions): el texto primero, y por cada imagen su epígrafe (si el cliente puso uno) y
    // la imagen en base64 — el bucket de adjuntos es privado, no hay para qué generarle una URL
    // firmada a OpenAI (rafaga.ts ya la arma como data: URI).
    const mensajeDelCliente: MensajeLlm = hayImagenes
      ? {
        role: "user",
        content: [
          ...(mensaje ? [{ type: "text" as const, text: mensaje }] : []),
          ...rafaga.imagenes.flatMap((img) => [
            ...(img.epigrafe ? [{ type: "text" as const, text: `(el cliente mandó esta foto con el comentario: "${img.epigrafe}")` }] : []),
            { type: "image_url" as const, image_url: { url: img.url } },
          ]),
        ],
      }
      : { role: "user", content: mensaje };
    const mensajesLlm: MensajeLlm[] = [
      { role: "system", content: prompt },
      { role: "system", content: contexto.texto },
      ...historial,
      mensajeDelCliente,
    ];
    // traza.ts y horario_sin_herramienta.ts prometen horasDevueltas sembrada con los turnos del
    // cliente y el horario de hoy que ya le pasamos en el contexto: si el modelo repite una hora
    // que ya leyó ahí (p.ej. contestando "¿a qué hora era mi turno?"), no es un horario inventado.
    const traza = { ...trazaNueva(), horasDevueltas: contexto.horas };
    const ctxHerramientas = contextoDeHerramientas({
      db, tz: p.tz, cliente: { id: p.clienteId, telefono: p.telefono }, conversacionId: p.conversacionId,
      ahora: p.ahora, calendario: p.calendario, derivacionTel: p.derivacionTel, traza,
    });

    let r = await correrPrincipal({ mensajes: mensajesLlm, herramientas, ctxHerramientas, limiteMs, fetcher: p.fetcher });
    llamadasLlm.push(...r.llamadasLlm);

    // ¿Alguna herramienta ya cortó el turno (derivar_a_persona, o evento_inminente adentro del
    // loop)? El aviso de a quién y por qué ya lo trae el efecto.
    const efectoQueCorta = r.efectos.find((e) => e.cortaTurno);
    if (efectoQueCorta) {
      eventos.push(...eventosDeLaTraza(ctxHerramientas.traza));
      if (efectoQueCorta.avisoEquipo) {
        eventos.push({ tipo: "derivacion", detalle: { motivo: efectoQueCorta.avisoEquipo.motivo, derivacion_id: efectoQueCorta.avisoEquipo.derivacionId, origen: "herramienta" } });
      }
      // Hallazgo C1 del tester (15/9): este texto —el propio de Lucía si escribió algo antes de
      // llamar la tool, MÁS la despedida libre de derivar_a_persona (mensaje_al_cliente, texto
      // del MODELO, no del código)— nunca pasaba por ninguna barandilla, porque este `return` es
      // anterior al bloque de barandillas de más abajo. En vivo, eso dejó salir «el sistema no me
      // permite…», justo la frase que menciona_ia existe para frenar. Ahora se revisa cada pieza
      // igual que al texto normal. Acá no hay margen para "rehacer" (el turno ya terminó): si una
      // pieza no sale limpia como "enviar", se descarta esa pieza (nunca se manda lo que saltó) y,
      // si se descartó algo, se completa con el texto fijo genérico en vez de dejar la despedida
      // vacía.
      const piezas = [...(r.textoFinal ? [r.textoFinal] : []), ...r.efectos.flatMap((e) => e.mensajesAlCliente ?? [])];
      const textosRevisados: string[] = [];
      let seDescartoAlgo = false;
      for (const pieza of piezas) {
        const b = await aplicarBarandillas({ texto: pieza, traza: ctxHerramientas.traza, ahora: p.ahora, ultimoMensajeClienteAt, esPrimerMensaje, intencion });
        for (const s of b.saltos) eventos.push({ tipo: "error", detalle: { etapa: "barandilla-en-derivacion", barandilla: s.barandilla, accion: s.accion, motivo: s.motivo } });
        if (b.decision === "enviar") textosRevisados.push(b.texto);
        else if (b.decision !== "bloquear") seDescartoAlgo = true;
      }
      if (seDescartoAlgo) {
        const { texto: textoSeguro, usoRespaldo } = await textoDeDerivacion(db, CLAVE_TEXTO_DERIVACION_DURA_GENERICA);
        if (usoRespaldo) eventos.push({ tipo: "error", detalle: { etapa: "barandilla-en-derivacion", error: `contexto_agente.${CLAVE_TEXTO_DERIVACION_DURA_GENERICA} está vacío, se usó el respaldo de código` } });
        textosRevisados.push(textoSeguro);
      }
      resultado = {
        // prepararParaEnviar de una sola vez sobre todo lo que sale (decisión #17, hito 2.3): no
        // burbuja por pieza, sino sin «¡»/«¿» y en 1 a 3 mensajes según el largo total, igual que
        // hace el worker con lo que devuelve el turno.
        mensajesAlCliente: prepararParaEnviar(textosRevisados),
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
      aplicarBarandillas({ texto, traza: ctxHerramientas.traza, ahora: p.ahora, ultimoMensajeClienteAt, esPrimerMensaje, intencion }, { saltosPrevios });

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

    resultado = { mensajesAlCliente: prepararParaEnviar([b.texto, ...efectosMensajes]), imagenes, derivo: false, bloqueadoPorVentana: false };
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
    // no volvía a nombrar el casamiento). No bloquea ni rompe el turno si falla. Sin mensaje de
    // texto de este turno (nada nuevo, o supuesto #33) no hay nada que el cliente haya dicho de
    // sí mismo para leer: no tiene sentido pagar un llamado que no puede extraer nada nuevo
    // (hallazgo propio, 15/9: antes se llamaba igual, con "Cliente: " vacío).
    if (mensaje) {
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
    }

    // Paso 11 — bitácora. Siempre, pase lo que pase arriba: si esto tira (hallazgo propio,
    // 15/9 — una conexión de Postgres que se cae a mitad del turno, ver el comentario de
    // pool.on('error') en probar-agente/index.ts), NO puede tirar el resultado del turno con
    // ella. Antes sí pasaba: un `throw` en un `finally` reemplaza lo que el `try` ya había
    // resuelto, así que un fallo acá — solo bitácora, nada que el cliente vea — tiraba a la
    // basura una respuesta ya buena y ya guardada en `mensajes` (paso 9, arriba) y probar-agente
    // devolvía 500 en vez del resultado real.
    try {
      await registrarEventos(db, p.conversacionId, eventos);
      await registrarConsumo(db, p.conversacionId, llamadasLlm);
    } catch (e) {
      console.error("bitácora del turno no se pudo guardar (no afecta la respuesta al cliente):", (e as Error)?.message ?? e);
    }
  }
}
