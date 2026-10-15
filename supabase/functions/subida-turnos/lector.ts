// Subida de turnos — el LECTOR (pedido de Mateo, 14/10). Lee una charla y dice si quedó acordado un turno con
// día y hora concretos. No decide nada más: quien carga es código (verificador.ts y cargador.ts).
//
// Qué cuenta como acuerdo (definido con Mateo el 14/10):
//  · alguien (Lucía, el local o el cliente) nombra un día y una hora concretos Y la otra parte acepta o muestra
//    intención de aceptar («ok», «dale», «👍», «voy», «ese», «el segundo», «agendame», «confirmo»…);
//  · o el local / Lucía escribe que ya agendó («ya te agendé», «reservado», «confirmado») y en la charla hay
//    día y hora concretos.
// No hay acuerdo si falta la hora, si el cliente lo consulta o avisa después, si quedó sin elegir, o si canceló.

import { llamarChat } from "../_shared/llm/cliente.ts";
import { fechaLocal, horaLocal } from "../_shared/tiempo.ts";

export type MensajeDeLaCharla = {
  direccion: "entrante" | "saliente";
  contenido: string | null;
  transcripcion?: string | null;
  tipo?: string | null;
  enviadoAt: Date;
};

export type Acuerdo = {
  frase: string;
  hayAcuerdo: boolean;
  dia: string | null; // AAAA-MM-DD
  hora: string | null; // HH:MM
  propuso: "lucia" | "local" | "cliente" | null;
  acepto: "cliente" | "local" | "ambos" | null;
  nombre: string | null;
  email: string | null;
  intencionSinHora: boolean;
  motivo: string;
};

export const INSTRUCCION = `Leés una charla de WhatsApp entre un cliente y el local de alquiler de trajes (Lucía = asistente, Local = el equipo, Cliente).
Tu única tarea: decir si en la charla quedó ACORDADO un turno para ir al local, con día y hora concretos.
Hay acuerdo cuando alguien (Lucía, el Local o el propio Cliente) propone o nombra un día y una hora concretos Y la otra parte acepta o muestra intención de aceptar
("ok", "dale", "perfecto", "👍", "voy", "ahí estoy", "ese", "el segundo", "a las 14", "agendame", "reservame", "confirmo"),
o cuando el Local o Lucía escribe que ya agendó/reservó/confirmó ("ya te agendé", "listo agendado", "confirmado") y en la charla hay un día y hora concretos.
NO hay acuerdo si falta la hora, si el cliente dice que lo consulta/te avisa/tal vez, si quedó sin elegir entre opciones, o si después canceló.
Si hay varios acuerdos, devolvé el ÚLTIMO vigente (el que reemplaza a los anteriores). Resolvé "mañana", "el jueves", etc. con la fecha y hora de cada mensaje.
La frase tiene que ser copia literal de un mensaje. No inventes datos: si no está, null.
intencion_sin_hora = true SOLO si el cliente mismo expresó que quiere ir o sacar un turno ("quiero un turno", "dale", "sí, pasame horarios", "voy el martes") y aún falta día u hora; si solo Lucía o el local ofreció y el cliente no contestó, o el cliente dijo que lo consulta, o canceló, es false.
Primero completá "frase" (la que decide, o "nada"), después "hay_acuerdo".`;

export const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["frase", "hay_acuerdo", "dia", "hora", "propuso", "acepto", "nombre", "email", "intencion_sin_hora", "motivo"],
  properties: {
    frase: { type: "string" },
    hay_acuerdo: { type: "boolean" },
    dia: { type: ["string", "null"], description: "AAAA-MM-DD" },
    hora: { type: ["string", "null"], description: "HH:MM 24h" },
    propuso: { type: ["string", "null"], enum: ["lucia", "local", "cliente", null] },
    acepto: { type: ["string", "null"], enum: ["cliente", "local", "ambos", null] },
    nombre: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    intencion_sin_hora: { type: "boolean" },
    motivo: { type: "string" },
  },
};

const LIMITE_MENSAJES = 30;
const LIMITE_CARACTERES = 400;

// «Cliente:», «Lucía:» o «Local:» (lo que sale con el prefijo [mostrador]), con la fecha y hora de cada mensaje.
export function charlaParaElLector(mensajes: MensajeDeLaCharla[], ahora: Date, tz: string): string {
  const etiqueta = (d: Date) => `${fechaLocal(d, tz)} ${horaLocal(d, tz)}`;
  const lineas = mensajes
    .filter((m) => !/Te recordamos el turno/i.test(m.contenido ?? "") && !/^Pasos para alquilar/i.test(m.contenido ?? ""))
    .slice(-LIMITE_MENSAJES)
    .map((m) => {
      const crudo = (m.contenido ?? "").trim();
      const delLocal = m.direccion === "saliente" && crudo.startsWith("[mostrador]");
      const quien = m.direccion === "entrante" ? "Cliente" : delLocal ? "Local" : "Lucía";
      const texto = (delLocal ? crudo.replace(/^\[mostrador\]\s*/, "") : crudo) ||
        (m.transcripcion ? `[audio: ${m.transcripcion.trim()}]` : `[${m.tipo ?? "mensaje"}]`);
      return `[${etiqueta(m.enviadoAt)}] ${quien}: ${texto.replace(/\s+/g, " ").slice(0, LIMITE_CARACTERES)}`;
    });
  return `Hoy es ${etiqueta(ahora)}.\n${lineas.join("\n")}`;
}

// null = no se pudo leer (sin modelo, la llamada falló o volvió algo que no es la respuesta pedida): quien
// llama lo deja en la lista de revisión, nunca carga.
export async function leerAcuerdo(charla: string, fetcher?: typeof fetch): Promise<Acuerdo | null> {
  const modelo = Deno.env.get("LLM_EXTRACTOR") ?? "";
  if (!modelo) return null;
  const r = await llamarChat(
    {
      model: modelo,
      messages: [
        { role: "system", content: INSTRUCCION },
        { role: "user", content: charla },
      ],
      response_format: { type: "json_schema", json_schema: { name: "acuerdo", schema: ESQUEMA, strict: true } },
      max_completion_tokens: 500,
    },
    fetcher,
  );
  if (!r?.contenido) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(r.contenido);
  } catch {
    console.error("leerAcuerdo: la respuesta no fue JSON válido", r.contenido);
    return null;
  }
  if (typeof j.hay_acuerdo !== "boolean") return null;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const en = <T extends string>(v: unknown, opciones: readonly T[]): T | null => (opciones as readonly unknown[]).includes(v) ? (v as T) : null;
  return {
    frase: typeof j.frase === "string" ? j.frase.trim() : "",
    hayAcuerdo: j.hay_acuerdo,
    dia: txt(j.dia),
    hora: txt(j.hora),
    propuso: en(j.propuso, ["lucia", "local", "cliente"] as const),
    acepto: en(j.acepto, ["cliente", "local", "ambos"] as const),
    nombre: txt(j.nombre),
    email: txt(j.email),
    intencionSinHora: j.intencion_sin_hora === true,
    motivo: typeof j.motivo === "string" ? j.motivo.trim() : "",
  };
}
