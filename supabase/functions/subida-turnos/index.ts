// Subida de turnos (pedido de Mateo, 14/10): cada noche a las 00:00 (hora de Argentina) revisa las charlas del día
// anterior —las de Lucía y las que atiende el local— y sube al panel los turnos que quedaron acordados por chat y
// no figuran. Lo que no se puede subir queda en la lista de revisión (tabla subida_turnos, 0105) y, en modo real,
// con la etiqueta «Falta datos para agendar».
//
// La llaman, siempre por POST y con x-worker-secret (igual que analista y cron-envios):
//  · el cron de 0105 a las 00:00 y a las 01:00 de Argentina, con {} → ayer y hoy;
//  · a mano: { "modo": "prueba" | "real" }. Sin modo, vale SUBIDA_TURNOS_MODO y, si no está, «prueba».
// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { type ClienteSql, dbDesde } from "../_shared/db.ts";
import { apiKey } from "../_shared/llm/cliente.ts";
import { igualesEnTiempoConstante } from "../_shared/whatsapp/firma.ts";
import { correrNoche, type Modo } from "./noche.ts";

const SECRETO = Deno.env.get("WORKER_SECRET") ?? "";
const TZ = Deno.env.get("NEGOCIO_TZ") || "America/Argentina/Cordoba";

function modoPedido(cuerpo: unknown): Modo {
  const pedido = (cuerpo as { modo?: unknown })?.modo;
  const env = Deno.env.get("SUBIDA_TURNOS_MODO");
  const elegido = pedido ?? env;
  return elegido === "real" ? "real" : "prueba";
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || SECRETO === "" || !igualesEnTiempoConstante(req.headers.get("x-worker-secret") ?? "", SECRETO)) {
    return new Response("forbidden", { status: 403 });
  }
  if (!Deno.env.get("LLM_EXTRACTOR")) return Response.json({ error: "falta LLM_EXTRACTOR: no hay con qué leer las charlas" }, { status: 500 });
  try {
    apiKey();
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
  const modo = modoPedido(await req.json().catch(() => ({})));
  const cliente = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
  cliente.on("error", (e) => console.error("subida-turnos: se cortó la conexión con la base", e.message));
  await cliente.connect();
  try {
    const resumen = await correrNoche(dbDesde(cliente as unknown as ClienteSql), { ahora: new Date(), tz: TZ, modo });
    console.log("subida-turnos", JSON.stringify({ ...resumen, cargados: resumen.cargados.length, movidos: resumen.movidos.length }));
    return Response.json(resumen);
  } catch (e) {
    console.error("subida-turnos: falló la corrida", e);
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  } finally {
    await cliente.end().catch(() => {});
  }
});
