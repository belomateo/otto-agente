// Webhook de WhatsApp (Meta).
// GET: verificación del webhook (hub.challenge). POST: verifica la firma, registra cada
// mensaje entrante (dedup por wa_message_id + cola) y responde 200 enseguida. El trabajo
// pesado lo hace el worker, que se dispara desde la base al encolar. Meta reintenta si no
// recibe 200 rápido, y si falla seguido puede dar de baja el webhook.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { firmaValida } from "../_shared/whatsapp/firma.ts";
import { mensajesEntrantes } from "../_shared/whatsapp/parsear.ts";

const VERIFY_TOKEN = Deno.env.get("WA_VERIFY_TOKEN") ?? "";
// Sin App Secret cargado, firmaValida rechaza todo: nunca se procesa un POST sin firmar.
const APP_SECRET = Deno.env.get("WA_APP_SECRET") ?? "";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const valido = url.searchParams.get("hub.mode") === "subscribe" &&
      VERIFY_TOKEN !== "" &&
      url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return valido
      ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
      : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Los bytes crudos: la firma se calcula sobre ellos, no sobre el JSON re-serializado.
  const cuerpo = new Uint8Array(await req.arrayBuffer());
  if (!(await firmaValida(cuerpo, req.headers.get("x-hub-signature-256"), APP_SECRET))) {
    return new Response("firma inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(cuerpo));
  } catch {
    return new Response("json inválido", { status: 400 });
  }

  for (const m of mensajesEntrantes(payload)) {
    const { error } = await supabase.rpc("registrar_mensaje_entrante", {
      p_wa_message_id: m.waMessageId,
      p_telefono: m.telefono,
      p_nombre: m.nombre,
      p_tipo: m.tipo,
      p_contenido: m.contenido,
      p_enviado_at: m.enviadoAt,
      p_crudo: m.crudo,
    });
    if (error) {
      // 500 a propósito: Meta reintenta, y el dedup por wa_message_id evita duplicar los
      // mensajes de este mismo POST que sí alcanzaron a entrar.
      console.error("registrar_mensaje_entrante falló", error);
      return new Response("error", { status: 500 });
    }
  }
  return new Response("ok", { status: 200 });
});
