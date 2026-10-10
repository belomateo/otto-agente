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
import { type ClienteSql, type Db, dbDesde, type Fila } from "../../supabase/functions/_shared/db.ts";
import { calendarioDeEnsayo } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { horaLocal } from "../../supabase/functions/_shared/tiempo.ts";
import { correrTurno as correrTurnoReal, TEXTO_DEMORA_RESPALDO } from "../../supabase/functions/_shared/turno/turno.ts";
import { comoChat } from "./_openai_simulado.ts";
// El principal habla Responses desde el 9/10; los fetchers de acá, Chat Completions: comoChat traduce.
const correrTurno: typeof correrTurnoReal = (db, p) => correrTurnoReal(db, { ...p, fetcher: p.fetcher ? comoChat(p.fetcher) : p.fetcher });
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
    "select count(*)::int as n from eventos_agente where conversacion_id = $1 and tipo = 'error' and detalle->>'chequeo' = 'menciona_ia' and detalle->>'barandilla' = 'forma_y_tono'",
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
  // ortografía en el panel). Y el dueño edita el texto en sí desde el panel (hallazgo de logica,
  // 24/9): se compara contra el valor vigente, no una redacción congelada.
  const { valor: textoNoSoportado } = await fila(sql, "select valor from contexto_agente where clave = 'texto_mensaje_no_soportado'");
  assertEquals(resultado.mensajesAlCliente, [sinSignosDeApertura(textoNoSoportado)]);
});

prueba("supuesto #33, caso parecido: nada nuevo en la ráfaga sigue sin contestar nada (no se confunde con soloNoTexto)", async ({ ctx, conversacionId }) => {
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherQueNuncaHayQueLlamar,
  });
  assertEquals(resultado.mensajesAlCliente, []);
  assertEquals(resultado.derivo, false);
});

// Pedido de Mateo, 9/10: ya no hay clasificador ni filtro por palabra clave que deriven antes que
// Lucía. Un cliente enojado (por el TONO, sin decir "reclamo") o un reclamo llegan al principal, y es
// Lucía la que llama a derivar_a_persona con el motivo. Lo que ve el cliente sigue igual: el texto
// fijo de reclamo (pedido de Mateo, 19/9: no se discute con alguien caliente, pero no queda mudo).
// Se fuerza la decisión del modelo con el fetcher (no se puede pedir con confianza que el modelo
// real se ponga agresivo).
function principalQueDeriva(motivo: string, llamadas: { principal: number }): typeof fetch {
  return ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.response_format?.json_schema?.name === "ficha") {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    if (body.response_format) throw new Error(`no tendría que haber otra llamada con schema (${body.response_format?.json_schema?.name})`);
    llamadas.principal++;
    return Promise.resolve(respuestaChat({ toolCall: { nombre: "derivar_a_persona", argumentos: { motivo, mensaje_al_cliente: "Le paso tu consulta al equipo." } } }));
  }) as unknown as typeof fetch;
}

prueba("cliente_enojado: lo decide Lucía por el tono (sin clasificador) y sale el texto fijo de reclamo", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "ESTO ES UNA VERGUENZA, son todos unos inutiles, denme la plata YA o hago un escandalo");
  const llamadas = { principal: 0 };
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: principalQueDeriva("cliente_enojado", llamadas),
  });
  assertEquals(llamadas.principal, 1, "el mensaje llega a Lucía: nadie deriva antes que ella");
  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "cliente_enojado");
  const { valor: textoReclamo } = await fila(sql, "select valor from contexto_agente where clave = 'texto_derivacion_reclamo'");
  assertEquals(resultado.mensajesAlCliente, [sinSignosDeApertura(textoReclamo)]);
  const der = await fila(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([der?.motivo, der?.estado], ["cliente_enojado", "pendiente"]);
});

prueba("reclamo: sin filtro por palabra clave, «reclamo» llega a Lucía y ella deriva con el texto fijo de reclamo", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "quiero hacer un reclamo por el traje que me dieron");
  const llamadas = { principal: 0 };
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: principalQueDeriva("reclamo", llamadas),
  });
  assertEquals(llamadas.principal, 1);
  assertEquals([resultado.derivo, resultado.motivoDerivacion], [true, "reclamo"]);
  const { valor: textoReclamo } = await fila(sql, "select valor from contexto_agente where clave = 'texto_derivacion_reclamo'");
  assertEquals(resultado.mensajesAlCliente, [sinSignosDeApertura(textoReclamo)]);
});

prueba("reclamo con la fila de contexto_agente vacía: cae al respaldo de código, no muda", async ({ ctx, sql, conversacionId }) => {
  await sql.query("update contexto_agente set valor = '' where clave = 'texto_derivacion_reclamo'");
  await insertarEntrante(sql, conversacionId, "quiero hacer un reclamo por el traje que me dieron");
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: principalQueDeriva("reclamo", { principal: 0 }),
  });
  assertEquals(resultado.derivo, true);
  assertEquals(resultado.mensajesAlCliente, ["Te leo. Esto lo sigue alguien del local: en un rato te escriben."]);
});


// Pedido de Mateo, 9/10: «que Lucía siempre conteste por más que tarde». Si el principal no
// contesta (acá: devuelve vacío), hay un último intento sin herramientas; no se deriva ni se apaga.
function principalMudo(ultimoIntento: string | null): typeof fetch {
  return ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.response_format?.json_schema?.name === "ficha") return Promise.resolve(respuestaChat({ contenido: "{}" }));
    // tool_choice "none" es el último intento; "auto", la vuelta normal (que no contesta nada).
    return Promise.resolve(respuestaChat({ contenido: body.tool_choice === "none" ? ultimoIntento : null }));
  }) as unknown as typeof fetch;
}

prueba("sin respuesta del principal: el último intento contesta, sin derivar ni apagar a Lucía", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "hola, quiero alquilar un traje");
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: principalMudo("Contame para qué fecha es tu evento así te ayudo."),
  });
  assertEquals(resultado.derivo, false);
  assertEquals(resultado.mensajesAlCliente, ["Contame para qué fecha es tu evento así te ayudo."]);
  assertEquals(await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]), 0);
  const conv = await fila(sql, "select estado, lucia_activa from conversaciones where id = $1", [conversacionId]);
  assertEquals([conv.estado, conv.lucia_activa], ["activa", true]);
});

prueba("si ni el último intento contesta: sale el texto de demora, sin derivar ni apagar a Lucía", async ({ ctx, sql, conversacionId }) => {
  await sql.query("delete from contexto_agente where clave = 'texto_demora'");
  await insertarEntrante(sql, conversacionId, "hola, quiero alquilar un traje");
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: principalMudo(null),
  });
  assertEquals(resultado.derivo, false);
  assertEquals(resultado.mensajesAlCliente, [sinSignosDeApertura(TEXTO_DEMORA_RESPALDO)]);
  assertEquals(await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]), 0);
  const conv = await fila(sql, "select estado, lucia_activa from conversaciones where id = $1", [conversacionId]);
  assertEquals([conv.estado, conv.lucia_activa], ["activa", true]);
});

// Hallazgo del trabajo 1 (9/10): si el modelo se quedó sin tiempo, OpenAI puede estar colgado y el
// extractor de la ficha sumaría hasta 41 s, pasando el trabajo del límite de la función (que corta
// antes de mandar). En ese turno la ficha no se toca; el próximo la levanta con la charla completa.
prueba("si el modelo se queda sin tiempo, contesta con el último intento y no llama al extractor de la ficha", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "hola, me caso el 20 de diciembre");
  const pedidos: string[] = [];
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.response_format?.json_schema?.name === "ficha") {
      pedidos.push("ficha");
      return Promise.resolve(respuestaChat({ contenido: "{}" }));
    }
    pedidos.push(String(body.tool_choice));
    return Promise.resolve(respuestaChat({ contenido: "Felicitaciones! Contame qué tipo de traje buscás." }));
  }) as unknown as typeof fetch;
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher, limiteTurnoMs: 0,
  });
  assertEquals(resultado.mensajesAlCliente, ["Felicitaciones! Contame qué tipo de traje buscás."]);
  assertEquals(pedidos, ["none"]); // solo el último intento: ni la vuelta normal ni el extractor
  assertEquals(await contar(sql, "select count(*)::int as n from eventos_agente where conversacion_id = $1 and detalle->>'etapa' = 'extraer' and detalle->>'nota' like 'salteado%'", [conversacionId]), 1);
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
  // Hallazgo de logica, 24/9: el dueño edita texto_derivacion_fallo desde el panel (para eso
  // existe), así que congelar la redacción acá hace que la prueba se ponga en rojo cada vez que
  // la usa — no es un bug. Se compara contra lo que hay en contexto_agente en este momento: lo
  // que importa es que salga el aviso CONFIGURADO, no una redacción particular.
  const { valor: textoFallo } = await fila(sql, "select valor from contexto_agente where clave = 'texto_derivacion_fallo'");
  assertEquals(resultado.mensajesAlCliente, [sinSignosDeApertura(textoFallo)]);
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

// venta_sin_resolver de punta a punta (pedido de logica, 20/9, segunda vuelta: el léxico de
// anuncia_sin_derivar es un juego perdido, el modelo siempre tiene otra frase). El cliente pide
// comprar (desde el 9/10 lo lee la barandilla en su mensaje, sin clasificador) y el principal contesta SIEMPRE con una frase que no
// resuelve nada (ni enviar_link ni derivar_a_persona), en el primer intento y en el reintento —
// el camino de aplicarBarandillas hacia barandilla_doble, igual que el de precio_sin_herramienta
// más arriba. El cliente nunca se queda sin nada: si el modelo no resuelve, deriva de verdad.
prueba("una consulta de venta que el modelo no resuelve (ni link ni derivación) termina en barandilla_doble, no muda", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "hola, quiero comprar un traje");
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const esClasificador = body.response_format?.json_schema?.name === "clasificacion";
    const esExtractor = body.response_format?.json_schema?.name === "ficha";
    if (esClasificador) {
      return Promise.resolve(respuestaChat({ contenido: JSON.stringify({ intencion: "venta", urgencia: "baja", derivar_duro: false, motivo_derivacion: null }) }));
    }
    if (esExtractor) {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    // El principal: nunca llama a enviar_link ni a derivar_a_persona, ni en el primer intento ni
    // en el reintento — una despedida vaga que no resuelve nada.
    return Promise.resolve(respuestaChat({ contenido: "Eso te lo confirma el equipo del local." }));
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "barandilla_doble");
  // Hallazgo de logica, 24/9: mismo criterio que el test de más arriba — el dueño edita
  // texto_derivacion_fallo desde el panel, así que se compara contra el valor vigente en vez de
  // congelar una redacción.
  const { valor: textoFallo } = await fila(sql, "select valor from contexto_agente where clave = 'texto_derivacion_fallo'");
  assertEquals(resultado.mensajesAlCliente, [sinSignosDeApertura(textoFallo)]);
  const der = await fila(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([der?.motivo, der?.estado], ["barandilla_doble", "pendiente"]);
});

// Bug real de punta a punta (probadores en vivo, 20/9, logica): un cliente cuyo nombre de
// WhatsApp trae un número chico ("Martin 23") no podía arrancar NINGUNA charla — el primer
// saludo de Lucía ("Hola, Martin 23!") disparaba precio_sin_herramienta, y como el modelo no
// puede saludar sin repetir el nombre, el rehacer volvía a saltar: barandilla_doble garantizado
// en el primer mensaje. Fuerza al principal a saludar por el nombre (como haría de verdad) y
// confirma que ya no deriva.
prueba("un cliente con un número en el nombre de WhatsApp puede arrancar la charla (bug real, probadores en vivo, 20/9)", async ({ ctx, sql, conversacionId, clienteId }) => {
  await sql.query("update clientes set nombre = $1 where id = $2", ["Martin 23", clienteId]);
  await insertarEntrante(sql, conversacionId, "hola");
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
    return Promise.resolve(respuestaChat({ contenido: "Hola, Martin 23! Soy Lucía, asistente de Mr Otto. En qué puedo ayudarte hoy?" }));
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assertEquals(resultado.derivo, false, "no tenía que derivar: el 23 es parte del nombre, no un precio");
  assertEquals(resultado.mensajesAlCliente, ["Hola, Martin 23! Soy Lucía, asistente de Mr Otto. En qué puedo ayudarte hoy?"]);
});

// Pedido de Mateo, 21/9 (vía logica), causa #1 del informe de los probadores (4 de 5 la
// encontraron): una charla ya derivada quedaba MUDA por completo, sin importar qué escribiera el
// cliente. Ahora solo se calla si se enoja o pide hablar con una persona; todo lo demás lo sigue
// contestando. Las tres pruebas de acá corren con conversaciones.estado = 'derivada' Y
// yaDerivada: true (lo que el worker de logica va a pasar cuando saque el bloqueo total).
//
// El clasificador y el principal NO tienen que correr (el silencio se decide por palabra clave,
// en el paso 4a, antes de leer historial): el fetcher de abajo lo hace explícito, tirando si
// alguno de los dos se llama. El extractor SÍ corre siempre, en el finally del turno (guarda lo
// que el cliente dijo aunque el turno no conteste nada) — el fetcher lo responde normal.
function fetcherSoloExtractor(): typeof fetch {
  return ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const esExtractor = body.response_format?.json_schema?.name === "ficha";
    if (esExtractor) {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    throw new Error("no tenía que llamar al clasificador ni al principal: el silencio se decide por palabra clave, en el paso 4a");
  }) as unknown as typeof fetch;
}

// Corregido el 21/9 (Mateo, tanda de preguntas): la primera versión de esto trataba un reclamo
// TRANQUILO como motivo de silencio (reusaba MOTIVOS_CON_TEXTO_RECLAMO, la lista de "qué texto
// fijo mandar al derivar", para una pregunta distinta: "cuándo callarse estando ya derivada").
// Un reclamo tranquilo no calla a Lucía: ya está derivada (así que "deriva" ya está cumplido) y
// sigue contestando normal — solo la AGRESIÓN (cliente_enojado, por tono) la calla, ver el test
// de abajo.
prueba("charla ya derivada: un reclamo TRANQUILO no calla a Lucía, sigue contestando (corregido, no es agresión)", async ({ ctx, sql, conversacionId }) => {
  await sql.query("update conversaciones set estado = 'derivada' where id = $1", [conversacionId]);
  await insertarEntrante(sql, conversacionId, "quiero hacer un reclamo, el traje llegó con una mancha");
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const esClasificador = body.response_format?.json_schema?.name === "clasificacion";
    const esExtractor = body.response_format?.json_schema?.name === "ficha";
    if (esClasificador) {
      // No tendría que llamarse: "reclamo" ya se detecta por palabra clave en el paso 4a.
      throw new Error("no tenía que llamar al clasificador: reclamo se detecta por palabra clave, antes");
    }
    if (esExtractor) {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    return Promise.resolve(respuestaChat({ contenido: "Te leo, ya se lo paso al equipo para que lo vean con vos." }));
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher, yaDerivada: true,
  });

  assertEquals(resultado.derivo, false, "no es una derivación nueva: ya la tiene una persona");
  assertEquals(resultado.mensajesAlCliente, ["Te leo, ya se lo paso al equipo para que lo vean con vos."], "sigue contestando: un reclamo tranquilo no es motivo de silencio");
});

Deno.test("charla ya derivada: si hay agresión (cliente_enojado, por tono), Lucía deriva por enojo, se calla y NO crea otra derivación", async () => {
  await conBase(async (sql) => {
    await sql.query("begin");
    try {
      const telefono = `54900${Date.now()}`.slice(0, 13);
      const clienteId = (await sql.query("insert into clientes (telefono) values ($1) returning id::text as id", [telefono])).rows[0].id as string;
      const conversacionId = (await sql.query(
        "insert into conversaciones (cliente_id, canal, estado) values ($1, 'prueba', 'derivada') returning id::text as id",
        [clienteId],
      )).rows[0].id as string;
      await insertarEntrante(sql, conversacionId, "ESTO ES UNA VERGUENZA, son todos unos inutiles, denme la plata YA o hago un escandalo");
      const antes = await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]);
      const fetcher = ((_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const esExtractor = body.response_format?.json_schema?.name === "ficha";
        if (esExtractor) {
          return Promise.resolve(respuestaChat({
            contenido: JSON.stringify({
              nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
              talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
            }),
          }));
        }
        // Sin clasificador (9/10): Lucía deriva por enojo y derivar_a_persona, al ver la charla ya
        // derivada, pide callarse sin abrir otra derivación.
        return Promise.resolve(respuestaChat({
          contenido: "Te entiendo.",
          toolCall: { nombre: "derivar_a_persona", argumentos: { motivo: "cliente_enojado", mensaje_al_cliente: "Le paso tu consulta al equipo." } },
        }));
      }) as unknown as typeof fetch;

      const resultado = await correrTurno(dbDesde(sql as unknown as ClienteSql), {
        clienteId, telefono, conversacionId, ahora: AHORA, tz: TZ,
        calendario: calendarioDeEnsayo, derivacionTel: null, fetcher, yaDerivada: true,
      });

      assertEquals(resultado.derivo, false, "no es una derivación nueva: ya la tiene una persona");
      assertEquals(resultado.mensajesAlCliente, [], "se calla: es agresión, no un reclamo tranquilo");
      const despues = await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]);
      assertEquals(despues, antes, "no se creó ninguna fila nueva en derivaciones");
    } finally {
      await sql.query("rollback");
    }
  });
});

Deno.test("charla ya derivada: si pide hablar con una persona, Lucía se calla y NO crea otra derivación", async () => {
  await conBase(async (sql) => {
    await sql.query("begin");
    try {
      const telefono = `54900${Date.now()}`.slice(0, 13);
      const clienteId = (await sql.query("insert into clientes (telefono) values ($1) returning id::text as id", [telefono])).rows[0].id as string;
      const conversacionId = (await sql.query(
        "insert into conversaciones (cliente_id, canal, estado) values ($1, 'prueba', 'derivada') returning id::text as id",
        [clienteId],
      )).rows[0].id as string;
      await insertarEntrante(sql, conversacionId, "quiero hablar con una persona, por favor");
      const antes = await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]);

      const resultado = await correrTurno(dbDesde(sql as unknown as ClienteSql), {
        clienteId, telefono, conversacionId, ahora: AHORA, tz: TZ,
        calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherSoloExtractor(), yaDerivada: true,
      });

      assertEquals(resultado.derivo, false);
      assertEquals(resultado.mensajesAlCliente, [], "se calla: pidió hablar con una persona");
      const despues = await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]);
      assertEquals(despues, antes, "no se creó ninguna fila nueva en derivaciones");
    } finally {
      await sql.query("rollback");
    }
  });
});

prueba("charla ya derivada: una pregunta normal (horarios), Lucía la sigue contestando en vez de quedarse muda", async ({ ctx, sql, conversacionId, clienteId }) => {
  await sql.query("update conversaciones set estado = 'derivada' where id = $1", [conversacionId]);
  await insertarEntrante(sql, conversacionId, "hola, necesito saber los horarios del local");
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
    return Promise.resolve(respuestaChat({ contenido: "Hola! Seguimos por acá sin problema. ¿En qué más te puedo ayudar?" }));
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher, yaDerivada: true,
  });

  assertEquals(resultado.derivo, false, "no es una derivación nueva");
  assertEquals(resultado.mensajesAlCliente, ["Hola! Seguimos por acá sin problema. En qué más te puedo ayudar?"], "sigue contestando, no se queda muda");
});

// Pedido de Mateo, 21/9 (tanda de preguntas, vía logica): se presenta de nuevo si pasaron más de
// 7 días desde el último mensaje, no solo en el primerísimo mensaje de la charla. El contexto
// tiene que avisárselo al modelo (armarContextoDelTurno), y esPrimerMensaje tiene que ensancharse
// para que presentacion_repetida no le corte la reintroducción (sin tocar esa barandilla: usa el
// mismo booleano que ya usaba para el primer mensaje de verdad).
prueba("charla con un hueco de más de 7 días: el contexto avisa, y Lucía se puede volver a presentar sin que la barandilla la corte", async ({ ctx, sql, conversacionId }) => {
  const haceDiezDias = new Date(AHORA.getTime() - 10 * 24 * 60 * 60 * 1000);
  await sql.query(
    `insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values
       ($1, 'entrante', 'texto', $2, $3::timestamptz),
       ($1, 'saliente', 'texto', $4, $5::timestamptz)`,
    [
      conversacionId,
      "hola, quería consultar por un traje",
      haceDiezDias.toISOString(),
      "Hola! Soy Lucía, del equipo de Mr Otto. ¿En qué puedo ayudarte hoy?",
      new Date(haceDiezDias.getTime() + 60_000).toISOString(),
    ],
  );
  await insertarEntrante(sql, conversacionId, "hola, de nuevo por acá");

  let contextoCapturado = "";
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
    // El principal: acá se manda el contexto del turno como mensaje de sistema.
    const mensajes = body.messages as { role: string; content: string }[];
    contextoCapturado = mensajes.find((m) => m.role === "system" && m.content.includes("CONTEXTO DE ESTE TURNO"))?.content ?? "";
    return Promise.resolve(respuestaChat({ contenido: "Hola de nuevo! Soy Lucía, del equipo de Mr Otto. ¿En qué te puedo ayudar hoy?" }));
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assert(contextoCapturado.includes("Pasaron 10 días"), `el contexto tiene que avisar el hueco largo: ${contextoCapturado}`);
  assertEquals(
    resultado.mensajesAlCliente,
    ["Hola de nuevo! Soy Lucía, del equipo de Mr Otto. En qué te puedo ayudar hoy?"],
    "no se corta: el hueco largo se trata como si arrancara la charla, presentacion_repetida no interviene",
  );
});

// Corporativo/uniformes (red-team del 24/9, reproducido 2/2). La regla 12 pide juntar cinco datos
// ANTES de que el equipo llame, pero corporativo y uniforme son derivación dura por palabra clave:
// eso corre ANTES del modelo y CORTA el turno, así que Lucía nunca llegaba a preguntar nada y el
// equipo recibía el contacto en blanco. La regla era imposible de cumplir.
// El arreglo no fue sacar el freno —se perdería la garantía de que el contacto llegue— sino darle
// a corporativo su propio texto de traspaso, que deriva Y hace la primera pregunta en el mismo
// mensaje. Las otras cuatro las junta en los turnos siguientes: la charla queda 'derivada' pero
// corporativo NO está en MOTIVOS_DE_SILENCIO_DERIVADA, así que Lucía sigue contestando.
// Lo que esta prueba defiende: que el mensaje del traspaso sea el de corporativo (que pregunta) y
// no el genérico (que no pregunta nada). Si vuelve el genérico, volvió el agujero.
prueba("corporativo: lo deriva Lucía (sin filtro de palabras) y sale su propio texto, que además pregunta, no el genérico", async ({ ctx, sql, conversacionId }) => {
  await insertarEntrante(sql, conversacionId, "hola, necesito uniformes para mi empresa");
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
    return Promise.resolve(respuestaChat({ toolCall: { nombre: "derivar_a_persona", argumentos: { motivo: "corporativo", mensaje_al_cliente: "Le paso tu consulta al equipo." } } }));
  }) as unknown as typeof fetch;

  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });

  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "corporativo");
  // El dueño lo edita desde el panel, así que se compara contra el valor vigente y no contra una
  // redacción congelada (mismo criterio que el resto de los textos fijos, hallazgo del 24/9).
  const { valor: textoCorp } = await fila(sql, "select valor from contexto_agente where clave = 'texto_derivacion_corporativo'");
  assertEquals(resultado.mensajesAlCliente, [sinSignosDeApertura(textoCorp)]);
  // Y lo que hace que el arreglo SIRVA: que pregunte algo. Un traspaso mudo deja al equipo sin datos.
  assert(resultado.mensajesAlCliente[0].includes("?"), "el traspaso de corporativo tiene que hacer una pregunta");
  const { valor: generico } = await fila(sql, "select valor from contexto_agente where clave = 'texto_derivacion_dura_generica'");
  assert(resultado.mensajesAlCliente[0] !== sinSignosDeApertura(generico), "no puede salir el genérico");
  const der = await fila(sql, "select motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([der?.motivo, der?.estado], ["corporativo", "pendiente"]);
});

// Pedido de Mateo, 5/10: con el evento hoy o mañana, el texto fijo le pasa al cliente el teléfono
// del local. Dos caminos, los dos de punta a punta:
//  · la fecha ya estaba en la ficha (derivación dura del paso 4a): antes salía el genérico ("te
//    paso con alguien del equipo") en vez del texto propio;
//  · el cliente la dice ahora y buscar_horarios deriva: el texto pasa por las barandillas, y el
//    anterior ("Te paso con un asesor…") lo descartaba anuncia_sin_derivar. El teléfono tampoco
//    puede leerse como precio (54, 341, 239).
const TEXTO_CON_TELEFONO = "Para un evento tan cercano, lo mejor es que te comuniques directo con el local al +54 9 341 239 2502: ya les avisé, así te ayudan a resolverlo enseguida.";

prueba("evento hoy o mañana ya en la ficha: sale el texto propio, no el genérico (5/10)", async ({ ctx, sql, clienteId, conversacionId }) => {
  await sql.query("update contexto_agente set valor = $1 where clave = 'texto_evento_inminente'", [TEXTO_CON_TELEFONO]);
  await sql.query("update clientes set fecha_evento = $2 where id = $1", [clienteId, "2030-06-04"]); // mañana
  await insertarEntrante(sql, conversacionId, "hola, necesito un traje");
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher: fetcherSoloExtractor(),
  });
  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "evento_inminente");
  assertEquals(resultado.mensajesAlCliente.join(" "), TEXTO_CON_TELEFONO);
});

prueba("evento hoy o mañana por buscar_horarios: el texto con el teléfono pasa las barandillas tal cual (5/10)", async ({ ctx, sql, conversacionId }) => {
  await sql.query("update contexto_agente set valor = $1 where clave = 'texto_evento_inminente'", [TEXTO_CON_TELEFONO]);
  await insertarEntrante(sql, conversacionId, "hola, necesito un traje para mañana a la noche");
  let llamadasAlPrincipal = 0;
  const fetcher = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const nombre = body.response_format?.json_schema?.name;
    if (nombre === "clasificacion") {
      return Promise.resolve(respuestaChat({ contenido: JSON.stringify({ intencion: "urgente", urgencia: "alta", derivar_duro: false, motivo_derivacion: null }) }));
    }
    if (nombre === "ficha") {
      return Promise.resolve(respuestaChat({
        contenido: JSON.stringify({
          nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null,
          talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null,
        }),
      }));
    }
    llamadasAlPrincipal++;
    if (llamadasAlPrincipal === 1) {
      return Promise.resolve(respuestaChat({
        toolCall: {
          nombre: "buscar_horarios",
          argumentos: { desde: "2030-06-03", hasta: "2030-06-04", tipo_turno: null, fecha_hora: null, desde_hora: null, hasta_hora: null, fecha_evento: "2030-06-04" },
        },
      }));
    }
    return Promise.resolve(respuestaChat({ contenido: "" }));
  }) as unknown as typeof fetch;
  const resultado = await correrTurno(ctx.db, {
    clienteId: ctx.cliente.id, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, fetcher,
  });
  assertEquals(resultado.derivo, true);
  assertEquals(resultado.motivoDerivacion, "evento_inminente");
  assertEquals(resultado.mensajesAlCliente.join(" "), TEXTO_CON_TELEFONO);
  const saltos = await contar(sql, "select count(*)::int as n from eventos_agente where conversacion_id = $1 and detalle->>'etapa' = 'barandilla-en-derivacion'", [conversacionId]);
  assertEquals(saltos, 0, "ninguna barandilla tendría que saltar con este texto");
});
