// El worker de verdad (hito 2.1, decisión #15 de Mateo, 15/9): toma trabajos de la cola y a los
// números habilitados les contesta Lucía con el turno completo de agente (_shared/turno), el mismo
// que corre el emulador. Lo que es de logica y vive acá: cuándo corre el turno (uno por charla a
// la vez y después de la quietud de la ráfaga), a quién le contesta Lucía, y entregar por
// WhatsApp lo que devuelve, burbuja por burbuja y dentro de la ventana de 24 hs.
//
// Todo pasa por la conexión directa a Postgres (Db, la misma interfaz que usa el turno): así las
// pruebas corren el worker entero adentro de una transacción con rollback.
import type { Db } from "../_shared/db.ts";
import type { Calendario } from "../_shared/herramientas/tipos.ts";
import type { ParametrosTurno, ResultadoTurno } from "../_shared/turno/turno.ts";
import { botonDeTurno } from "../_shared/whatsapp/botones.ts";
import { type ConfigWhatsapp, enviarImagen, enviarImagenPorId, enviarTexto, subirMedia } from "../_shared/whatsapp/enviar.ts";
import { type Adjuntos, bajarAdjunto, nombreDeArchivo } from "./adjuntos.ts";
import { prepararParaEnviar } from "../_shared/whatsapp/preparar.ts";
import { puedeTextoLibre } from "../_shared/whatsapp/ventana.ts";

// AGENTE.md § 3 paso 3: se espera a que el cliente deje de escribir 4 s, así una ráfaga se
// contesta junta. Con tope, para que un cliente que no para de escribir igual tenga respuesta.
export const QUIETUD_RAFAGA_MS = 4_000;
export const ESPERA_MAXIMA_RAFAGA_MS = 12_000;
// Una llamada atiende varios trabajos seguidos, pero cada turno puede llevar hasta 25 s: pasado
// el presupuesto no toma otro, y lo levanta la próxima llamada (el trigger o el cron).
export const MAX_POR_LLAMADA = 10;
export const PRESUPUESTO_LLAMADA_MS = 60_000;
// Si Meta falla, un reintento; si vuelve a fallar, lo que no salió queda en la bitácora.
export const PAUSA_REINTENTO_MS = 1_000;
// Los teléfonos ficticios de las pruebas (5490000000…, no existen): Lucía les contesta, estén o no
// en LUCIA_TELEFONOS, y la respuesta queda en la base, pero no sale nada por Meta.
export const PREFIJO_TELEFONO_FICTICIO = "5490000000";
// La marca con que mostrador_enviar (0028) guarda en la charla lo que escribe el equipo desde el
// panel: Lucía la lee en el historial; al cliente le llega sin ella.
export const MARCA_MOSTRADOR = "[mostrador] ";

export type Trabajo = { id: string; conversacion_id: string; payload: Record<string, unknown> | null };

// A quién le contesta Lucía (LUCIA_TELEFONOS): números en formato de Meta separados por coma, o
// "*" para todos. Vacío: a nadie.
export type ListaTelefonos = { todos: boolean; numeros: ReadonlySet<string> };

export function leerListaTelefonos(valor: string | null | undefined): ListaTelefonos {
  const partes = (valor ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return { todos: partes.includes("*"), numeros: new Set(partes.filter((t) => t !== "*")) };
}

export const esTelefonoFicticio = (telefono: string) => telefono.startsWith(PREFIJO_TELEFONO_FICTICIO);

// Los ficticios no hace falta ponerlos en la lista: así los guiones de agente corren contra el
// worker sin tocar LUCIA_TELEFONOS.
export const contestaLucia = (lista: ListaTelefonos, telefono: string) =>
  lista.todos || lista.numeros.has(telefono) || esTelefonoFicticio(telefono);

// catalogo_alquiler.fotos guarda la ruta adentro del bucket público `catalogo` (la sube el
// panel); Meta necesita el link entero.
export function urlDeFoto(baseCatalogo: string, foto: string): string {
  if (/^https?:\/\//i.test(foto)) return foto;
  const base = baseCatalogo.endsWith("/") ? baseCatalogo : `${baseCatalogo}/`;
  return base + foto.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
}

export function esperaDeRafagaMs(ultimoMensajeAt: Date, ahora: Date): number {
  return Math.max(0, QUIETUD_RAFAGA_MS - (ahora.getTime() - ultimoMensajeAt.getTime()));
}

export type Dependencias = {
  wa: ConfigWhatsapp;
  telefonosLucia: ListaTelefonos;
  enviosEncendidos: boolean; // CRONS_ENVIOS=on (1.14): el "Confirmo" se le contesta a cualquiera
  tz: string;
  derivacionTel: string | null;
  baseFotos: string; // <SUPABASE_URL>/storage/v1/object/public/catalogo/
  adjuntos: Adjuntos; // el bucket privado, para las fotos que manda el equipo desde el panel
  calendario: Calendario;
  turno: (db: Db, p: ParametrosTurno) => Promise<ResultadoTurno>;
  fetcher: typeof fetch; // Meta
  ahora: () => Date;
  dormir: (ms: number) => Promise<void>;
};

const mensajeDeError = (e: unknown) => String((e as Error)?.message ?? e);

async function evento(db: Db, conversacionId: string, tipo: "ok" | "error", detalle: Record<string, unknown>) {
  try {
    await db.consulta("insert into eventos_agente (conversacion_id, tipo, detalle) values ($1::uuid, $2, $3::jsonb)", [
      conversacionId,
      tipo,
      JSON.stringify(detalle),
    ]);
  } catch (e) {
    console.error("worker: no se pudo escribir la bitácora", mensajeDeError(e));
  }
}

async function ultimoMensajeDelCliente(db: Db, conversacionId: string): Promise<Date | null> {
  const [f] = await db.consulta<{ at: Date | string | null }>(
    "select max(enviado_at) as at from mensajes where conversacion_id = $1::uuid and direccion = 'entrante'",
    [conversacionId],
  );
  return f?.at ? new Date(f.at) : null;
}

async function textoFijo(db: Db, clave: string): Promise<string | null> {
  const [f] = await db.consulta<{ valor: unknown }>("select valor from contexto_agente where clave = $1", [clave]);
  return typeof f?.valor === "string" && f.valor.trim() ? f.valor : null;
}

async function conReintento<T>(d: Dependencias, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await d.dormir(PAUSA_REINTENTO_MS);
    return await fn();
  }
}

// Texto libre del propio worker (la respuesta al "Confirmo"): sale y queda en la charla.
async function responder(db: Db, d: Dependencias, conversacionId: string, telefono: string, texto: string, etapa: string) {
  if (!puedeTextoLibre(await ultimoMensajeDelCliente(db, conversacionId), d.ahora())) {
    await evento(db, conversacionId, "error", { etapa, error: "fuera de la ventana de 24 hs: solo se puede mandar una plantilla" });
    return;
  }
  const simulado = esTelefonoFicticio(telefono);
  const partes = prepararParaEnviar([texto]);
  const wamids: (string | null)[] = [];
  for (const parte of partes) {
    const waMessageId = simulado ? null : await conReintento(d, () => enviarTexto(d.wa, telefono, parte, d.fetcher));
    await db.consulta(
      "insert into mensajes (conversacion_id, wa_message_id, direccion, tipo, contenido) values ($1::uuid, $2, 'saliente', 'texto', $3)",
      [conversacionId, waMessageId, parte],
    );
    wamids.push(waMessageId);
  }
  await evento(db, conversacionId, "ok", { etapa, respuesta: partes.join("\n\n"), wa_message_ids: wamids, ...(simulado ? { simulado: true } : {}) });
}

// Las burbujas que el turno guardó (paso 9, sin wamid) y el cliente nunca recibió: afuera de la
// charla, así el panel muestra lo que de verdad le llegó y el próximo turno vuelve a contestar lo
// que quedó sin respuesta.
async function borrarSinEnviar(db: Db, conversacionId: string, burbujas: string[]) {
  for (const texto of burbujas) {
    await db.consulta(
      `delete from mensajes where id = (
         select id from mensajes
          where conversacion_id = $1::uuid and direccion = 'saliente' and wa_message_id is null and contenido = $2
          order by enviado_at desc limit 1)`,
      [conversacionId, texto],
    );
  }
}

// Lo que devolvió el turno sale por Meta en orden: primero las burbujas, cada una completa su fila
// con el wamid; después las fotos. Si una burbuja no sale ni con el reintento se cortan las que
// siguen (el orden importa). El turno no se repite: ya corrió, ya agendó si tenía que agendar.
// Si el turno guardó sus burbujas tal como las escribió (el turno de antes de 2.3), se cambian en
// la charla por las preparadas: la charla guarda lo que de verdad le llega al cliente.
async function reemplazarBurbujas(db: Db, conversacionId: string, viejas: string[], nuevas: string[]) {
  await borrarSinEnviar(db, conversacionId, viejas);
  for (const texto of nuevas) {
    await db.consulta(
      `insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at)
       select $1::uuid, 'saliente', 'texto', $2, greatest(clock_timestamp(), max(enviado_at) + interval '10 milliseconds')
         from mensajes where conversacion_id = $1::uuid`,
      [conversacionId, texto],
    );
  }
}

// La fila de una burbuja que todavía no salió. Se busca por contenido porque el turno las
// guardó él (paso 9) y el worker no tiene sus ids.
async function filaDeBurbuja(db: Db, conversacionId: string, texto: string) {
  const [f] = await db.consulta<{ id: string }>(
    `select id::text as id from mensajes
      where conversacion_id = $1::uuid and direccion = 'saliente' and wa_message_id is null
        and no_enviado_motivo is null and contenido = $2
      order by enviado_at limit 1`,
    [conversacionId, texto],
  );
  return f?.id ?? null;
}

// Manda las burbujas en orden, marcando cada fila ANTES de llamar a Meta (0044). Si Meta falla
// (ya con el reintento adentro), limpia la marca —sabemos que no salió, porque la excepción la
// manejamos nosotros— y RELANZA: el trabajo vuelve a la cola en vez de darse por hecho, que era
// el agujero por el que se perdían respuestas. La marca sin limpiar queda solo si el proceso
// muere en el medio: ese es el caso "en duda" que retomarEnvio no repite.
async function mandarBurbujas(db: Db, d: Dependencias, conversacionId: string, telefono: string, burbujas: string[]) {
  let enviadas = 0;
  for (const texto of burbujas) {
    const id = await filaDeBurbuja(db, conversacionId, texto);
    if (id) await db.consulta("update mensajes set enviando_at = now() where id = $1::uuid", [id]);
    try {
      const waMessageId = await conReintento(d, () => enviarTexto(d.wa, telefono, texto, d.fetcher));
      if (id) await db.consulta("update mensajes set wa_message_id = $2 where id = $1::uuid", [id, waMessageId]);
      enviadas++;
    } catch (e) {
      if (id) await db.consulta("update mensajes set enviando_at = null where id = $1::uuid", [id]);
      await evento(db, conversacionId, "error", { etapa: "envio", error: mensajeDeError(e), sin_enviar: burbujas.slice(enviadas) });
      throw e;
    }
  }
  return enviadas;
}

// El trabajo ya pensó (cola_trabajos.respondido_at) y se está reintentando: NO se vuelve a correr
// el turno —Lucía nunca piensa dos veces lo mismo y el cliente recibiría otra respuesta— sino que
// se termina de mandar lo que quedó sin salir. Si alguna burbuja quedó "en duda" (marcada como
// enviándose y sin wamid: el proceso murió en el medio), no se reintenta: se marca y la charla va
// a una persona, que ve el hilo y decide. Mejor que falte un mensaje a que el cliente lo reciba
// dos veces.
async function retomarEnvio(db: Db, d: Dependencias, t: Trabajo, telefono: string) {
  // Solo lo que dejó Lucía: si en el medio alguien del local escribió desde el panel, ese mensaje
  // es del mostrador y lo manda enviarDelMostrador con su propio trabajo — acá saldría con la
  // marca «[mostrador] » puesta, que es interna y el cliente no tiene que ver (hallazgo de la
  // auditoría del 16/9).
  const pendientes = await db.consulta<{ id: string; contenido: string | null; tipo: string; enviando_at: Date | string | null }>(
    `select id::text as id, contenido, tipo, enviando_at from mensajes
      where conversacion_id = $1::uuid and direccion = 'saliente' and wa_message_id is null and no_enviado_motivo is null
        and contenido not like $2
      order by enviado_at`,
    [t.conversacion_id, `${MARCA_MOSTRADOR}%`],
  );
  const enDuda = pendientes.filter((m) => m.enviando_at);
  if (enDuda.length) {
    await db.consulta(
      `update mensajes set no_enviado_motivo = 'error_al_enviar'
        where conversacion_id = $1::uuid and direccion = 'saliente' and wa_message_id is null
          and no_enviado_motivo is null and contenido not like $2`,
      [t.conversacion_id, `${MARCA_MOSTRADOR}%`],
    );
    await db.consulta("select cola_derivar_por_fallo($1::uuid, $2)", [
      t.conversacion_id,
      "un mensaje quedó en duda (se estaba mandando cuando se cortó): no se reintenta",
    ]);
    return { retomado: true, en_duda: enDuda.length, derivada: true };
  }
  const textos = pendientes.filter((m) => m.tipo === "texto" && m.contenido).map((m) => m.contenido as string);
  if (!textos.length) return { retomado: true, nada_pendiente: true };
  if (!puedeTextoLibre(await ultimoMensajeDelCliente(db, t.conversacion_id), d.ahora())) {
    await borrarSinEnviar(db, t.conversacion_id, textos);
    await evento(db, t.conversacion_id, "error", {
      etapa: "envio",
      error: "fuera de la ventana de 24 hs: solo se puede mandar una plantilla",
      sin_enviar: textos,
    });
    return { retomado: true, enviadas: 0 };
  }
  const simulado = esTelefonoFicticio(telefono);
  const enviadas = simulado ? 0 : await mandarBurbujas(db, d, t.conversacion_id, telefono, textos);
  return { retomado: true, enviadas, ...(simulado ? { simulado: true } : {}) };
}

async function entregar(db: Db, d: Dependencias, conversacionId: string, telefono: string, r: ResultadoTurno) {
  // Lo que sale lo prepara el envío (2.2, decisión #17): sin «¡» ni «¿» y en 1, 2 o 3 mensajes
  // según el largo. Si el turno ya lo preparó, esto no cambia nada.
  const burbujas = prepararParaEnviar(r.mensajesAlCliente);
  const yaPreparadas = burbujas.length === r.mensajesAlCliente.length && burbujas.every((b, i) => b === r.mensajesAlCliente[i]);
  if (!yaPreparadas) await reemplazarBurbujas(db, conversacionId, r.mensajesAlCliente, burbujas);
  const resumen = {
    burbujas: burbujas.length,
    fotos: r.imagenes.length,
    derivo: r.derivo,
    motivo: r.motivoDerivacion ?? null,
    ...(r.bloqueadoPorVentana ? { bloqueado_por_ventana: true } : {}),
  };
  if (!burbujas.length && !r.imagenes.length) return resumen;

  if (!puedeTextoLibre(await ultimoMensajeDelCliente(db, conversacionId), d.ahora())) {
    await borrarSinEnviar(db, conversacionId, burbujas);
    await evento(db, conversacionId, "error", {
      etapa: "envio",
      error: "fuera de la ventana de 24 hs: solo se puede mandar una plantilla",
      sin_enviar: burbujas,
    });
    return { ...resumen, enviadas: 0 };
  }

  const simulado = esTelefonoFicticio(telefono);
  if (!simulado) await mandarBurbujas(db, d, conversacionId, telefono, burbujas);

  let fotosEnviadas = 0;
  for (const foto of r.imagenes) {
    const link = urlDeFoto(d.baseFotos, foto);
    try {
      const waMessageId = simulado ? null : await conReintento(d, () => enviarImagen(d.wa, telefono, link, d.fetcher));
      // Detrás de la última burbuja: el turno fecha las suyas con el reloj de la función y la
      // base tiene el suyo; así la charla queda en el orden en que salió.
      await db.consulta(
        `insert into mensajes (conversacion_id, wa_message_id, direccion, tipo, contenido, enviado_at)
         select $1::uuid, $2, 'saliente', 'imagen', $3,
                greatest(clock_timestamp(), max(enviado_at) + interval '10 milliseconds')
           from mensajes where conversacion_id = $1::uuid`,
        [conversacionId, waMessageId, link],
      );
      fotosEnviadas++;
    } catch (e) {
      await evento(db, conversacionId, "error", { etapa: "envio-foto", foto: link, error: mensajeDeError(e) });
    }
  }
  return { ...resumen, enviadas: burbujas.length, fotos_enviadas: fotosEnviadas, ...(simulado ? { simulado: true } : {}) };
}

// Mientras el último mensaje de la charla tenga menos de 4 s, espera: los que lleguen en ese rato
// entran en la misma ráfaga. creado_at del trabajo es cuándo entró el mensaje a la base.
async function esperarQuietud(db: Db, d: Dependencias, conversacionId: string) {
  const inicio = d.ahora().getTime();
  for (;;) {
    const [f] = await db.consulta<{ at: Date | string | null }>(
      "select max(creado_at) as at from cola_trabajos where conversacion_id = $1::uuid",
      [conversacionId],
    );
    if (!f?.at) return;
    const espera = esperaDeRafagaMs(new Date(f.at), d.ahora());
    const queda = ESPERA_MAXIMA_RAFAGA_MS - (d.ahora().getTime() - inicio);
    if (espera === 0 || queda <= 0) return;
    await d.dormir(Math.min(espera, queda));
  }
}

async function confirmarPorBoton(db: Db, d: Dependencias, t: Trabajo, turnoId: string, telefono: string) {
  const [f] = await db.consulta<{ r: string }>("select turno_confirmar_por_boton($1::uuid, $2::uuid) as r", [
    turnoId,
    t.conversacion_id,
  ]);
  const resultado = f?.r;
  await evento(db, t.conversacion_id, "ok", { etapa: "boton-confirmo", turno_id: turnoId, resultado });
  if (resultado === "no_corresponde") return;
  if (!d.enviosEncendidos && !contestaLucia(d.telefonosLucia, telefono)) return;
  const texto = await textoFijo(db, "texto_turno_confirmado");
  if (texto) await responder(db, d, t.conversacion_id, telefono, texto, "boton-confirmo");
}

// Un mensaje del equipo (Responder desde el panel, 0028): sale tal cual lo escribieron, sin la
// marca, aunque la charla ya no esté tomada. No pasa por Lucía ni por LUCIA_TELEFONOS: lo escribe
// una persona. Si Meta falla también en el reintento, el trabajo vuelve a la cola (hasta 3 veces,
// y queda en la bitácora); lo único que hace es mandar, y si ya salió no lo repite.
async function enviarDelMostrador(db: Db, d: Dependencias, t: Trabajo, telefono: string) {
  const mensajeId = String(t.payload?.mensaje_id ?? "");
  const [m] = await db.consulta<{ contenido: string | null; wa_message_id: string | null }>(
    "select contenido, wa_message_id from mensajes where id = $1::uuid and conversacion_id = $2::uuid and direccion = 'saliente'",
    [mensajeId, t.conversacion_id],
  );
  if (!m?.contenido) {
    await evento(db, t.conversacion_id, "error", { etapa: "mostrador", mensaje_id: mensajeId, error: "el mensaje no está en la charla" });
    return;
  }
  if (m.wa_message_id) return;
  if (!puedeTextoLibre(await ultimoMensajeDelCliente(db, t.conversacion_id), d.ahora())) {
    // Lo escribió una persona: no se borra como las burbujas de Lucía, se marca (0042). Si no,
    // queda en la charla igual que uno que sí salió y quien lo escribió cree que llegó.
    await db.consulta("update mensajes set no_enviado_motivo = 'ventana_cerrada' where id = $1::uuid", [mensajeId]);
    await evento(db, t.conversacion_id, "error", {
      etapa: "mostrador",
      mensaje_id: mensajeId,
      error: "fuera de la ventana de 24 hs: solo se puede mandar una plantilla",
      no_enviado_motivo: "ventana_cerrada",
    });
    return;
  }
  const texto = m.contenido.startsWith(MARCA_MOSTRADOR) ? m.contenido.slice(MARCA_MOSTRADOR.length) : m.contenido;
  const simulado = esTelefonoFicticio(telefono);
  const waMessageId = simulado ? null : await conReintento(d, () => enviarTexto(d.wa, telefono, texto, d.fetcher));
  if (waMessageId) await db.consulta("update mensajes set wa_message_id = $2 where id = $1::uuid", [mensajeId, waMessageId]);
  await evento(db, t.conversacion_id, "ok", {
    etapa: "mostrador",
    mensaje_id: mensajeId,
    autor: t.payload?.autor ?? null,
    wa_message_id: waMessageId,
    ...(simulado ? { simulado: true } : {}),
  });
}

// Una foto del equipo desde el panel (0048). La foto vive en el bucket `adjuntos`, que es
// privado: se baja con la clave de servicio, se sube a /media de WhatsApp y se manda por
// media_id, así no hay que publicar la foto de un cliente en ninguna URL. El epígrafe, si lo
// hay, sale detrás como un mensaje de texto aparte (una fila de `mensajes` por cada mensaje de
// WhatsApp, y Lucía lo lee en el historial).
// Si algo falla, el trabajo vuelve a la cola: lo que ya salió tiene wa_message_id y no se repite.
async function enviarFotoDelMostrador(db: Db, d: Dependencias, t: Trabajo, telefono: string) {
  const mensajeId = String(t.payload?.mensaje_id ?? "");
  const epigrafeId = t.payload?.epigrafe_mensaje_id ? String(t.payload.epigrafe_mensaje_id) : null;
  const ruta = String(t.payload?.storage_path ?? "");
  const mime = String(t.payload?.mime ?? "image/jpeg");

  const [foto] = await db.consulta<{ wa_message_id: string | null }>(
    "select wa_message_id from mensajes where id = $1::uuid and conversacion_id = $2::uuid and direccion = 'saliente'",
    [mensajeId, t.conversacion_id],
  );
  if (!foto) {
    await evento(db, t.conversacion_id, "error", { etapa: "mostrador-foto", mensaje_id: mensajeId, error: "la foto no está en la charla" });
    return;
  }
  const [epigrafe] = epigrafeId
    ? await db.consulta<{ contenido: string | null; wa_message_id: string | null }>(
      "select contenido, wa_message_id from mensajes where id = $1::uuid and conversacion_id = $2::uuid",
      [epigrafeId, t.conversacion_id],
    )
    : [];
  // Ya salió todo en un intento anterior.
  if (foto.wa_message_id && (!epigrafeId || epigrafe?.wa_message_id)) return;

  if (!puedeTextoLibre(await ultimoMensajeDelCliente(db, t.conversacion_id), d.ahora())) {
    // Lo mandó una persona: se marca, no se borra (0042), igual que el texto del mostrador.
    await db.consulta(
      "update mensajes set no_enviado_motivo = 'ventana_cerrada' where id = any($1::uuid[]) and wa_message_id is null",
      [[mensajeId, ...(epigrafeId ? [epigrafeId] : [])]],
    );
    await evento(db, t.conversacion_id, "error", {
      etapa: "mostrador-foto",
      mensaje_id: mensajeId,
      error: "fuera de la ventana de 24 hs: solo se puede mandar una plantilla",
      no_enviado_motivo: "ventana_cerrada",
    });
    return;
  }

  const simulado = esTelefonoFicticio(telefono);
  let waFoto = foto.wa_message_id;
  if (!waFoto && !simulado) {
    const archivo = await conReintento(d, () => bajarAdjunto(d.adjuntos, ruta, mime, d.fetcher));
    const mediaId = await conReintento(d, () => subirMedia(d.wa, archivo, nombreDeArchivo(ruta), d.fetcher));
    waFoto = await conReintento(d, () => enviarImagenPorId(d.wa, telefono, mediaId, d.fetcher));
    await db.consulta("update mensajes set wa_message_id = $2 where id = $1::uuid", [mensajeId, waFoto]);
  }

  let waEpigrafe = epigrafe?.wa_message_id ?? null;
  if (epigrafe?.contenido && !waEpigrafe && !simulado) {
    const texto = epigrafe.contenido.startsWith(MARCA_MOSTRADOR) ? epigrafe.contenido.slice(MARCA_MOSTRADOR.length) : epigrafe.contenido;
    waEpigrafe = await conReintento(d, () => enviarTexto(d.wa, telefono, texto, d.fetcher));
    await db.consulta("update mensajes set wa_message_id = $2 where id = $1::uuid", [epigrafeId, waEpigrafe]);
  }

  await evento(db, t.conversacion_id, "ok", {
    etapa: "mostrador-foto",
    mensaje_id: mensajeId,
    foto: ruta,
    autor: t.payload?.autor ?? null,
    wa_message_id: waFoto,
    ...(epigrafeId ? { epigrafe_wa_message_id: waEpigrafe } : {}),
    ...(simulado ? { simulado: true } : {}),
  });
}

async function estadoDeLaCharla(db: Db, conversacionId: string) {
  const [f] = await db.consulta<{ estado: string; cliente_id: string; telefono: string }>(
    `select c.estado, c.cliente_id::text as cliente_id, cl.telefono
       from conversaciones c join clientes cl on cl.id = c.cliente_id
      where c.id = $1::uuid`,
    [conversacionId],
  );
  return f ?? null;
}

export async function procesarTrabajo(db: Db, t: Trabajo, d: Dependencias): Promise<void> {
  const conv = await estadoDeLaCharla(db, t.conversacion_id);
  if (!conv) throw new Error(`conversación ${t.conversacion_id}: no existe`);

  if (t.payload?.tipo === "mostrador") return await enviarDelMostrador(db, d, t, conv.telefono);
  if (t.payload?.tipo === "mostrador_foto") return await enviarFotoDelMostrador(db, d, t, conv.telefono);

  // El botón "Confirmo" lo resuelve el código, con la charla activa o derivada (1.14).
  const boton = botonDeTurno(t.payload?.mensaje);
  if (boton?.accion === "confirmar") return await confirmarPorBoton(db, d, t, boton.turnoId, conv.telefono);

  // Ya pensó y se está reintentando (0044): se retoma el envío, no se vuelve a correr el turno.
  // Va antes del chequeo de estado a propósito: una respuesta ya pensada se termina de mandar
  // aunque alguien haya tomado la charla en el medio (decisión de Mateo, 16/9: lo que está en
  // vuelo no se corta).
  const [yaPenso] = await db.consulta<{ respondido_at: Date | string | null }>(
    "select respondido_at from cola_trabajos where id = $1::uuid",
    [t.id],
  );
  if (yaPenso?.respondido_at) {
    const retomado = await retomarEnvio(db, d, t, conv.telefono);
    await evento(db, t.conversacion_id, "ok", { etapa: "worker-retoma", ...retomado });
    return;
  }

  // La derivaron entre que se encoló y ahora: la tiene una persona, Lucía no contesta.
  if (conv.estado !== "activa") {
    await evento(db, t.conversacion_id, "ok", { etapa: "worker", nota: `conversación ${conv.estado}: Lucía no contesta` });
    return;
  }
  // "Necesito reprogramar" (1.14) queda anotado. Es un 'button', no 'texto': todavía no entra en
  // la ráfaga de Lucía.
  if (boton?.accion === "reprogramar") {
    await evento(db, t.conversacion_id, "ok", { etapa: "boton-reprogramar", turno_id: boton.turnoId });
  }
  if (!contestaLucia(d.telefonosLucia, conv.telefono)) {
    await evento(db, t.conversacion_id, "ok", { etapa: "worker", nota: "número fuera de LUCIA_TELEFONOS: sin respuesta" });
    return;
  }

  await esperarQuietud(db, d, t.conversacion_id);
  // Mientras esperaba, alguien pudo tomar la charla desde el panel.
  const despues = await estadoDeLaCharla(db, t.conversacion_id);
  if (despues?.estado !== "activa") {
    await evento(db, t.conversacion_id, "ok", { etapa: "worker", nota: `conversación ${despues?.estado}: Lucía no contesta` });
    return;
  }

  const ahora = d.ahora();
  const resultado = await d.turno(db, {
    clienteId: conv.cliente_id,
    telefono: conv.telefono,
    conversacionId: t.conversacion_id,
    ahora,
    tz: d.tz,
    calendario: d.calendario,
    derivacionTel: d.derivacionTel,
  });
  // El turno ya guardó sus mensajes (paso 9). Se marca ANTES de mandarlos: si se corta en el
  // medio del envío, el reintento retoma mandando en vez de pensar de nuevo (0044).
  await db.consulta("update cola_trabajos set respondido_at = now() where id = $1::uuid", [t.id]);

  const entrega = await entregar(db, d, t.conversacion_id, conv.telefono, resultado);

  // Los trabajos de los mensajes que entraron en esta ráfaga ya tienen respuesta. Si esto falla,
  // esos trabajos corren y el turno no encuentra nada nuevo que contestar: no hay doble respuesta.
  let absorbidos = 0;
  try {
    const [f] = await db.consulta<{ n: number }>("select cola_absorber($1::uuid, $2::timestamptz) as n", [t.id, ahora.toISOString()]);
    absorbidos = Number(f?.n ?? 0);
  } catch (e) {
    console.error("worker: cola_absorber falló", mensajeDeError(e));
  }
  await evento(db, t.conversacion_id, "ok", { etapa: "worker-lucia", ...entrega, absorbidos });
}

export async function atenderCola(db: Db, d: Dependencias, worker: string): Promise<number> {
  const inicio = d.ahora().getTime();
  let procesados = 0;
  while (procesados < MAX_POR_LLAMADA && d.ahora().getTime() - inicio < PRESUPUESTO_LLAMADA_MS) {
    // setof: la cola vacía (o solo con charlas que ya tienen un turno en curso) da cero filas.
    const [t] = await db.consulta<Trabajo>(
      "select id::text as id, conversacion_id::text as conversacion_id, payload from cola_tomar_uno($1)",
      [worker],
    );
    if (!t) break;
    try {
      await procesarTrabajo(db, t, d);
      await db.consulta("select cola_terminar($1::uuid, true)", [t.id]);
    } catch (err) {
      console.error("worker: falló el trabajo", t.id, err);
      await db.consulta("select cola_terminar($1::uuid, false, $2)", [t.id, mensajeDeError(err)]);
      await evento(db, t.conversacion_id, "error", { etapa: "worker", error: mensajeDeError(err) });
    }
    procesados++;
  }
  return procesados;
}
