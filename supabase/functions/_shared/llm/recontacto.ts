// ¿Le mandamos el recontacto («¿Seguís buscando? ¿Querés que agendemos un turno?») a este cliente?
// (Mateo, 13/10). Hasta hoy lo decidía solo envios_pendientes (0097), con un filtro de palabras que
// frena «no me interesa» o «no, gracias» pero no las mil otras formas de decir que no: Walter canceló
// su turno, dijo «no por ahora» y a la mañana siguiente le llegó igual; Nano canceló y escribió
// «cualquier cosa te vuelvo a escribir», y Sergio y Ale («lo hablo con mi familia y te aviso») lo
// recibieron al otro día (analista, 12/10). El pedido: que decida la INTENCIÓN del cliente, no una
// lista de frases. Antes de mandarlo, el mismo modelo económico del extractor lee la charla y
// contesta una sola pregunta. Ante la duda o si la llamada falla, no se manda: perder un
// recontacto cuesta menos que molestar a alguien que ya dijo que no.

import { llamarChat, type Uso } from "./cliente.ts";

export type MensajeDeLaCharla = { direccion: "entrante" | "saliente"; contenido: string | null; transcripcion?: string | null };

export type DecisionRecontacto = { mandar: boolean; motivo: string; modelo: string; uso: Uso; ms: number };

// Lo último de la charla, en orden y con quién lo dijo. Las plantillas y lo del [mostrador] cuentan
// como «Mr Otto»: el cliente puede estar contestando a cualquiera de los dos.
export function charlaParaRecontacto(mensajes: MensajeDeLaCharla[], maximo = 20): string {
  return mensajes.slice(-maximo).map((m) => {
    const texto = (m.transcripcion ? `${m.contenido ?? ""} [audio: ${m.transcripcion}]` : m.contenido ?? "").replace(/\s+/g, " ").trim();
    return `${m.direccion === "entrante" ? "Cliente" : "Mr Otto"}: ${texto || "(sin texto)"}`;
  }).join("\n");
}

// El criterio es el de Mateo: no se manda cuando la intención del cliente es no venir al local ni
// sacar turno. Probado el 14/10 con 79 charlas reales: «cancelo, hoy no puedo» no es eso (Sandra
// canceló y, con el recontacto, sacó turno para el día siguiente), y «lo hablo y te aviso» tampoco
// alcanza solo: queda con ganas de venir.
const INSTRUCCION =
  "Sos parte de Mr Otto, una casa de alquiler de trajes. Mañana se le va a mandar a este cliente un mensaje " +
  "automático: «¿Seguís buscando traje para tu evento? ¿Querés que agendemos un turno?». Leé la charla y decidí " +
  "si NO hay que mandárselo. No hay que mandarlo solo si el cliente dejó claro, con las palabras que sea, que por " +
  "ahora no quiere venir al local ni sacar turno: «no por ahora», «no, gracias», ya lo resolvió, ya alquiló o " +
  "compró en otro lado, no le interesa, escribió por error, o canceló su turno y cuando le ofrecieron otro día " +
  "dijo que no o que él va a volver a escribir. Sí hay que mandarlo si canceló porque ese día no podía pero no " +
  "dijo que no quiera venir, si dijo que lo va a pensar o a consultar y avisa, o si simplemente dejó de " +
  "contestar, aunque haya terminado con un «gracias» o un «ok». Primero copiá en que_dijo la frase del " +
  "cliente que decide (o «nada» si no dijo ninguna) y después contestá no_mandar.";

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["que_dijo", "no_mandar"],
  properties: {
    que_dijo: { type: "string" },
    no_mandar: { type: "boolean" },
  },
};

// null = no se pudo decidir (sin modelo configurado, la llamada falló dos veces o volvió algo que no
// es la respuesta pedida). Quien llama lo trata como «no mandar».
export async function decidirRecontacto(charla: string, fetcher?: typeof fetch): Promise<DecisionRecontacto | null> {
  const modelo = Deno.env.get("LLM_EXTRACTOR") ?? "";
  if (!modelo) return null;
  const r = await llamarChat(
    {
      model: modelo,
      messages: [
        { role: "system", content: INSTRUCCION },
        { role: "user", content: charla },
      ],
      response_format: { type: "json_schema", json_schema: { name: "recontacto", schema: ESQUEMA, strict: true } },
      max_completion_tokens: 150,
    },
    fetcher,
  );
  if (!r?.contenido) return null;
  let j: unknown;
  try {
    j = JSON.parse(r.contenido);
  } catch {
    console.error("decidirRecontacto: la respuesta no fue JSON válido", r.contenido);
    return null;
  }
  const d = j as { no_mandar?: unknown; que_dijo?: unknown };
  if (typeof d?.no_mandar !== "boolean") return null;
  return { mandar: !d.no_mandar, motivo: typeof d.que_dijo === "string" ? d.que_dijo.trim() : "", modelo, uso: r.uso, ms: r.ms };
}
