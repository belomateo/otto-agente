// Prueba dirigida del hallazgo C1 del tester (informe 15/9, docs/informes/1-tester-agente.md):
// el texto libre de derivar_a_persona (mensaje_al_cliente, lo escribe el modelo) salía al
// cliente sin pasar por ninguna barandilla — en vivo dejó salir «el sistema no me permite…».
//
// No se puede provocar esa frase exacta pidiéndosela al modelo real de forma confiable (es
// lenguaje espontáneo, no un dato que se pueda fijar). Por eso esta prueba corre correrTurno()
// de punta a punta contra la BASE REAL, pero con un `fetcher` simulado que hace de OpenAI: así
// se fuerza, de forma determinística, que el modelo "diga" exactamente la frase peligrosa al
// derivar, y se confirma en la base qué llegó de verdad al cliente.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { Db, Fila } from "../../supabase/functions/_shared/db.ts";
import { calendarioDeEnsayo } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { horaLocal } from "../../supabase/functions/_shared/tiempo.ts";
import { correrTurno } from "../../supabase/functions/_shared/turno/turno.ts";
import { sinSignosDeApertura } from "../../supabase/functions/_shared/whatsapp/preparar.ts";
import { AHORA, conBase, contar, crearTurno, fila, prueba, TZ } from "./_arnes.ts";

// Arma una respuesta de Chat Completions mínima, con o sin tool_call.
function respuestaChat(p: { contenido?: string | null; toolCall?: { nombre: string; argumentos: unknown } }) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [{
          message: {
            content: p.contenido ?? null,
            tool_calls: p.toolCall
              ? [{ id: "call_1", type: "function", function: { name: p.toolCall.nombre, arguments: JSON.stringify(p.toolCall.argumentos) } }]
              : undefined,
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } },
      }),
  } as unknown as Response;
}

// Un fetcher que hace de las tres llamadas a OpenAI, distinguiendo por la FORMA del pedido
// (el clasificador y el extractor piden response_format con un json_schema propio; el
// principal manda `tools`): no hace falta un servidor real ni la clave de la API.
function fetcherSimulado(mensajeDeLaDerivacion: string): typeof fetch {
  return ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const esClasificador = body.response_format?.json_schema?.name === "clasificacion";
    const esExtractor = body.response_format?.json_schema?.name === "ficha";
    if (esClasificador) {
      return Promise.resolve(respuestaChat({ contenido: JSON.stringify({ intencion: "otro", urgencia: "baja", derivar_duro: false, motivo_derivacion: null }) }));
    }
    if (esExtractor) {
      return Promise.resolve(respuestaChat({ contenido: JSON.stringify({ nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null }) }));
    }
    // El principal: SIEMPRE llama a derivar_a_persona con la frase peligrosa, como pasó en vivo.
    return Promise.resolve(respuestaChat({
      toolCall: { nombre: "derivar_a_persona", argumentos: { motivo: "pide_persona", mensaje_al_cliente: mensajeDeLaDerivacion } },
    }));
  }) as unknown as typeof fetch;
}

// correrTurno ya no recibe el mensaje por parámetro: lo busca en la base (agrupar_rafaga,
// rafaga.ts), tal como lo deja el emulador o el worker real antes de correr el turno. OJO:
// enviado_at tiene que quedar cerca de AHORA (2030, la fecha fija de las pruebas), no en el
// now() real de la base (2026): si no, fuera_ventana_meta ve más de 24 hs de diferencia entre
// "ahora" y el último mensaje del cliente, bloquea todo en silencio, y cualquier prueba de acá
// falla sin que tenga nada que ver con lo que se está probando (pasó de verdad armando esta
// prueba).
async function insertarEntrante(sql: import("npm:pg@8.13.1").Client, conversacionId: string, texto: string) {
  await sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', $2, $3::timestamptz)",
    [conversacionId, texto, AHORA.toISOString()],
  );
}

async function insertarEntranteNoTexto(sql: import("npm:pg@8.13.1").Client, conversacionId: string, tipo: string) {
  await sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', $2, null, $3::timestamptz)",
    [conversacionId, tipo, AHORA.toISOString()],
  );
}

prueba("C1 resuelto: una despedida de derivar_a_persona que menciona \"el sistema\" no llega tal cual al cliente", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "hola, quiero un turno pero no me deja");
  const fetcher = fetcherSimulado("Che, el sistema no me permite hacer eso ahora. Le paso tu consulta al equipo.");
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assert(resultado.derivo, "el turno tiene que terminar derivando (derivar_a_persona cortó el turno)");
  for (const m of resultado.mensajesAlCliente) {
    assert(!/\bel sistema\b/i.test(m), `la frase peligrosa llegó igual al cliente: "${m}"`);
  }
  assert(resultado.mensajesAlCliente.length > 0, "no se queda sin mandar nada: cae al texto fijo genérico");

  // Quedó registrado que la barandilla saltó, para que se pueda auditar.
  const saltoRegistrado = await contar(
    sql,
    "select count(*)::int as n from eventos_agente where conversacion_id = $1 and tipo = 'error' and detalle->>'barandilla' = 'menciona_ia'",
    [conversacionId],
  );
  assert(saltoRegistrado > 0, "quedó un evento de bitácora de que menciona_ia saltó en la derivación");
});

prueba("C1, caso parecido: una despedida limpia de derivar_a_persona sale tal cual (no se descarta de más)", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "quiero hablar con una persona");
  const fetcher = fetcherSimulado("Le paso tu consulta a alguien del equipo y te escriben en un rato.");
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });
  assert(resultado.derivo);
  assertEquals(resultado.mensajesAlCliente, ["Le paso tu consulta a alguien del equipo y te escriben en un rato."]);
});

Deno.test({
  name: "C2 resuelto: los motivos de solo-código ni siquiera pasan el schema de derivar_a_persona",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const { ejecutarHerramienta } = await import("../../supabase/functions/_shared/herramientas/index.ts");
      const { contextoDeHerramientas } = await import("../../supabase/functions/_shared/turno/contexto_herramientas.ts");
      await sql.query("begin");
      try {
        const cli = (await sql.query("insert into clientes (telefono) values ($1) returning id::text as id", ["+5493999990001"])).rows[0];
        const conv = (await sql.query("insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id", [cli.id])).rows[0];
        const { dbDesde } = await import("../../supabase/functions/_shared/db.ts");
        const ctx = contextoDeHerramientas({
          db: dbDesde(sql as never), tz: TZ, cliente: { id: cli.id, telefono: "+5493999990001" },
          conversacionId: conv.id, ahora: AHORA, calendario: calendarioDeEnsayo,
        });
        // Camino normal (como lo llama el turno real): la capa de schema de ejecutarHerramienta
        // ya rechaza el motivo antes de que derivarAPersona.ejecutar vea nada — es la primera
        // guarda, y la más fuerte (el modelo, con salida estricta, ni siquiera puede construir
        // esta llamada).
        for (const motivo of ["evento_inminente", "barandilla_doble", "sin_respuesta", "timeout"]) {
          const r = await ejecutarHerramienta("derivar_a_persona", { motivo, mensaje_al_cliente: null }, ctx);
          assert(!r.ok, `motivo ${motivo} tendría que rechazarse`);
          assertEquals((r as { rechazo: string }).rechazo, "argumentos_invalidos", `motivo ${motivo}: lo tiene que atajar el schema`);
        }
        const ok = await ejecutarHerramienta("derivar_a_persona", { motivo: "pide_persona", mensaje_al_cliente: null }, ctx);
        assert(ok.ok, "pide_persona sigue andando (caso parecido: no se rechazó de más)");

        // Segunda guarda, por si algún día algo llama a .ejecutar() directo, sin pasar por el
        // schema de ejecutarHerramienta: derivarAPersona.ejecutar también rechaza por su cuenta.
        const { derivarAPersona } = await import("../../supabase/functions/_shared/herramientas/derivar_a_persona.ts");
        for (const motivo of ["evento_inminente", "barandilla_doble", "sin_respuesta", "timeout"] as const) {
          const r = await derivarAPersona.ejecutar({ motivo, mensaje_al_cliente: null }, ctx);
          assert(!r.ok, `motivo ${motivo} tendría que rechazarse incluso sin pasar por el schema`);
          assertEquals((r as { rechazo: string }).rechazo, "motivo_solo_codigo");
        }
      } finally {
        await sql.query("rollback");
      }
    }),
});

// Hallazgo propio, 15/9: en vivo, corriendo el guion accesorios contra el emulador, la conexión
// de Postgres se cayó justo en el insert de eventos_agente (paso 11, el último paso, solo
// bitácora) — "Client has encountered a connection error and is not queryable" — y ese `throw`
// DENTRO de un `finally` reemplazó el resultado ya bueno del turno (ya calculado, y ya guardado
// en `mensajes` un paso antes): probar-agente devolvió 500 en vez del JSON real. Se corrigió con
// un try/catch alrededor del paso 11 (turno.ts), igual que ya existía para el extractor (paso
// 10). Esta prueba fuerza esa misma caída con un `db` que envuelve al real y solo rompe una vez,
// justo en ese insert, para confirmar que correrTurno devuelve el resultado real y no la excepción.
Deno.test({
  name: "el turno no pierde su resultado si falla SOLO la bitácora al final (hallazgo propio, 15/9)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const { dbDesde } = await import("../../supabase/functions/_shared/db.ts");
      await sql.query("begin");
      try {
        const cli = (await sql.query("insert into clientes (telefono) values ($1) returning id::text as id", ["+5493999990002"])).rows[0];
        const conv = (await sql.query("insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id", [cli.id])).rows[0];
        await insertarEntrante(sql, conv.id, "hola, quiero hablar con una persona");

        const dbReal = dbDesde(sql as never);
        let rompioUnaVez = false;
        const dbQueSeCaeEnBitacora: Db = {
          async consulta<T extends Fila = Fila>(sqlTexto: string, valores?: unknown[]): Promise<T[]> {
            if (!rompioUnaVez && sqlTexto.includes("insert into eventos_agente")) {
              rompioUnaVez = true;
              throw new Error("Client has encountered a connection error and is not queryable");
            }
            return await dbReal.consulta<T>(sqlTexto, valores);
          },
        };

        const fetcher = fetcherSimulado("Le paso tu consulta a alguien del equipo y te escriben en un rato.");
        const resultado = await correrTurno(dbQueSeCaeEnBitacora, {
          clienteId: cli.id, telefono: "+5493999990002", conversacionId: conv.id, ahora: AHORA, tz: TZ,
          calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
        });

        assert(rompioUnaVez, "la prueba tiene que haber forzado el fallo de eventos_agente al menos una vez");
        assert(resultado.derivo, "el turno tiene que devolver el resultado real, no tirar la excepción de la bitácora");
        assertEquals(resultado.mensajesAlCliente, ["Le paso tu consulta a alguien del equipo y te escriben en un rato."]);
      } finally {
        await sql.query("rollback");
      }
    }),
});

// Supuesto #33 (H2.1, 15/9): antes, una foto/audio/sticker sin texto no tenía respuesta. Un
// `fetcher` que tira si se llama prueba, de forma directa, que esto NUNCA llega a ningún LLM
// (ni clasificador, ni principal, ni el extractor del paso 10 — este último se paró acá mismo:
// antes se llamaba igual, con "Cliente: " vacío, un gasto que no podía extraer nada nuevo): el
// texto es fijo, en código, igual que una derivación dura.
const fetcherQueNuncaHayQueLlamar = (() => {
  throw new Error("no tendría que llamar a ningún LLM para un mensaje que no es texto");
}) as unknown as typeof fetch;

prueba("supuesto #33 resuelto: solo una foto (sin texto) contesta con el texto fijo, sin pasar por el modelo", async ({ ctx, sql, conversacionId }) => {
  await insertarEntranteNoTexto(sql, conversacionId, "image");
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherQueNuncaHayQueLlamar,
  });
  assertEquals(resultado.derivo, false);
  // El turno pasa por prepararParaEnviar (decisión #17, hito 2.3) antes de guardar: el «¿» del
  // texto fijo se saca ahí, no en contexto_agente (el dueño lo sigue editando con buena
  // ortografía en el panel).
  assertEquals(resultado.mensajesAlCliente, [
    sinSignosDeApertura("Por ahora todavía no puedo leer fotos, audios ni stickers. ¿Me contás en un mensaje de texto qué necesitás? Así te ayudo enseguida."),
  ]);
});

prueba("supuesto #33, caso parecido: nada nuevo en la ráfaga sigue sin contestar nada (no se confunde con soloNoTexto)", async ({ ctx, conversacionId }) => {
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherQueNuncaHayQueLlamar,
  });
  assertEquals(resultado.mensajesAlCliente, []);
  assertEquals(resultado.derivo, false);
});

// Pedido de Mateo, 16/9: antes solo derivaba garantizado un cliente enojado si además calificaba
// como "reclamo" (una queja puntual). Ahora el clasificador (paso 4b) lo detecta por el TONO,
// sin depender de esa palabra — acá se fuerza esa clasificación de forma determinística (no se
// puede pedir con confianza que el modelo real se ponga agresivo).
// Pedido de Mateo, 19/9: toda derivación le deja algo al cliente. No se discute con alguien
// caliente (cliente_enojado sigue en MOTIVOS_CON_TEXTO_RECLAMO de turno.ts), pero el silencio
// total de antes ahora es el texto fijo texto_derivacion_reclamo.
prueba("cliente_enojado: el clasificador lo detecta por tono, sin decir 'reclamo', y deriva con el texto fijo de reclamo", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "ESTO ES UNA VERGUENZA, son todos unos inutiles, denme la plata YA o hago un escandalo");
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const esClasificador = body.response_format?.json_schema?.name === "clasificacion";
    const esExtractor = body.response_format?.json_schema?.name === "ficha";
    if (esClasificador) {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({ intencion: "reclamo", urgencia: "alta", derivar_duro: true, motivo_derivacion: "cliente_enojado" }),
      }));
    }
    if (esExtractor) {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    throw new Error("el clasificador ya derivó duro: el turno no debería llegar al principal");
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "cliente_enojado");
  assertEquals(
    resultado.mensajesAlCliente,
    ["Te leo. Esto lo sigue alguien del local: en un rato te escriben."],
    "no queda muda: el texto fijo de reclamo reemplaza cualquier despedida propia, no discute",
  );
  const der = await fila(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([der?.motivo, der?.estado], ["cliente_enojado", "pendiente"]);
});

// Mismo pedido de Mateo, 19/9, pero por el otro camino: reclamo detectado por PALABRA CLAVE
// (paso 4a, derivacion_dura.ts), antes de gastar un solo token de LLM — no hace falta mockear
// clasificador ni principal, el turno nunca los llama (el `throw` de acá abajo lo confirma).
// El extractor (paso 10) SÍ corre igual, en el finally, para cualquier turno con mensaje de
// texto — no depende de por qué camino terminó el turno — así que se le da una respuesta válida
// como al resto de los tests, para no ensuciar la corrida con un error de bitácora de más.
// Antes derivar() fetcheaba texto_derivacion_dura_generica y lo tiraba igual (reclamo estaba en
// la vieja MOTIVOS_DERIVAN_EN_SILENCIO); ahora ese fetch de más se ignora y en su lugar usa
// texto_derivacion_reclamo — mismo texto que por el clasificador, para que la charla se vea
// igual sin importar quién detectó el motivo.
prueba("reclamo por palabra clave (código, sin LLM) también deriva con el texto fijo de reclamo, no muda", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "quiero hacer un reclamo por el traje que me dieron");
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.response_format?.json_schema?.name === "ficha") {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    throw new Error("la derivación dura por palabra clave no debería llamar al clasificador ni al principal");
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "reclamo");
  assertEquals(resultado.mensajesAlCliente, ["Te leo. Esto lo sigue alguien del local: en un rato te escriben."]);
  const der = await fila(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([der?.motivo, der?.estado], ["reclamo", "pendiente"]);
});

// Mismo hallazgo de logica (19/9, auditando la entrega de arriba), pero por el camino de
// derivar() en turno.ts (no derivar_a_persona.ts): si contexto_agente.texto_derivacion_reclamo
// queda vacío, antes volvía el silencio que se acaba de cerrar. Se vacía la fila DENTRO de esta
// transacción (rollback al final) para probar el respaldo sin pisar el texto real de nadie.
prueba("reclamo por palabra clave con la fila de contexto_agente vacía también cae al respaldo, no muda", async ({ ctx, sql, conversacionId }) => {
  await sql.query("update contexto_agente set valor = '' where clave = 'texto_derivacion_reclamo'");
  await insertarEntrante(sql, conversacionId, "quiero hacer un reclamo por el traje que me dieron");
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.response_format?.json_schema?.name === "ficha") {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    throw new Error("la derivación dura por palabra clave no debería llamar al clasificador ni al principal");
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assertEquals(resultado.derivo, true);
  assertEquals(resultado.mensajesAlCliente, ["Te leo. Esto lo sigue alguien del local: en un rato te escriben."]);
});

// Verificación pedida por logica, 16/9: cuando una barandilla de "rehacer" (acá,
// precio_sin_herramienta) vuelve a saltar después del reintento, ¿el turno manda un texto vacío
// sin avisarle a nadie, o deriva de verdad? Fuerza al principal a decir SIEMPRE un precio sin
// haber llamado a consultar_catalogo, así precio_sin_herramienta salta en el primer intento y
// otra vez en el reintento — el camino de aplicarBarandillas hacia barandilla_doble.
// Pedido de Mateo, 19/9: barandilla_doble es un problema DEL SISTEMA (Lucía no logró escribir
// algo que pasara las barandillas), no del cliente — texto fijo propio (texto_derivacion_fallo,
// con tono de disculpa), reemplaza el [] de antes.
prueba("dos saltos del mismo turno derivan barandilla_doble de verdad: fila en derivaciones, charla pausada y el texto fijo de fallo, no un texto vacío sin más", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "cuanto sale el traje");
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const esClasificador = body.response_format?.json_schema?.name === "clasificacion";
    const esExtractor = body.response_format?.json_schema?.name === "ficha";
    if (esClasificador) {
      return Promise.resolve(respuestaChat({ contenido: JSON.stringify({ intencion: "alquiler", urgencia: "baja", derivar_duro: false, motivo_derivacion: null }) }));
    }
    if (esExtractor) {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    // El principal: siempre un precio sin consultar_catalogo, en el primer intento y en el
    // reintento — nunca corrige lo que la barandilla le pide.
    return Promise.resolve(respuestaChat({ contenido: "Un traje cuesta 230, con todo incluido." }));
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "barandilla_doble");
  assertEquals(resultado.mensajesAlCliente, ["Se me complicó de este lado. Ya avisé a alguien del local y en un rato te escriben."]);
  const der = await fila(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([der?.motivo, der?.estado], ["barandilla_doble", "pendiente"]);
  assertEquals((await fila(sql, "select estado from conversaciones where id = $1", [conversacionId])).estado, "derivada");
});

// Hallazgo de la auditoría, 17/9: traza.ts y horario_sin_herramienta.ts prometen que las horas
// de los turnos activos del cliente (las que ya le pasamos en el contexto, CONTEXTO.md § "SUS
// TURNOS") quedan sembradas en traza.horasDevueltas — pero nadie las sembraba de verdad. El
// cliente preguntando por la hora de SU PROPIO turno, con el modelo repitiéndola tal cual la vio
// en el contexto, hacía saltar horario_sin_herramienta igual que si la hubiera inventado.
prueba(
  "el cliente pregunta la hora de su propio turno: el modelo la repite del contexto y no salta horario_sin_herramienta",
  async ({ ctx, sql, conversacionId, clienteId }) => {
    const inicio = new Date(AHORA.getTime() + 7 * 24 * 60 * 60 * 1000);
    await crearTurno(sql, { clienteId, inicio, tipo: "invitado" });
    const hora = horaLocal(inicio, TZ);
    await insertarEntrante(sql, conversacionId, "¿a qué hora era mi turno?");
    const fetcher = ((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const esClasificador = body.response_format?.json_schema?.name === "clasificacion";
      const esExtractor = body.response_format?.json_schema?.name === "ficha";
      if (esClasificador) {
        return Promise.resolve(respuestaChat({ contenido: JSON.stringify({ intencion: "otro", urgencia: "baja", derivar_duro: false, motivo_derivacion: null }) }));
      }
      if (esExtractor) {
        return Promise.resolve(respuestaChat({
          contenido: JSON.stringify({
            nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
            talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
          }),
        }));
      }
      return Promise.resolve(respuestaChat({ contenido: `Tu turno es a las ${hora}, te esperamos.` }));
    }) as unknown as typeof fetch;

    const resultado = await correrTurno(ctx.db, {
      clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
      calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
    });

    assertEquals(resultado.derivo, false, "no tenía que derivar: la hora ya estaba en el contexto, no la inventó");
    assertEquals(resultado.mensajesAlCliente, [`Tu turno es a las ${hora}, te esperamos.`]);
  },
);
