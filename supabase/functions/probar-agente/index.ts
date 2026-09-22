// probar-agente (H1.7): el mismo agente, sin Meta ni Calendar real. Recibe {telefono, mensaje}
// por HTTP y corre el turno completo (_shared/turno/turno.ts) contra la base real; la respuesta
// vuelve en el propio HTTP en vez de salir por WhatsApp (control 1 del hito).
//
// Corre LOCAL (`deno run`, más abajo), no desplegado a Supabase — ver docs/hitos/1.7-*.md,
// supuestos: los tests de esta fase usan conexión directa a Postgres (SUPABASE_DB_URL, la
// misma que tests/herramientas), y esa variable vive en el .env local, no como secreto de la
// función desplegada. Es el mismo patrón que usó `paneles` en H1.8 (arnés contra `next start`
// local, no contra un deploy). Cuando el worker real (logica, Fase 2) reemplace esto, va a leer
// la base por el cliente que use el worker ahí — el turno en sí no cambia.
//
// Uso:
//   deno run --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read \
//     --env-file=.env supabase/functions/probar-agente/index.ts
//   curl -X POST http://localhost:8811 -d '{"telefono":"+5493410000001","mensaje":"hola"}'

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { type ClienteSql, dbDesde } from "../_shared/db.ts";
import { calendarioDeEnsayo } from "../_shared/herramientas/tipos.ts";
import { correrTurno } from "../_shared/turno/turno.ts";

const TZ = Deno.env.get("NEGOCIO_TZ") || "America/Argentina/Cordoba";
const DERIVACION_TEL = Deno.env.get("DERIVACION_ALQUILER_TEL")?.trim() || null;
const PUERTO = Number(Deno.env.get("PROBAR_AGENTE_PUERTO") ?? 8811);

function urlDeLaBase(): string {
  const u = Deno.env.get("SUPABASE_DB_URL");
  if (!u) throw new Error("Falta SUPABASE_DB_URL. Corré con --env-file=.env");
  return u;
}

const pool = new pg.Pool({ connectionString: urlDeLaBase(), max: 5 });
// Sin esto, que un cliente OCIOSO del pool se caiga (corte de red, el pooler de Supabase que
// cierra una conexión idle) tira un 'error' no manejado y mata el proceso entero — encontrado
// de verdad el 15/9 corriendo el tester en paralelo: el emulador se cayó a mitad de los
// guiones con "Connection terminated unexpectedly". Con este listener, node-postgres solo
// descarta ese cliente y sigue: la próxima consulta abre uno nuevo.
pool.on("error", (err) => {
  console.error("probar-agente: un cliente ocioso del pool se desconectó, se descarta y sigue:", err.message);
});

type Cuerpo = { telefono?: unknown; mensaje?: unknown };

async function manejar(req: Request): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: "usá POST" }, { status: 405 });

  let cuerpo: Cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "el body tiene que ser JSON" }, { status: 400 });
  }
  const telefono = typeof cuerpo.telefono === "string" ? cuerpo.telefono.trim() : "";
  const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : "";
  if (!telefono || !mensaje) return Response.json({ error: "faltan telefono y/o mensaje" }, { status: 400 });

  const cliente = await pool.connect();
  try {
    const db = dbDesde(cliente as unknown as ClienteSql);
    const ahora = new Date();

    let filaCliente = (await db.consulta<{ id: string }>("select id::text as id from clientes where telefono = $1", [telefono]))[0];
    if (!filaCliente) {
      filaCliente = (await db.consulta<{ id: string }>("insert into clientes (telefono) values ($1) returning id::text as id", [telefono]))[0];
    }

    let conv = (await db.consulta<{ id: string; estado: string }>(
      "select id::text as id, estado from conversaciones where cliente_id = $1 and canal = 'prueba' order by iniciado_at desc limit 1",
      [filaCliente.id],
    ))[0];
    if (!conv) {
      conv = (await db.consulta<{ id: string; estado: string }>(
        "insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id, estado",
        [filaCliente.id],
      ))[0];
    }

    // AGENTE.md § 3 paso 2: guardar y encolar. Acá no hay cola (no hay Meta): se inserta el
    // mensaje y se corre el turno en el mismo pedido.
    await db.consulta(
      "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', $2, $3::timestamptz)",
      [conv.id, mensaje, ahora.toISOString()],
    );

    // AGENTE.md § 3 paso 5, primera línea: conversación CERRADA → no responde Lucía (decisión del
    // equipo, no se deshace sola). Derivada ya NO corta acá (pedido de Mateo, 21/9: "una charla
    // derivada ya no es muda") — se le pasa yaDerivada a correrTurno y el turno decide si se
    // calla (enojo/pide_persona) o sigue contestando, mismo criterio que el worker real (logica).
    // Hallazgo de la auditoría, 22/9: este corte se había quedado con la regla vieja y tapaba
    // por completo el arreglo del 21/9 en el emulador — ningún guión podía probarlo.
    if (conv.estado !== "activa" && conv.estado !== "derivada") {
      return Response.json({ cliente_id: filaCliente.id, conversacion_id: conv.id, pausada: true, mensajes: [] });
    }

    const resultado = await correrTurno(db, {
      clienteId: filaCliente.id,
      telefono,
      conversacionId: conv.id,
      ahora,
      tz: TZ,
      calendario: calendarioDeEnsayo,
      derivacionTel: DERIVACION_TEL,
      yaDerivada: conv.estado === "derivada",
    });

    return Response.json({
      cliente_id: filaCliente.id,
      conversacion_id: conv.id,
      mensajes: resultado.mensajesAlCliente,
      imagenes: resultado.imagenes,
      derivo: resultado.derivo,
      motivo_derivacion: resultado.motivoDerivacion ?? null,
      bloqueado_por_ventana: resultado.bloqueadoPorVentana,
    });
  } catch (e) {
    console.error("probar-agente: error procesando el turno", e);
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  } finally {
    cliente.release();
  }
}

if (import.meta.main) {
  console.log(`probar-agente escuchando en http://localhost:${PUERTO}`);
  Deno.serve({ port: PUERTO, onListen: () => {} }, manejar);
}

export { manejar };
