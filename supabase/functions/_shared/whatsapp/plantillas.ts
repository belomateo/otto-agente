// Las tres plantillas de WhatsApp del hito 1.14, tal como se cargan en Meta
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

import { fechaLarga, horaLocal } from "../tiempo.ts";
import type { PlantillaAEnviar } from "./enviar.ts";

export const TIPOS_ENVIO = ["recordatorio_18h", "agradecimiento_resena", "recontacto_1", "recontacto_2"] as const;
export type TipoEnvio = typeof TIPOS_ENVIO[number];
export const esTipoEnvio = (v: unknown): v is TipoEnvio => (TIPOS_ENVIO as readonly unknown[]).includes(v);

// Los nombres son los que Mateo registró en Meta el 23/9, NO los que habíamos planeado: en Meta
// el nombre de una plantilla no se puede cambiar después de crearla, así que manda el de allá.
// Verificados contra la API (GET /{waba}/message_templates) el 24/9. Si alguno no existe con este
// nombre exacto, Meta rechaza el envío entero y no sale nada.
export const NOMBRE_PLANTILLA: Record<TipoEnvio, string> = {
  recordatorio_18h: "recordatorio_turno",
  agradecimiento_resena: "agradecimiento",
  recontacto_1: "recontacto_cliente",
  recontacto_2: "recontacto_cliente",
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
  referencia: string; // el turno o la charla: queda en envios_programados, ya no en un botón
  linkResena: string | null;
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
  const nombre = primerNombre(d.nombre);
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
