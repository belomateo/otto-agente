// Worker: toma trabajos de la cola (FOR UPDATE SKIP LOCKED, vía cola_tomar_uno) y corre el
// turno del agente. En Fase 1 el agente es un stub que contesta un texto fijo; el turno real
// (_shared/turno, rol agente) se conecta en Fase 2. Lo llaman el trigger al encolar y el cron
// de contención de cada minuto, siempre con la cabecera x-worker-secret.
// Antes que Lucía, en código (hito 1.14): la respuesta al botón "Confirmo" de un recordatorio
// confirma el turno y contesta el texto fijo `texto_turno_confirmado`, aunque la charla la
// tenga una persona. Todo texto libre sale solo dentro de la ventana de 24 hs de WhatsApp.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { botonDeTurno } from "../_shared/whatsapp/botones.ts";
import { enviarTexto } from "../_shared/whatsapp/enviar.ts";
import { puedeTextoLibre } from "../_shared/whatsapp/ventana.ts";

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
// Con los envíos prendidos (cron-envios, se prende cuando Meta aprueba las plantillas), el
// "Confirmo" viene de un recordatorio real y se le contesta a cualquiera.
const ENVIOS_ENCENDIDOS = Deno.env.get("CRONS_ENVIOS") === "on";
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

async function ultimoMensajeDelCliente(conversacionId: string): Promise<Date | null> {
  const { data } = await supabase
    .from("mensajes")
    .select("enviado_at")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .order("enviado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.enviado_at ? new Date(data.enviado_at) : null;
}

// Texto libre al cliente, guardado en la charla. Fuera de la ventana de 24 hs no sale: Meta solo
// acepta plantillas (control 5 de 1.14).
async function responder(conversacionId: string, telefono: string, texto: string, etapa: string) {
  if (!puedeTextoLibre(await ultimoMensajeDelCliente(conversacionId), new Date())) {
    await evento(conversacionId, "error", { etapa, error: "fuera de la ventana de 24 hs: solo se puede mandar una plantilla" });
    return;
  }
  const waMessageId = await enviarTexto(WA, telefono, texto);
  const { error } = await supabase.from("mensajes").insert({
    conversacion_id: conversacionId,
    wa_message_id: waMessageId,
    direccion: "saliente",
    tipo: "text",
    contenido: texto,
  });
  if (error) console.error("se envió pero no se pudo guardar el mensaje saliente", error);
  await evento(conversacionId, "ok", { etapa, respuesta: texto, wa_message_id: waMessageId });
}

async function textoFijo(clave: string): Promise<string | null> {
  const { data } = await supabase.from("contexto_agente").select("valor").eq("clave", clave).maybeSingle();
  return typeof data?.valor === "string" && data.valor.trim() ? data.valor : null;
}

async function confirmarPorBoton(t: Trabajo, turnoId: string, telefono: string | undefined) {
  const { data: resultado, error } = await supabase.rpc("turno_confirmar_por_boton", {
    p_turno: turnoId,
    p_conversacion: t.conversacion_id,
  });
  if (error) throw new Error(`turno_confirmar_por_boton: ${error.message}`);
  await evento(t.conversacion_id, "ok", { etapa: "boton-confirmo", turno_id: turnoId, resultado });
  if (resultado === "no_corresponde" || !telefono) return;
  if (!ENVIOS_ENCENDIDOS && !TELEFONOS_PRUEBA.has(telefono)) return;
  const texto = await textoFijo("texto_turno_confirmado");
  if (texto) await responder(t.conversacion_id, telefono, texto, "boton-confirmo");
}

async function procesar(t: Trabajo) {
  const { data: conv, error } = await supabase
    .from("conversaciones")
    .select("estado, clientes(telefono)")
    .eq("id", t.conversacion_id)
    .single();
  if (error || !conv) throw new Error(`conversación ${t.conversacion_id}: ${error?.message ?? "no existe"}`);
  const cliente = conv.clientes as unknown as { telefono: string } | null;
  const telefono = cliente?.telefono;

  // El botón "Confirmo" lo resuelve el código, con la charla activa o derivada.
  const boton = botonDeTurno(t.payload?.mensaje);
  if (boton?.accion === "confirmar") return await confirmarPorBoton(t, boton.turnoId, telefono);

  // La derivaron entre que se encoló y ahora: la tiene una persona, Lucía no contesta.
  if (conv.estado !== "activa") {
    await evento(t.conversacion_id, "ok", { etapa: "worker-stub", nota: `conversación ${conv.estado}: sin respuesta` });
    return;
  }
  // "Necesito reprogramar": lo retoma Lucía con reprogramar_turno (Fase 2); queda anotado.
  if (boton?.accion === "reprogramar") {
    await evento(t.conversacion_id, "ok", { etapa: "boton-reprogramar", turno_id: boton.turnoId });
  }

  if (!telefono || !TELEFONOS_PRUEBA.has(telefono)) {
    await evento(t.conversacion_id, "ok", { etapa: "worker-stub", nota: "número fuera de la lista de prueba: sin respuesta" });
    return;
  }
  await responder(t.conversacion_id, telefono, RESPUESTA_STUB, "worker-stub");
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
      await evento(trabajo.conversacion_id, "error", { etapa: "worker", error: String(err) });
    }
    procesados++;
  }
  return Response.json({ procesados });
});
