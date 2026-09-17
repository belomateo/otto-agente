// Envía por la Cloud API de WhatsApp y devuelve el wamid del mensaje saliente (se guarda en
// `mensajes` para cruzarlo con sus avisos de estado). Tres formas:
//  · enviarTexto: texto libre. Meta lo acepta solo dentro de la ventana de 24 hs desde el último
//    mensaje del cliente; ese chequeo lo hace quien llama (ventana.ts), no esta función.
//  · enviarImagen: una foto por su link público (las del catálogo, bucket `catalogo`). Misma
//    regla de la ventana que el texto libre.
//  · subirMedia + enviarImagenPorId: una foto que NO es pública. Las que manda el equipo desde
//    el panel (0048) viven en el bucket `adjuntos`, privado a propósito porque son fotos de
//    clientes: hacerlas públicas para que Meta las baje por link sería publicarlas en una URL
//    adivinable, para siempre. Se suben a /media y se mandan por media_id, que Meta guarda 30
//    días y después borra solo. Misma regla de la ventana.
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

// Sube una foto a /media y devuelve su media_id (vale 30 días). No pasa por `mandar`: /media va
// como multipart, no como JSON, y contesta {id} en vez de {messages:[{id}]}.
export async function subirMedia(
  cfg: ConfigWhatsapp,
  archivo: Blob,
  nombre: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const formulario = new FormData();
  formulario.append("messaging_product", "whatsapp");
  formulario.append("type", archivo.type);
  formulario.append("file", archivo, nombre);
  const url = `https://graph.facebook.com/${cfg.version ?? "v21.0"}/${cfg.phoneNumberId}/media`;
  const res = await fetcher(url, { method: "POST", headers: { Authorization: `Bearer ${cfg.token}` }, body: formulario });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta respondió ${res.status} al subir la foto: ${JSON.stringify(datos?.error ?? datos)}`);
  }
  const id = datos?.id;
  if (typeof id !== "string") throw new Error("Meta no devolvió el id de la foto subida");
  return id;
}

export function enviarImagenPorId(
  cfg: ConfigWhatsapp,
  para: string,
  mediaId: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  return mandar(cfg, { to: para, type: "image", image: { id: mediaId } }, fetcher);
}
