// Revisión de las últimas 20 charlas (Mateo, 6/10): lo que se arregló en código, probado de punta a
// punta con correrTurno contra la base real (en rollback) y un `fetcher` que hace de OpenAI, así
// lo que "dice" el modelo es fijo y la prueba mira solo lo que hace el código con eso.
//  · Lo que Lucía ya dijo en la charla (una hora, un precio) no la frena en el turno siguiente.
//  · Un sticker no se contesta con "no puedo leer esto".
//  · Un mensaje que llega mientras Lucía contesta el anterior se contesta en el turno siguiente.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { calendarioDeEnsayo } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { correrTurno as correrTurnoReal } from "../../supabase/functions/_shared/turno/turno.ts";
import { comoChat } from "./_openai_simulado.ts";
// El principal habla Responses desde el 9/10; los fetchers de acá, Chat Completions: comoChat traduce.
const correrTurno: typeof correrTurnoReal = (db, p) => correrTurnoReal(db, { ...p, fetcher: p.fetcher ? comoChat(p.fetcher) : p.fetcher });
import { AHORA, contar, prueba, TZ } from "./_arnes.ts";

function respuestaChat(contenido: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: contenido } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } },
      }),
  } as unknown as Response;
}

// Clasificador y extractor neutros; el principal contesta lo que devuelva `principal` a partir del
// último mensaje del cliente que le llegó.
function fetcherCon(principal: (ultimoDelCliente: string) => string): typeof fetch {
  return ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.response_format?.json_schema?.name === "clasificacion") {
      return Promise.resolve(respuestaChat(JSON.stringify({ intencion: "alquiler", urgencia: "baja", derivar_duro: false, motivo_derivacion: null })));
    }
    if (body.response_format?.json_schema?.name === "ficha") {
      return Promise.resolve(respuestaChat(JSON.stringify({ nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null })));
    }
    const ultimo = [...(body.messages ?? [])].reverse().find((m: { role: string }) => m.role === "user");
    const texto = typeof ultimo?.content === "string" ? ultimo.content : "";
    return Promise.resolve(respuestaChat(principal(texto)));
  }) as unknown as typeof fetch;
}

const nuncaLlamar = (() => {
  throw new Error("no tendría que llamar a ningún modelo");
}) as unknown as typeof fetch;

type Sql = import("npm:pg@8.13.1").Client;
const mensaje = (sql: Sql, conversacionId: string, direccion: "entrante" | "saliente", contenido: string | null, en: Date, tipo = "texto") =>
  sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, $2, $3, $4, $5::timestamptz)",
    [conversacionId, direccion, tipo, contenido, en.toISOString()],
  );
const antes = (segundos: number) => new Date(AHORA.getTime() - segundos * 1000);
const saltosDeBarandilla = (sql: Sql, conversacionId: string) =>
  contar(sql, "select count(*)::int as n from eventos_agente where conversacion_id = $1 and tipo = 'error' and detalle->>'etapa' = 'barandilla'", [conversacionId]);

const RESPUESTA_CON_LA_HORA = "Sí, podés venir el viernes a las 15:30 solo a probarte: se abona recién si decidís alquilar.";

prueba("una hora que Lucía ya ofreció en la charla no la frena en el turno siguiente (6/10)", async ({ ctx, sql, conversacionId }) => {
  await mensaje(sql, conversacionId, "entrante", "Hola, quiero un turno para mañana tipo 15:30", antes(120));
  await mensaje(sql, conversacionId, "saliente", "Mañana ya está completo. Te puedo ofrecer el viernes 7 a las 15:30 o el sábado 8 a las 11:45. Cuál preferís?", antes(60));
  await mensaje(sql, conversacionId, "entrante", "Es solo para probar, porque todavía no tengo la plata", AHORA);
  const r = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherCon(() => RESPUESTA_CON_LA_HORA),
  });
  assertEquals(r.derivo, false, "no se deriva por repetir una hora que ella misma ofreció");
  assertMatch(r.mensajesAlCliente.join(" "), /15:30/);
  assertEquals(await saltosDeBarandilla(sql, conversacionId), 0);
});

prueba("caso parecido: una hora que nadie ofreció sigue frenando (la barandilla no se ablandó)", async ({ ctx, sql, conversacionId }) => {
  await mensaje(sql, conversacionId, "entrante", "Es solo para probar, porque todavía no tengo la plata", AHORA);
  const r = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherCon(() => RESPUESTA_CON_LA_HORA),
  });
  assert(r.derivo, "con la hora inventada dos veces, termina en barandilla_doble");
  assertEquals(r.motivoDerivacion, "barandilla_doble");
  // Y queda en la bitácora lo que quiso decir (el borrador), para poder revisarlo.
  const conBorrador = await contar(
    sql,
    "select count(*)::int as n from eventos_agente where conversacion_id = $1 and tipo = 'error' and detalle->>'borrador' like '%15:30%'",
    [conversacionId],
  );
  assert(conBorrador > 0, "el evento de la barandilla guarda el borrador");
});

prueba("un precio que Lucía ya dio en la charla no la frena al repetirlo", async ({ ctx, sql, conversacionId }) => {
  await mensaje(sql, conversacionId, "entrante", "Cuánto sale alquilar un traje?", antes(120));
  await mensaje(sql, conversacionId, "saliente", "El alquiler es a partir de $150.000 e incluye el ambo, los ajustes y la tintorería.", antes(60));
  await mensaje(sql, conversacionId, "entrante", "Y la tintorería está incluida en eso?", AHORA);
  const r = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherCon(() => "Sí, la tintorería está incluida en los $150.000."),
  });
  assertEquals(r.derivo, false);
  assertMatch(r.mensajesAlCliente.join(" "), /150\.000/);
  assertEquals(await saltosDeBarandilla(sql, conversacionId), 0);
});

prueba("un sticker no se contesta (6/10: «no puedo leer esto» quedaba frío)", async ({ ctx, sql, conversacionId }) => {
  await mensaje(sql, conversacionId, "entrante", "Muchas gracias!", antes(60));
  await mensaje(sql, conversacionId, "saliente", "Gracias a vos!", antes(30));
  await mensaje(sql, conversacionId, "entrante", null, AHORA, "sticker");
  const r = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: nuncaLlamar,
  });
  assertEquals(r.mensajesAlCliente, []);
  assertEquals(r.derivo, false);
});

prueba("caso parecido: un video (que tampoco se lee) sigue recibiendo el texto fijo", async ({ ctx, sql, conversacionId }) => {
  await mensaje(sql, conversacionId, "entrante", null, AHORA, "video");
  const r = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: nuncaLlamar,
  });
  assertEquals(r.mensajesAlCliente.length, 1);
  assertMatch(r.mensajesAlCliente[0], /leer/);
});

prueba("un mensaje que llega mientras Lucía contesta el anterior se contesta en el turno siguiente (5/10)", async ({ ctx, sql, conversacionId }) => {
  await mensaje(sql, conversacionId, "entrante", "Hola", antes(5));
  // Llega a los 30 s: después del corte del primer turno (ahora = AHORA), mientras Lucía pensaba.
  const segundoMensajeEn = new Date(AHORA.getTime() + 30_000);
  await mensaje(sql, conversacionId, "entrante", "Necesito un turno para alquilar un traje", segundoMensajeEn);
  const eco = fetcherCon((ultimo) => `Me escribiste: ${ultimo}`);

  const primero = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: eco,
  });
  assertEquals(primero.mensajesAlCliente, ["Me escribiste: Hola"]);

  // La respuesta quedó guardada ANTES del mensaje que llegó durante el turno.
  const guardada = (await sql.query(
    "select enviado_at from mensajes where conversacion_id = $1 and direccion = 'saliente' order by enviado_at desc limit 1",
    [conversacionId],
  )).rows[0];
  assert(new Date(guardada.enviado_at) < segundoMensajeEn, "la respuesta se fecha con el corte de la ráfaga, no con el reloj de cuando terminó");

  const segundo = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: new Date(AHORA.getTime() + 40_000), tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: eco,
  });
  assertEquals(segundo.mensajesAlCliente, ["Me escribiste: Necesito un turno para alquilar un traje"]);
});
