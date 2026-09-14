// Worker: toma trabajos de la cola (FOR UPDATE SKIP LOCKED, vía cola_tomar_uno) y corre el
// turno del agente. En Fase 1 el agente es un stub que contesta un texto fijo; el turno real
// (_shared/turno, rol agente) se conecta en Fase 2. Lo llaman el trigger al encolar y el cron
// de contención de cada minuto, siempre con la cabecera x-worker-secret.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { enviarTexto } from "../_shared/whatsapp/enviar.ts";

const SECRETO = Deno.env.get("WORKER_SECRET") ?? "";
const WA = {
  token: Deno.env.get("WA_ACCESS_TOKEN") ?? "",
  phoneNumberId: Deno.env.get("WA_PHONE_NUMBER_ID") ?? "",
};
// El stub solo le contesta a estos números (separados por coma, formato de Meta). A cualquier
// otro no le responde nada: si un cliente real escribe antes de Fase 2, no recibe un
// "recibido" automático. Vacío = no le contesta a nadie.
const TELEFONOS_PRUEBA = new Set(
  (Deno.env.get("WORKER_STUB_TELEFONOS") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
);
const RESPUESTA_STUB = "Recibido. (Prueba del sistema de Otto Su Misura: todavía no responde Lucía.)";
const MAX_POR_LLAMADA = 10;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Trabajo = { id: string; conversacion_id: string; payload: Record<string, unknown> };

async function evento(conversacionId: string, tipo: string, detalle: Record<string, unknown>) {
  const { error } = await supabase.from("eventos_agente").insert({ conversacion_id: conversacionId, tipo, detalle });
  if (error) console.error("no se pudo escribir la bitácora", error);
}

async function procesar(t: Trabajo) {
  const { data: conv, error } = await supabase
    .from("conversaciones")
    .select("estado, clientes(telefono)")
    .eq("id", t.conversacion_id)
    .single();
  if (error || !conv) throw new Error(`conversación ${t.conversacion_id}: ${error?.message ?? "no existe"}`);

  // La derivaron entre que se encoló y ahora: la tiene una persona, Lucía no contesta.
  if (conv.estado !== "activa") {
    await evento(t.conversacion_id, "ok", { etapa: "worker-stub", nota: `conversación ${conv.estado}: sin respuesta` });
    return;
  }

  const cliente = conv.clientes as unknown as { telefono: string } | null;
  const telefono = cliente?.telefono;
  if (!telefono || !TELEFONOS_PRUEBA.has(telefono)) {
    await evento(t.conversacion_id, "ok", { etapa: "worker-stub", nota: "número fuera de la lista de prueba: sin respuesta" });
    return;
  }

  const waMessageId = await enviarTexto(WA, telefono, RESPUESTA_STUB);
  const { error: errMsg } = await supabase.from("mensajes").insert({
    conversacion_id: t.conversacion_id,
    wa_message_id: waMessageId,
    direccion: "saliente",
    tipo: "text",
    contenido: RESPUESTA_STUB,
  });
  if (errMsg) console.error("se envió pero no se pudo guardar el mensaje saliente", errMsg);
  await evento(t.conversacion_id, "ok", { etapa: "worker-stub", respuesta: RESPUESTA_STUB, wa_message_id: waMessageId });
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || SECRETO === "" || req.headers.get("x-worker-secret") !== SECRETO) {
    return new Response("forbidden", { status: 403 });
  }

  const worker = `worker-${crypto.randomUUID().slice(0, 8)}`;
  let procesados = 0;
  for (let i = 0; i < MAX_POR_LLAMADA; i++) {
    const { data, error } = await supabase.rpc("cola_tomar_uno", { p_worker: worker });
    if (error) {
      console.error("cola_tomar_uno falló", error);
      break;
    }
    // setof: la cola vacía devuelve cero filas.
    const trabajo = (Array.isArray(data) ? data[0] : null) as Trabajo | null;
    if (!trabajo) break;

    try {
      await procesar(trabajo);
      await supabase.rpc("cola_terminar", { p_id: trabajo.id, p_ok: true });
    } catch (err) {
      console.error("falló el trabajo", trabajo.id, err);
      await supabase.rpc("cola_terminar", { p_id: trabajo.id, p_ok: false, p_error: String(err) });
      await evento(trabajo.conversacion_id, "error", { etapa: "worker-stub", error: String(err) });
    }
    procesados++;
  }
  return Response.json({ procesados });
});
