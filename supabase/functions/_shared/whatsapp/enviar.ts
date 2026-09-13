// Envía un texto por la Cloud API de WhatsApp y devuelve el wamid del mensaje saliente (se
// guarda en `mensajes` para cruzarlo con sus avisos de estado). Fuera de la ventana de 24 hs
// Meta solo acepta plantillas: ese chequeo lo hace quien llama (worker, crons), no esta función.
export type ConfigWhatsapp = { token: string; phoneNumberId: string; version?: string };

export async function enviarTexto(
  cfg: ConfigWhatsapp,
  para: string,
  cuerpo: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const url = `https://graph.facebook.com/${cfg.version ?? "v21.0"}/${cfg.phoneNumberId}/messages`;
  const res = await fetcher(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: cuerpo } }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta respondió ${res.status}: ${JSON.stringify(datos?.error ?? datos)}`);
  }
  const id = datos?.messages?.[0]?.id;
  if (typeof id !== "string") throw new Error("Meta no devolvió el id del mensaje enviado");
  return id;
}
