// Analista de charlas (0102, pedido de Mateo del 9/10 y 10/10): cada noche revisa las charlas del día
// anterior en que habló Lucía y deja en analisis_charlas sus errores (citando el mensaje textual) y
// las mejoras sugeridas, para Bitácora › Analista. Nunca cambia nada solo (PROCESOS.md § 6).
//
// La llaman, siempre por POST y con x-worker-secret (igual que cron-envios):
//  · el cron de 0102 a las 03:00 de Argentina (y a las 04:00, de contención), con {} → analiza ayer;
//  · a mano, para una fecha: { "fecha": "2026-10-09" } (solo días que ya terminaron);
//  · ella misma, por analista_relevo (0102), cuando se queda sin tiempo y quedan charlas:
//    { "fecha": ..., "relevo": n }.
// Una charla ya analizada no se vuelve a analizar (analisis_revisiones): correrla dos veces para la
// misma fecha no duplica nada ni gasta de nuevo.
//
// El modelo: LLM_ANALISTA y, si no está, LLM_PRINCIPAL (el de Lucía). Cuánto piensa:
// LLM_RAZONAMIENTO_ANALISTA (low si no se dice). Topes por noche en noche.ts (80 charlas, US$ 1).
// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { type ClienteSql, dbDesde } from "../_shared/db.ts";
import { apiKey } from "../_shared/llm/cliente.ts";
import { fechaLocal } from "../_shared/tiempo.ts";
import { igualesEnTiempoConstante } from "../_shared/whatsapp/firma.ts";
import { promptDeLucia } from "../worker/prompt.ts";
import { repositorioSql } from "./base.ts";
import { correrNoche, debePedirRelevo, llamadaReal } from "./noche.ts";
import { leerPedido, modeloDelAnalista, razonamientoDelAnalista } from "./pedido.ts";

const SECRETO = Deno.env.get("WORKER_SECRET") ?? "";
const TZ = Deno.env.get("NEGOCIO_TZ") || "America/Argentina/Cordoba";

Deno.serve(async (req) => {
  if (req.method !== "POST" || SECRETO === "" || !igualesEnTiempoConstante(req.headers.get("x-worker-secret") ?? "", SECRETO)) {
    return new Response("forbidden", { status: 403 });
  }
  const ahora = new Date();
  const pedido = leerPedido(await req.json().catch(() => ({})), ahora, TZ);
  if ("error" in pedido) return Response.json({ error: pedido.error }, { status: 400 });

  // Sin modelo o sin clave no se toca nada: si no, cada charla de la noche quedaría como fallo por
  // algo que no es de la charla.
  const modelo = modeloDelAnalista(Deno.env.get("LLM_ANALISTA"), Deno.env.get("LLM_PRINCIPAL"));
  if (!modelo) return Response.json({ error: "falta LLM_ANALISTA (o LLM_PRINCIPAL): no hay con qué analizar" }, { status: 500 });
  try {
    apiKey(modelo);
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }

  const cliente = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
  cliente.on("error", (e) => console.error("analista: se cortó la conexión con la base", e.message));
  await cliente.connect();
  try {
    const db = dbDesde(cliente as unknown as ClienteSql);
    const repo = repositorioSql(db, TZ);
    // Las reglas de Lucía, de donde las lee ella: prompt.md, y la base de respaldo (worker/prompt.ts).
    const { texto: prompt } = await promptDeLucia(db, ahora);
    const hoy = fechaLocal(ahora, TZ);
    const resumen = await correrNoche(
      { fecha: pedido.fecha, tz: TZ, prompt },
      {
        repo,
        llamarModelo: llamadaReal({ modelo, razonamiento: razonamientoDelAnalista(Deno.env.get("LLM_RAZONAMIENTO_ANALISTA")), fecha: pedido.fecha, hoy }),
        ahora: () => Date.now(),
      },
    );
    const relevo = debePedirRelevo(resumen, pedido.relevo);
    if (relevo) await repo.pedirRelevo(pedido.fecha, pedido.relevo + 1);
    const salida = { ...resumen, modelo, relevo };
    console.log(JSON.stringify(salida));
    return Response.json(salida);
  } catch (e) {
    console.error("analista: la corrida falló", e);
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  } finally {
    await cliente.end().catch(() => {});
  }
});
