// Envía por la Cloud API de WhatsApp y devuelve el wamid del mensaje saliente (se guarda en
// `mensajes` para cruzarlo con sus avisos de estado). Tres formas:
//  · enviarTexto: texto libre. Meta lo acepta solo dentro de la ventana de 24 hs desde el último
//    mensaje del cliente; ese chequeo lo hace quien llama (ventana.ts), no esta función.
//  · enviarImagen: una foto por su link público (las del catálogo, bucket `catalogo`). Misma
//    regla de la ventana que el texto libre.
//  · enviarPlantilla: una plantilla aprobada por Meta (hito 1.14). Sale siempre, con o sin
//    ventana. Los botones de respuesta rápida llevan un payload propio por mensaje: así la
//    respuesta dice a qué turno o charla se refiere (botones.ts).
export type ConfigWhatsapp = { token: string; phoneNumberId: string; version?: string };

export type PlantillaAEnviar = {
  nombre: string;
  idioma: string;
  cuerpo: string[]; // {{1}}, {{2}}… en orden
  botones: string[]; // payload de cada botón de respuesta rápida, en el orden de la plantilla
};

async function mandar(cfg: ConfigWhatsapp, cuerpo: Record<string, unknown>, fetcher: typeof fetch): Promise<string> {
  const url = `https://graph.facebook.com/${cfg.version ?? "v21.0"}/${cfg.phoneNumberId}/messages`;
  const res = await fetcher(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta respondió ${res.status}: ${JSON.stringify(datos?.error ?? datos)}`);
  }
  const id = datos?.messages?.[0]?.id;
  if (typeof id !== "string") throw new Error("Meta no devolvió el id del mensaje enviado");
  return id;
}

export function enviarTexto(
  cfg: ConfigWhatsapp,
  para: string,
  cuerpo: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  return mandar(cfg, { to: para, type: "text", text: { body: cuerpo } }, fetcher);
}

export function enviarImagen(
  cfg: ConfigWhatsapp,
  para: string,
  link: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  return mandar(cfg, { to: para, type: "image", image: { link } }, fetcher);
}

export function enviarPlantilla(
  cfg: ConfigWhatsapp,
  para: string,
  p: PlantillaAEnviar,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const components: Record<string, unknown>[] = [];
  if (p.cuerpo.length > 0) {
    components.push({ type: "body", parameters: p.cuerpo.map((text) => ({ type: "text", text })) });
  }
  p.botones.forEach((payload, i) => {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(i),
      parameters: [{ type: "payload", payload }],
    });
  });
  return mandar(
    cfg,
    { to: para, type: "template", template: { name: p.nombre, language: { code: p.idioma }, components } },
    fetcher,
  );
}
