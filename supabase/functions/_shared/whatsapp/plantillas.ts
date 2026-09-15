// Las tres plantillas de WhatsApp del hito 1.14, tal como se cargan en Meta
// (docs/plantillas-whatsapp.md): nombre, idioma, las variables del cuerpo en orden y el payload
// de cada botón. Además, el texto como le llega al cliente, para guardarlo en la charla: así
// Lucía ve qué se le mandó cuando el cliente conteste.
// Si falta un dato que la plantilla necesita (el nombre, o el link de reseña), no se arma: Meta
// no acepta variables vacías y un "Hola, ." no sale.

import { fechaLarga, horaLocal } from "../tiempo.ts";
import { PAYLOAD, payload } from "./botones.ts";
import type { PlantillaAEnviar } from "./enviar.ts";

export const TIPOS_ENVIO = ["recordatorio_24h", "agradecimiento_resena", "recontacto_1", "recontacto_2"] as const;
export type TipoEnvio = typeof TIPOS_ENVIO[number];
export const esTipoEnvio = (v: unknown): v is TipoEnvio => (TIPOS_ENVIO as readonly unknown[]).includes(v);

export const NOMBRE_PLANTILLA: Record<TipoEnvio, string> = {
  recordatorio_24h: "recordatorio_turno_24h",
  agradecimiento_resena: "agradecimiento_resena",
  recontacto_1: "recontacto_turno_pendiente",
  recontacto_2: "recontacto_turno_pendiente",
};
export const IDIOMA_PLANTILLAS = "es_AR";

export type DatosEnvio = {
  nombre: string | null;
  inicio: Date | null; // el turno (recordatorio)
  referencia: string; // el turno o la charla: va en el payload de los botones
  linkResena: string | null;
};

export type Plantilla = PlantillaAEnviar & { texto: string };

// "juan pérez" → "Juan". El nombre de la ficha queda como lo escribió el cliente.
export function primerNombre(nombre: string | null): string | null {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primero) return null;
  return primero.charAt(0).toLocaleUpperCase("es-AR") + primero.slice(1).toLocaleLowerCase("es-AR");
}

export function armarPlantilla(tipo: TipoEnvio, d: DatosEnvio, tz: string): Plantilla | { falta: string } {
  const nombre = primerNombre(d.nombre);
  if (!nombre) return { falta: "el nombre del cliente" };
  const base = { nombre: NOMBRE_PLANTILLA[tipo], idioma: IDIOMA_PLANTILLAS };

  if (tipo === "recordatorio_24h") {
    if (!d.inicio) return { falta: "la hora del turno" };
    const dia = fechaLarga(d.inicio, tz);
    const hora = horaLocal(d.inicio, tz);
    return {
      ...base,
      cuerpo: [nombre, dia, hora],
      botones: [payload(PAYLOAD.confirmar, d.referencia), payload(PAYLOAD.reprogramar, d.referencia)],
      texto: `Hola, ${nombre}. Te recordamos tu turno en Otto Su Misura: mañana ${dia} a las ${hora}, en ` +
        "España 764, Rosario. ¿Nos confirmás que venís?\n[Botones: Confirmo · Necesito reprogramar]",
    };
  }

  if (tipo === "agradecimiento_resena") {
    if (!d.linkResena) return { falta: "el link de reseñas de Google (Configuración › Enlaces)" };
    return {
      ...base,
      cuerpo: [nombre, d.linkResena],
      botones: [],
      texto: `¡Gracias por elegirnos, ${nombre}! Esperamos que el evento haya salido espectacular. Si te ` +
        `gustó cómo te atendimos, nos ayuda mucho que dejes tu reseña en Google: ${d.linkResena}\n\n` +
        "Y si tenés fotos del evento, nos encantaría verlas. 😊",
    };
  }

  return {
    ...base,
    cuerpo: [nombre],
    botones: [payload(PAYLOAD.recontactoSi, d.referencia), payload(PAYLOAD.recontactoLuego, d.referencia)],
    texto: `Hola, ${nombre}. Te escribo de Otto Su Misura por el traje que estabas buscando. Cuando ` +
      "quieras, te reservo un turno en el local para que lo veas puesto y el equipo te asesore con el " +
      "calce, los colores y los accesorios. ¿Te busco un horario?\n[Botones: Sí, buscame uno · Más adelante]",
  };
}
