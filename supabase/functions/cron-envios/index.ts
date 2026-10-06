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
import { armarPlantilla, esTipoEnvio, NOMBRE_PLANTILLA, primerNombre, type TipoEnvio } from "../_shared/whatsapp/plantillas.ts";
import { igualesEnTiempoConstante } from "../_shared/whatsapp/firma.ts";
import { telefonoParaMeta } from "../_shared/whatsapp/telefono.ts";

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

// Registrar que la plantilla salió, insistiendo un poco. El envío ya ocurrió y no se puede
// deshacer, así que lo único que queda es dejar constancia: mientras no la haya, el rescate de
// los 15 minutos puede repetir el mensaje. Tres intentos con una pausa corta cubren el caso
// normal (un parpadeo de la base). Si la base está caída más que eso, el sistema entero está
// caído y esto es el menor de los problemas — pero al menos se informa, que es lo que faltaba.
const INTENTOS_REGISTRO = 3;
const PAUSA_REGISTRO_MS = 400;

async function registrarConReintento(id: string, wamid: string, texto: string): Promise<boolean> {
  for (let intento = 1; intento <= INTENTOS_REGISTRO; intento++) {
    const { error } = await supabase.rpc("envio_terminar", {
      p_id: id,
      p_ok: true,
      p_wa_message_id: wamid,
      p_texto: texto,
      p_error: null,
    });
    if (!error) return true;
    console.error(`envio_terminar falló (intento ${intento}/${INTENTOS_REGISTRO})`, id, error.message);
    if (intento < INTENTOS_REGISTRO) await new Promise((r) => setTimeout(r, PAUSA_REGISTRO_MS * intento));
  }
  return false;
}

// ¿Meta ya aprobó esta plantilla? Solo se pregunta por la del segundo recontacto, que es nueva
// (6/10): hasta que esté aprobada, ese envío no sale — antes era la misma plantilla del primero y
// al cliente le llegaba el mismo mensaje dos veces. Sin WA_WABA_ID, o si Meta no contesta, se toma
// como "todavía no": mejor un solo recontacto que uno rechazado o repetido.
const WABA_ID = Deno.env.get("WA_WABA_ID") ?? "";
async function plantillaAprobada(nombre: string): Promise<boolean> {
  if (!WABA_ID || !WA.token) return false;
  try {
    const url = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates?name=${encodeURIComponent(nombre)}&fields=name,status`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${WA.token}` } });
    if (!r.ok) return false;
    const j = await r.json() as { data?: { name: string; status: string }[] };
    return (j.data ?? []).some((t) => t.name === nombre && t.status === "APPROVED");
  } catch {
    return false;
  }
}

async function enviarTipo(tipo: TipoEnvio, linkResena: string | null) {
  if (tipo === "recontacto_2" && !(await plantillaAprobada(NOMBRE_PLANTILLA.recontacto_2))) {
    return {
      tipo, candidatos: 0, enviados: 0, errores: 0, sin_registrar: [] as string[],
      omitidos: [`la plantilla ${NOMBRE_PLANTILLA.recontacto_2} todavía no está aprobada en Meta: el segundo recontacto queda en pausa`],
    };
  }
  const { data, error } = await supabase.rpc("envios_pendientes", { p_tipo: tipo, p_tz: TZ });
  if (error) throw new Error(`envios_pendientes(${tipo}): ${error.message}`);
  const candidatos = (data ?? []) as Candidato[];
  const r = { tipo, candidatos: candidatos.length, enviados: 0, errores: 0, omitidos: [] as string[], sin_registrar: [] as string[] };

  for (const c of candidatos) {
    // Antes de reservar el envío: sin un número válido, Meta lo rechaza igual (2/10: los turnos
    // importados de doyTurnos tienen "sin teléfono · Nombre"). Se saltea y queda en omitidos.
    const telefono = telefonoParaMeta(c.telefono);
    if (!telefono) {
      r.omitidos.push(`${c.referencia}: sin teléfono válido`);
      continue;
    }
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
      const wamid = await enviarPlantilla(WA, telefono, plantilla);
      // La plantilla YA salió: el cliente la tiene en el celular. Si acá no se puede registrar,
      // la fila queda en 'reservado' y el rescate de envio_reservar (0021: estado 'reservado' y
      // actualizado_at de hace más de 15 minutos) la vuelve a mandar — el mismo recordatorio dos
      // veces al mismo cliente, y encima cuesta plata porque es una plantilla de Meta.
      // Antes esto era un console.error suelto y se contaba como enviado: nadie se enteraba.
      // Hallazgo de la auditoría del 22/9.
      const registrado = await registrarConReintento(id, wamid, plantilla.texto);
      if (registrado) {
        r.enviados++;
      } else {
        // Salió de verdad, así que NO es un error de envío — pero tampoco es un éxito limpio:
        // queda expuesto a que el rescate lo repita. Se cuenta aparte y se nombra, para que la
        // corrida no informe "todo bien" cuando hay algo que puede duplicarse.
        r.sin_registrar.push(c.referencia);
        console.error("se envió pero no se pudo registrar tras reintentar", id, c.referencia);
      }
    } catch (err) {
      await supabase.rpc("envio_terminar", { p_id: id, p_ok: false, p_wa_message_id: null, p_texto: plantilla.texto, p_error: String(err) });
      r.errores++;
    }
  }
  return r;
}

// Confirmación inmediata al crear un turno desde el panel: usa la plantilla recordatorio_turno
// (ya aprobada en Meta) con el mismo contenido que el recordatorio de 18h. Se llama desde
// altaTurno (panel/lib/edicion/turno-alta.ts) en modo fire-and-forget. Si el turno ya tiene
// recordatorio_enviado_at (porque se creó desde Lucía y el recordatorio ya salió), se omite.
// Se reserva y registra como el recordatorio de ese turno (envio_reservar/envio_terminar), igual
// que el cron: así queda en la charla del panel y en la bitácora, y el de 18h no sale de nuevo
// (envios_programados es único por tipo y referencia). Antes se mandaba por fuera y no quedaba
// rastro en el panel (prueba de Mateo, 2/10).
async function confirmarTurno(turnoId: string): Promise<Response> {
  if (!ENCENDIDO) return Response.json({ apagado: true });
  if (!TZ) return new Response("falta NEGOCIO_TZ", { status: 500 });

  const { data: turno, error: eT } = await supabase
    .from("turnos")
    .select("id, cliente_id, inicio, recordatorio_enviado_at, clientes(nombre, telefono)")
    .eq("id", turnoId)
    .maybeSingle();
  if (eT) return Response.json({ error: eT.message }, { status: 500 });
  if (!turno) return Response.json({ omitido: true, motivo: "turno_no_existe" });
  if (turno.recordatorio_enviado_at) return Response.json({ omitido: true, motivo: "ya_enviado" });

  const cliente = (turno.clientes as unknown as { nombre: string | null; telefono: string } | null);
  const telefono = telefonoParaMeta(cliente?.telefono);
  if (!telefono) return Response.json({ omitido: true, motivo: "sin_telefono" });

  const plantilla = armarPlantilla("recordatorio_18h", {
    nombre: cliente?.nombre ?? null,
    inicio: new Date(turno.inicio as string),
    referencia: turnoId,
    linkResena: null,
  }, TZ);
  if ("falta" in plantilla) return Response.json({ omitido: true, falta: plantilla.falta });

  const { data: id, error: errReserva } = await supabase.rpc("envio_reservar", {
    p_tipo: "recordatorio_18h",
    p_referencia: turnoId,
    p_cliente: turno.cliente_id,
    p_plantilla: plantilla.nombre,
  });
  if (errReserva) return Response.json({ error: `envio_reservar: ${errReserva.message}` }, { status: 500 });
  if (!id) return Response.json({ omitido: true, motivo: "ya_enviado" });

  try {
    const wamid = await enviarPlantilla(WA, telefono, plantilla);
    const registrado = await registrarConReintento(id, wamid, plantilla.texto);
    if (!registrado) console.error("confirmacion_turno: se envió pero no se pudo registrar", turnoId, wamid);
    console.log("confirmacion_turno enviada", turnoId, wamid);
    return Response.json({ enviado: true, wamid, registrado });
  } catch (err) {
    await supabase.rpc("envio_terminar", { p_id: id, p_ok: false, p_wa_message_id: null, p_texto: plantilla.texto, p_error: String(err) });
    console.error("confirmacion_turno falló", turnoId, String(err));
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || SECRETO === "" || !igualesEnTiempoConstante(req.headers.get("x-worker-secret") ?? "", SECRETO)) {
    return new Response("forbidden", { status: 403 });
  }
  const body = await req.json().catch(() => ({ tipo: null }));
  const { tipo } = body;

  // Confirmación inmediata al crear turno desde el panel (turno-alta.ts)
  if (tipo === "confirmacion_turno") return confirmarTurno(body.turno_id ?? "");

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
