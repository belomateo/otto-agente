// Envíos por plantilla de WhatsApp (hito 1.14): el recordatorio 24 hs antes del turno, el
// agradecimiento con pedido de reseña y los dos recontactos. Lo llaman los crons de 0022 con
// x-worker-secret y {tipo}. A quién le toca lo decide la base (envios_pendientes); acá se arma
// cada plantilla, se reserva el envío (así no sale dos veces aunque dos corridas se pisen), se
// manda y se registra (envio_terminar: mensaje en la charla, bitácora y, en el recordatorio,
// turnos.recordatorio_enviado_at).
// Mientras CRONS_ENVIOS no valga "on" no manda nada: se prende cuando Meta aprueba las
// plantillas. Hasta entonces los crons corren y la función contesta que está apagada.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { enlaceDeTipo } from "../_shared/herramientas/enlaces.ts";
import type { Db } from "../_shared/db.ts";
import { enviarPlantilla } from "../_shared/whatsapp/enviar.ts";
import { armarPlantilla, esTipoEnvio, type TipoEnvio } from "../_shared/whatsapp/plantillas.ts";

const SECRETO = Deno.env.get("WORKER_SECRET") ?? "";
const ENCENDIDO = Deno.env.get("CRONS_ENVIOS") === "on";
const TZ = Deno.env.get("NEGOCIO_TZ") ?? "";
const WA = {
  token: Deno.env.get("WA_ACCESS_TOKEN") ?? "",
  phoneNumberId: Deno.env.get("WA_PHONE_NUMBER_ID") ?? "",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Candidato = { referencia: string; cliente_id: string; telefono: string; nombre: string | null; inicio: string | null };

// enlaces.ts de agente lee con una Db de SQL; acá alcanza con la tabla por PostgREST.
const dbEnlaces: Db = {
  async consulta<T>() {
    const { data, error } = await supabase.from("enlaces").select("nombre, url").eq("activo", true).order("nombre");
    if (error) throw new Error(`enlaces: ${error.message}`);
    return (data ?? []) as T[];
  },
};

async function enviarTipo(tipo: TipoEnvio, linkResena: string | null) {
  const { data, error } = await supabase.rpc("envios_pendientes", { p_tipo: tipo, p_tz: TZ });
  if (error) throw new Error(`envios_pendientes(${tipo}): ${error.message}`);
  const candidatos = (data ?? []) as Candidato[];
  const r = { tipo, candidatos: candidatos.length, enviados: 0, errores: 0, omitidos: [] as string[] };

  for (const c of candidatos) {
    const plantilla = armarPlantilla(tipo, {
      nombre: c.nombre,
      inicio: c.inicio ? new Date(c.inicio) : null,
      referencia: c.referencia,
      linkResena,
    }, TZ);
    if ("falta" in plantilla) {
      r.omitidos.push(`${c.referencia}: falta ${plantilla.falta}`);
      continue;
    }
    const { data: id, error: errReserva } = await supabase.rpc("envio_reservar", {
      p_tipo: tipo,
      p_referencia: c.referencia,
      p_cliente: c.cliente_id,
      p_plantilla: plantilla.nombre,
    });
    if (errReserva) throw new Error(`envio_reservar: ${errReserva.message}`);
    if (!id) continue; // ya salió, lo está mandando otra corrida o se agotaron los intentos

    try {
      const wamid = await enviarPlantilla(WA, c.telefono, plantilla);
      const { error: e } = await supabase.rpc("envio_terminar", { p_id: id, p_ok: true, p_wa_message_id: wamid, p_texto: plantilla.texto, p_error: null });
      if (e) console.error("se envió pero no se pudo registrar", id, e);
      r.enviados++;
    } catch (err) {
      await supabase.rpc("envio_terminar", { p_id: id, p_ok: false, p_wa_message_id: null, p_texto: plantilla.texto, p_error: String(err) });
      r.errores++;
    }
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || SECRETO === "" || req.headers.get("x-worker-secret") !== SECRETO) {
    return new Response("forbidden", { status: 403 });
  }
  const { tipo } = await req.json().catch(() => ({ tipo: null }));
  const tipos: unknown[] = tipo === "recontacto" ? ["recontacto_1", "recontacto_2"] : [tipo];
  if (!tipos.every(esTipoEnvio)) return new Response("tipo desconocido", { status: 400 });
  if (!ENCENDIDO) return Response.json({ apagado: true, tipos });
  if (!TZ) return new Response("falta NEGOCIO_TZ", { status: 500 });

  const linkResena = tipos.includes("agradecimiento_resena") ? (await enlaceDeTipo(dbEnlaces, "resena"))?.url ?? null : null;
  const resultados = [];
  for (const t of tipos as TipoEnvio[]) resultados.push(await enviarTipo(t, linkResena));
  console.log(JSON.stringify(resultados));
  return Response.json({ resultados });
});
