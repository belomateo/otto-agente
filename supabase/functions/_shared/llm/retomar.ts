// ¿Lucía retoma esta charla? (Mateo, 26/10). Derivar la apaga hasta que alguien la active (0081), y
// los clientes que vuelven a escribir para pedir un turno quedaban sin respuesta: Carla pidió el 24/10
// «un turno para el 3/12 última prueba y retiro» y nadie la vio (147 charlas abiertas con Lucía
// apagada). Si el cliente pide sacar, cambiar o cancelar un turno, y nadie del equipo le escribió en
// las últimas horas, Lucía se vuelve a prender. Ante la duda o si la llamada falla, no retoma.

import { llamarChat, type Uso } from "./cliente.ts";

export type DecisionRetomar = { retomar: boolean; motivo: string; modelo: string; uso: Uso; ms: number };

const INSTRUCCION =
  "Sos parte de Mr Otto, una casa de alquiler de trajes. Esta charla la está atendiendo una persona del equipo " +
  "y el asistente automático está en pausa. Leé los últimos mensajes y decidí si el ÚLTIMO mensaje del cliente " +
  "es un pedido de turno: sacar uno nuevo (prueba, prueba final, retiro, devolución), cambiarlo de día u hora, " +
  "o cancelarlo. No lo es si contesta otra cosa (una queja, un reclamo, un pago, una pregunta sobre un arreglo, " +
  "un «gracias» o «ok», o confirma un turno que ya tiene). Primero copiá en que_dijo la frase del cliente que " +
  "decide (o «nada») y después contestá pide_turno.";

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["que_dijo", "pide_turno"],
  properties: { que_dijo: { type: "string" }, pide_turno: { type: "boolean" } },
};

export async function decidirRetomar(charla: string, fetcher?: typeof fetch): Promise<DecisionRetomar | null> {
  const modelo = Deno.env.get("LLM_EXTRACTOR") ?? "";
  if (!modelo) return null;
  const r = await llamarChat(
    {
      model: modelo,
      messages: [{ role: "system", content: INSTRUCCION }, { role: "user", content: charla }],
      response_format: { type: "json_schema", json_schema: { name: "retomar", schema: ESQUEMA, strict: true } },
      max_completion_tokens: 150,
    },
    fetcher,
  );
  if (!r?.contenido) return null;
  let j: { pide_turno?: unknown; que_dijo?: unknown };
  try {
    j = JSON.parse(r.contenido);
  } catch {
    console.error("decidirRetomar: la respuesta no fue JSON válido", r.contenido);
    return null;
  }
  if (typeof j?.pide_turno !== "boolean") return null;
  return { retomar: j.pide_turno, motivo: typeof j.que_dijo === "string" ? j.que_dijo.trim() : "", modelo, uso: r.uso, ms: r.ms };
}
