// ¿Vale la pena escribirle un seguimiento a este cliente? (Mateo, 3/11). A las 23 horas de su último
// mensaje, el mismo modelo económico del extractor lee la charla y contesta tres cosas: si muestra
// interés en alquilar, si dijo que lo iba a pensar o consultar, y si ya dio la fecha o al menos el mes.
// Del 29/9 al 3/11, de 949 clientes, 235 mostraron interés y dejaron de contestar; el resto de los que
// no cerraron eran otra cosa (solo el precio, otra provincia, compra, spam) y no se les escribe.
// Ante la duda o si la llamada falla, no se escribe: es mejor perder un seguimiento que molestar.

import { llamarChat, type Uso } from "./cliente.ts";

export type DecisionSeguimiento = {
  interes: boolean;
  vaAConsultar: boolean;
  dioFechaOMes: boolean;
  motivo: string;
  modelo: string;
  uso: Uso;
  ms: number;
};

const INSTRUCCION =
  "Sos parte de Mr Otto, una casa de alquiler de trajes en Rosario. Un cliente escribió por WhatsApp y dejó de " +
  "contestar hace casi un día. Leé la charla y decidí tres cosas. " +
  "interes: true solo si es una persona que busca ALQUILAR un traje para un evento propio o de su familia, todavía " +
  "no sacó turno y dejó la charla a medias: dio el evento o la fecha, preguntó por turnos, modelos, talles o cómo " +
  "funciona, o dijo que lo iba a pensar o consultar. interes: false si preguntó solo el precio y no dio más datos " +
  "ni mostró ganas de ir al local; si es de otra ciudad o provincia o no puede viajar a Rosario; si quiere comprar y " +
  "no alquilar; si es publicidad o no es un cliente; si ya alquiló, o viene por una devolución, un retiro o un " +
  "arreglo; si dice que ya tiene un turno, una cita o una reserva (aunque no se vea en la charla) o pregunta por uno que ya sacó; si dijo que no le interesa, que ya lo resolvió o que escribió por error; o si se despidió porque ya " +
  "tenía lo que necesitaba. va_a_consultar: true si dijo que lo iba a pensar, consultar o avisar. " +
  "dio_fecha_o_mes: true si el cliente dijo la fecha del evento, o al menos el mes o un momento del mes " +
  "(«principio de diciembre»). Primero copiá en que_dijo la frase del CLIENTE que más pesa para decidir (o " +
  "«nada» si no dijo ninguna) y después contestá las tres.";

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["que_dijo", "interes", "va_a_consultar", "dio_fecha_o_mes"],
  properties: {
    que_dijo: { type: "string" },
    interes: { type: "boolean" },
    va_a_consultar: { type: "boolean" },
    dio_fecha_o_mes: { type: "boolean" },
  },
};

// null = no se pudo decidir (sin modelo configurado, la llamada falló o volvió algo que no es lo
// pedido). Quien llama lo trata como «no escribir ahora» y lo vuelve a intentar en la próxima corrida.
export async function decidirSeguimiento(charla: string, fetcher?: typeof fetch): Promise<DecisionSeguimiento | null> {
  const modelo = Deno.env.get("LLM_EXTRACTOR") ?? "";
  if (!modelo) return null;
  const r = await llamarChat(
    {
      model: modelo,
      messages: [
        { role: "system", content: INSTRUCCION },
        { role: "user", content: charla },
      ],
      response_format: { type: "json_schema", json_schema: { name: "seguimiento", schema: ESQUEMA, strict: true } },
      max_completion_tokens: 200,
    },
    fetcher,
  );
  if (!r?.contenido) return null;
  let j: { interes?: unknown; va_a_consultar?: unknown; dio_fecha_o_mes?: unknown; que_dijo?: unknown };
  try {
    j = JSON.parse(r.contenido);
  } catch {
    console.error("decidirSeguimiento: la respuesta no fue JSON válido", r.contenido);
    return null;
  }
  if (typeof j?.interes !== "boolean" || typeof j.va_a_consultar !== "boolean" || typeof j.dio_fecha_o_mes !== "boolean") return null;
  return {
    interes: j.interes,
    vaAConsultar: j.va_a_consultar,
    dioFechaOMes: j.dio_fecha_o_mes,
    motivo: typeof j.que_dijo === "string" ? j.que_dijo.trim() : "",
    modelo,
    uso: r.uso,
    ms: r.ms,
  };
}
