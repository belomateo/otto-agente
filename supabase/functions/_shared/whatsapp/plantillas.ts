// Las plantillas de WhatsApp del hito 1.14 (más el aviso al equipo del 9/10), tal como se cargan en Meta
// (docs/plantillas-whatsapp.md): nombre, idioma, las variables del cuerpo en orden y el texto
// como le llega al cliente, para guardarlo en la charla: así Lucía ve qué se le mandó cuando el
// cliente conteste.
// Si falta un dato que la plantilla necesita (el nombre, o el link de reseña), no se arma: Meta
// no acepta variables vacías y un "Hola, ." no sale.
//
// NINGUNA LLEVA BOTONES (Mateo, 16/9, reconfirmado el 24/9 con los textos definitivos de la
// dueña). El recordatorio no pregunta "¿confirmás?" con dos botones: avisa, y pide que le avisen
// solo si NO pueden venir. La confirmación pasa a ser por INTENCIÓN: si el cliente contesta algo
// que quiere decir que viene, Lucía llama a confirmar_turno y el turno queda confirmado; si
// contesta cualquier otra cosa, el turno sigue pendiente de confirmación. Esa lógica vive en
// _shared/herramientas/confirmar_turno.ts, no acá.
// `botones` se deja en el tipo y en enviar.ts a propósito: si alguna plantilla vuelve a tener
// botones, alcanza con llenarlo. Mandar un component de botón para una plantilla registrada SIN
// botones hace que Meta rechace el envío, así que acá va vacío siempre.

import type { MotivoDerivacion } from "../enums.ts";
import { nombreUsable } from "../nombre.ts";
import { fechaLarga, horaLocal } from "../tiempo.ts";
import type { PlantillaAEnviar } from "./enviar.ts";
import { telefonoParaMeta } from "./telefono.ts";

// aviso_derivacion (Mateo, 9/10) es la única que NO va al cliente: le avisa al equipo que Lucía le
// pasó una charla (PROCESOS.md § 4, paso 4). La manda cron-envios al teléfono del equipo.
export const TIPOS_ENVIO = ["recordatorio_18h", "agradecimiento_resena", "recontacto_1", "recontacto_2", "aviso_derivacion"] as const;
export type TipoEnvio = typeof TIPOS_ENVIO[number];
export const esTipoEnvio = (v: unknown): v is TipoEnvio => (TIPOS_ENVIO as readonly unknown[]).includes(v);

// Los nombres son los que Mateo registró en Meta el 23/9, NO los que habíamos planeado: en Meta
// el nombre de una plantilla no se puede cambiar después de crearla, así que manda el de allá.
// Verificados contra la API (GET /{waba}/message_templates) el 24/9. Si alguno no existe con este
// nombre exacto, Meta rechaza el envío entero y no sale nada.
// recontacto_2 tiene su propia plantilla desde el 6/10: antes usaba la misma del primero y al
// cliente le llegaba el mismo mensaje dos veces, palabra por palabra. Mientras Meta no la apruebe,
// cron-envios no manda el segundo (ver plantillaAprobada allá).
export const NOMBRE_PLANTILLA: Record<TipoEnvio, string> = {
  recordatorio_18h: "recordatorio_turno",
  agradecimiento_resena: "agradecimiento",
  recontacto_1: "recontacto_cliente",
  recontacto_2: "recontacto_cliente_2",
  aviso_derivacion: "aviso_derivacion",
};
export const IDIOMA_PLANTILLAS = "es_AR";

// El link de reseñas tal como quedó ESCRITO FIJO adentro de la plantilla `agradecimiento` de Meta.
// No se usa para mandar (Meta ya lo tiene): se usa para que la charla guarde el mismo texto que
// recibió el cliente. Si se edita la plantilla en Meta, hay que cambiarlo acá también, o el
// panel va a mostrar un link distinto del que se mandó.
const LINK_RESENA_EN_PLANTILLA = "https://g.page/r/CYt3m6AmKYylEBM/review";

export type DatosEnvio = {
  nombre: string | null;
  inicio: Date | null; // el turno (recordatorio)
  referencia: string; // el turno, la charla o la derivación: queda en envios_programados
  linkResena: string | null;
  // Solo para aviso_derivacion: de quién es la charla y por qué se pasó.
  telefonoCliente?: string | null;
  motivo?: string | null;
};

export type Plantilla = PlantillaAEnviar & { texto: string };

// "juan pérez" → "Juan". El nombre de la ficha queda como lo escribió el cliente.
export function primerNombre(nombre: string | null): string | null {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primero) return null;
  return primero.charAt(0).toLocaleUpperCase("es-AR") + primero.slice(1).toLocaleLowerCase("es-AR");
}

// "miércoles 23 de septiembre" → "Miércoles 23 de Septiembre": así lo escribió la dueña en el
// texto que aprobó Meta, y la variable tiene que entrar igual que en el ejemplo aprobado.
function diaDePlantilla(fecha: Date, tz: string): string {
  return fechaLarga(fecha, tz).replace(/(^|\s)(\p{Ll})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase("es-AR"))
    .replace(/ De /g, " de ");
}

// "15:00" → "15.00hs", el formato del texto aprobado.
function horaDePlantilla(fecha: Date, tz: string): string {
  return `${horaLocal(fecha, tz).replace(":", ".")}hs`;
}

export function armarPlantilla(tipo: TipoEnvio, d: DatosEnvio, tz: string): Plantilla | { falta: string } {
  // El aviso al equipo sale aunque el cliente no tenga un nombre usable: lo importante es que
  // alguien se entere. Va antes del chequeo del nombre, que es para los mensajes al cliente.
  if (tipo === "aviso_derivacion") return avisoDerivacion(d);

  // Con un perfil que no es un nombre («siempre te elijo» salía «¡Hola Siempre!», 4/10): el
  // recontacto, que es publicidad, no sale; el recordatorio y el agradecimiento, que el cliente
  // espera, salen igual con lo que haya.
  const usable = nombreUsable(d.nombre);
  const nombre = primerNombre(tipo === "recontacto_1" || tipo === "recontacto_2" ? usable : usable ?? d.nombre);
  if (!nombre) return { falta: "el nombre del cliente" };
  const base = { nombre: NOMBRE_PLANTILLA[tipo], idioma: IDIOMA_PLANTILLAS, botones: [] };

  if (tipo === "recordatorio_18h") {
    if (!d.inicio) return { falta: "la hora del turno" };
    const dia = diaDePlantilla(d.inicio, tz);
    const hora = horaDePlantilla(d.inicio, tz);
    return {
      ...base,
      cuerpo: [nombre, dia, hora],
      texto: `Hola ${nombre}!\n\n` +
        "Te recordamos el turno para alquilar tu traje:\n" +
        `🗓️Día: ${dia}\n` +
        `⏱️Hora: ${hora}\n\n` +
        "📍 Recordamos que estamos en España 764\n" +
        "https://maps.app.goo.gl/YKyU8qDRqDfNNvWT8\n\n" +
        "👪 Se permite un acompañante por persona.\n\n" +
        "❗Recordamos que el turno es de 45 minutos ⏳ Contamos con 10 min de tolerancia.\n\n" +
        "🔖En caso de alquilar, para reservar se abona el 100%. Recibimos pagos en efectivo, " +
        "transferencia y tarjetas de crédito y débito.\n\n" +
        "📲 Por favor, avisanos en caso de que no puedas asistir al turno y lo reprogramamos.\n\n" +
        "Gracias ✨",
    };
  }

  if (tipo === "agradecimiento_resena") {
    // UNA sola variable: el link de reseñas quedó ESCRITO FIJO adentro de la plantilla de Meta
    // (así la registró Mateo el 23/9, verificado contra la API). Mandarle dos parámetros cuando
    // la plantilla declara uno hace que Meta rechace el envío.
    // Consecuencia que hay que tener presente: cambiar el link en Configuración › Enlaces NO
    // cambia el que sale en este mensaje. Para cambiarlo hay que editar la plantilla en Meta (se
    // puede: una vez por día, hasta 10 al mes) y actualizar LINK_RESENA_EN_PLANTILLA acá abajo,
    // que existe solo para que la charla guarde el texto que el cliente realmente recibió.
    return {
      ...base,
      cuerpo: [nombre],
      texto: `¡Hola ${nombre}! 😊 ¿Cómo estás? Esperamos que hayas disfrutado mucho del evento y ` +
        "que hayas lucido increíble con tu look de OTTO 🤵‍♂️✨\n\n" +
        "Nos encantaría ver cómo quedó el look en ese día tan especial. *¿Nos compartirías alguna " +
        "foto del evento con el traje?* 📸 Nos encanta ver a nuestros clientes en esos momentos y, " +
        "con tu permiso, compartir algunas de esas fotos en *@otto_sumisura*.\n\n" +
        "Y si tu experiencia con nosotros fue buena, te agradeceríamos muchísimo que nos dejaras " +
        "una reseña ⭐️. Tu opinión nos ayuda a seguir creciendo y a que más personas conozcan " +
        "OTTO.\n\n" +
        `👉 ${LINK_RESENA_EN_PLANTILLA}\n\n` +
        "*¡Gracias por elegir OTTO Su Misura!* 🖤",
    };
  }

  if (tipo === "recontacto_2") {
    // El texto tiene que ser EXACTAMENTE el de la plantilla registrada en Meta (TEXTO_RECONTACTO_2):
    // la charla guarda lo que recibió el cliente.
    return { ...base, cuerpo: [nombre], texto: TEXTO_RECONTACTO_2.replace("{{1}}", nombre) };
  }

  return {
    ...base,
    cuerpo: [nombre],
    texto: `¡Hola ${nombre}! 😊 ¿Cómo estás? Queríamos saber si todavía estás buscando traje para ` +
      "tu evento.\n\n" +
      "Tenemos la agenda abierta y podemos coordinar un turno para que vengas a probar las " +
      "opciones disponibles y te asesoremos con el look. 🤵‍♂️\n\n" +
      "¿Seguís buscando? ¿Querés que agendemos un turno?",
  };
}

// aviso_derivacion (Mateo, 9/10): al equipo, cuando Lucía le pasa una charla. Hasta hoy la
// derivación solo se veía en el panel y Lucía le decía al cliente «ya les avisé» sin que nadie
// avisara (PROCESOS.md § 4, paso 4). El cuerpo tal como se registra en Meta (UTILITY, es_AR):
// {{1}} = quién (nombre y teléfono del cliente), {{2}} = el motivo dicho para una persona.
export const TEXTO_AVISO_DERIVACION =
  "Lucía pasó una charla al equipo. Cliente: {{1}}. Motivo: {{2}}. Respondele desde la Bandeja del panel.";

// El motivo de la derivación (enum) como lo entiende alguien del local. Record sobre el enum: si
// se suma un motivo, esto no compila hasta que tenga su frase.
export const MOTIVO_PARA_EL_EQUIPO: Record<MotivoDerivacion, string> = {
  reclamo: "un reclamo",
  cliente_enojado: "el cliente está molesto",
  prenda_danada: "una prenda que volvió dañada",
  corporativo: "un pedido para empresa o uniformes",
  turno_urgente_sin_hueco: "necesita un turno urgente y no hay lugar",
  evento_inminente: "el evento es hoy o mañana",
  descuento: "pide un descuento",
  dato_no_encontrado: "Lucía no encontró el dato para responder",
  pide_persona: "pidió hablar con una persona",
  devolucion_tardia: "quiere devolver el traje más tarde",
  barandilla_doble: "Lucía no pudo armar la respuesta",
  sin_respuesta: "quedó sin respuesta",
  timeout: "Lucía tardó demasiado en responder",
  fallo_tecnico: "hubo una falla técnica",
};

// Meta rechaza una variable con saltos de línea, tabulaciones o más de 4 espacios seguidos.
const paraVariable = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);

// "5493415551234" → "+54 9 3415551234": que el equipo lo pueda copiar y buscar.
function telefonoLegible(crudo: string | null | undefined): string | null {
  const d = telefonoParaMeta(crudo);
  if (!d) return null;
  return d.startsWith("549") ? `+54 9 ${d.slice(3)}` : `+${d}`;
}

function avisoDerivacion(d: DatosEnvio): Plantilla {
  const nombre = nombreUsable(d.nombre);
  const telefono = telefonoLegible(d.telefonoCliente);
  const quien = paraVariable(nombre && telefono ? `${nombre} (${telefono})` : nombre ?? telefono ?? "sin nombre ni teléfono");
  const motivo = paraVariable(
    (d.motivo && MOTIVO_PARA_EL_EQUIPO[d.motivo as MotivoDerivacion]) || d.motivo || "sin motivo anotado",
  );
  return {
    nombre: NOMBRE_PLANTILLA.aviso_derivacion,
    idioma: IDIOMA_PLANTILLAS,
    botones: [],
    cuerpo: [quien, motivo],
    texto: TEXTO_AVISO_DERIVACION.replace("{{1}}", quien).replace("{{2}}", motivo),
  };
}

// El cuerpo de recontacto_cliente_2 tal como se registra en Meta (MARKETING, es_AR, variable {{1}}
// = el primer nombre). Distinto del primero a propósito: más corto, con un motivo concreto para
// venir pronto, y libera al que ya lo resolvió de tener que contestar.
export const TEXTO_RECONTACTO_2 = "¡Hola {{1}}! 👋 Te escribimos de Otto Su Misura por el traje para tu evento. Como " +
  "la disponibilidad depende del talle y de la fecha, conviene venir a probarte con tiempo. Si querés, respondé " +
  "este mensaje y te buscamos un turno. Si ya lo resolviste, no hace falta que contestes 🙂";
