// Worker: toma trabajos de la cola (cola_tomar_uno: SKIP LOCKED y un solo turno por charla) y
// los atiende con atender.ts, donde contesta Lucía (hito 2.1). Lo llaman el trigger al encolar y
// el cron de contención de cada minuto, siempre con la cabecera x-worker-secret.
// Se conecta directo a Postgres con SUPABASE_DB_URL, que Supabase le da a toda Edge Function: el
// turno de Lucía (_shared/turno) habla SQL por esa conexión.
// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { calendarioPropio } from "../_shared/agenda/calendario_propio.ts";
import { type ClienteSql, dbDesde } from "../_shared/db.ts";
import { correrTurno } from "../_shared/turno/turno.ts";
import { atenderCola, type Dependencias, leerListaTelefonos } from "./atender.ts";

const SECRETO = Deno.env.get("WORKER_SECRET") ?? "";

const dependencias: Dependencias = {
  wa: { token: Deno.env.get("WA_ACCESS_TOKEN") ?? "", phoneNumberId: Deno.env.get("WA_PHONE_NUMBER_ID") ?? "" },
  // WORKER_STUB_TELEFONOS era la lista del stub de Fase 1: vale mientras no esté LUCIA_TELEFONOS.
  telefonosLucia: leerListaTelefonos(Deno.env.get("LUCIA_TELEFONOS") ?? Deno.env.get("WORKER_STUB_TELEFONOS")),
  enviosEncendidos: Deno.env.get("CRONS_ENVIOS") === "on",
  tz: Deno.env.get("NEGOCIO_TZ") || "America/Argentina/Cordoba",
  derivacionTel: Deno.env.get("DERIVACION_ALQUILER_TEL")?.trim() || null,
  baseFotos: `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/catalogo/`,
  calendario: calendarioPropio,
  turno: correrTurno,
  fetcher: fetch,
  ahora: () => new Date(),
  dormir: (ms) => new Promise((listo) => setTimeout(listo, ms)),
};

Deno.serve(async (req) => {
  if (req.method !== "POST" || SECRETO === "" || req.headers.get("x-worker-secret") !== SECRETO) {
    return new Response("forbidden", { status: 403 });
  }

  const cliente = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
  // Un corte de la conexión no puede tirar el proceso: la consulta en curso falla, el trabajo
  // vuelve a la cola y lo levanta el cron.
  cliente.on("error", (e) => console.error("worker: se cortó la conexión con la base", e.message));
  await cliente.connect();
  try {
    const worker = `worker-${crypto.randomUUID().slice(0, 8)}`;
    const procesados = await atenderCola(dbDesde(cliente as unknown as ClienteSql), dependencias, worker);
    return Response.json({ procesados });
  } finally {
    await cliente.end().catch(() => {});
  }
});
