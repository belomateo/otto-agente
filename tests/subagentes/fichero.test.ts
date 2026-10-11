// El fichero (LLM_EXTRACTOR, llm/extractor.ts): después de cada turno lee la charla y arma la ficha
// del cliente (nombre, evento, fecha, rol, talle, presupuesto…). Lo llama turno.ts en su finally.
// Trabajo 5 (pedido de Mateo, 10/10): una prueba para cada ayudante de Lucía.
//
// El caso que motivó esto: el cliente pregunta «¿cuánto sale?», Lucía contesta «el alquiler arranca
// a partir de $150.000» y la ficha quedaba con presupuesto_mencionado = «a partir de $150.000», como
// si el cliente hubiera dicho que tiene esa plata. En la base, el 10/10: 160 de las 163 fichas con
// presupuesto eran eso (ver supabase/migrations/0101_limpia_presupuestos.sql).
//
// Parte simulada (siempre, sin base ni red): la guarda en código, el pedido al modelo, la lectura de
// la respuesta, qué pasa si el modelo falla o devuelve basura, y un turno entero (correrTurno con la
// base en memoria) para ver que turno.ts le pasa al fichero lo que dijo cada uno y que un fichero
// caído no tira el turno. Parte real (PRUEBA_MODELO_REAL=1): cinco charlas chicas contra el modelo de
// verdad, incluida la del precio de Lucía. Cómo correr cada una: ver _comun.ts.

import { assert, assertEquals, assertMatch, assertRejects, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import { montos } from "../../supabase/functions/_shared/barandillas/chequeos/precio_sin_herramienta.ts";
import { calendarioDeEnsayo } from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { ESQUEMA_FICHA } from "../../supabase/functions/_shared/llm/esquemas.ts";
import { esUnPrecioQueDijoLucia, extraer, type OrigenDeLaCharla, validarExtraccion } from "../../supabase/functions/_shared/llm/extractor.ts";
import { costoUsd } from "../../supabase/functions/_shared/llm/precios.ts";
import { correrTurno } from "../../supabase/functions/_shared/turno/turno.ts";
import { llamar, openaiSimulado, type PedidoSimulado, type RespuestaSimulada } from "../herramientas/_openai_simulado.ts";
import { BaseEnMemoria, exigirClaveDeOpenAI, FICHA_NULA, MODELO_REAL, respuestaChat, simulada } from "./_comun.ts";

const HOY = "2026-10-10";
const AHORA = new Date("2026-10-10T15:00:00-03:00");
const TZ = "America/Argentina/Cordoba";
const URL_CHAT = "https://api.openai.com/v1/chat/completions";

// Una charla armada igual que la arma turno.ts para el fichero: el texto con «Cliente:» y «Lucía:»
// adelante de cada mensaje, y lo que dijo cada uno por separado para la guarda del presupuesto.
type Linea = ["cliente" | "lucia", string];
function charla(lineas: Linea[], preciosDevueltos: number[] = []): { texto: string; origen: OrigenDeLaCharla } {
  return {
    texto: lineas.map(([quien, t]) => `${quien === "cliente" ? "Cliente" : "Lucía"}: ${t}`).join("\n"),
    origen: {
      cliente: lineas.filter(([q]) => q === "cliente").map(([, t]) => t).join("\n"),
      lucia: lineas.filter(([q]) => q === "lucia").map(([, t]) => t).join("\n"),
      preciosDevueltos,
    },
  };
}

const LUCIA_DA_EL_PRECIO = "Hola, soy Lucía, del equipo de Mr Otto. El alquiler arranca a partir de $150.000 e incluye el ambo, " +
  "los ajustes de sastrería y la tintorería antes y después. ¿Para qué evento lo necesitás y para qué fecha es?";

// ── 1. La guarda en código (defensa b) ──────────────────────────────────────────────────────

simulada("guarda: el «a partir de $150.000» que dijo Lucía no es el presupuesto del cliente, lo escriba como lo escriba", () => {
  const { origen } = charla([["cliente", "Hola, cuánto sale alquilar un traje?"], ["lucia", LUCIA_DA_EL_PRECIO], ["cliente", "Es para un casamiento"]]);
  // Las formas que quedaron en la base real el 10/10 (81 fichas con la primera, 32 con la segunda…).
  for (const p of ["a partir de $150.000", "$150.000", "desde $150.000", "Desde $150.000", "arranca en $150.000", "150000", "150 mil", "a partir de $150.000 por persona"]) {
    assert(esUnPrecioQueDijoLucia(p, origen), `«${p}» tendría que descartarse`);
  }
});

simulada("guarda: los precios de los accesorios juntos con el del traje también son de Lucía", () => {
  const { origen } = charla([
    ["cliente", "y la camisa y los zapatos?"],
    ["lucia", "El alquiler arranca en $150.000. La camisa y la corbata se alquilan por $33.500, y el zapato con cinturón por $55.000."],
  ]);
  // Textual de una ficha real del 10/10.
  assert(esUnPrecioQueDijoLucia("$150.000 traje; $33.500 camisa y corbata; $55.000 zapatos y cinturón", origen));
});

simulada("guarda: un precio que solo está en traza.preciosDevueltos (Lucía no lo escribió) también cuenta como de Lucía", () => {
  const { origen } = charla([["cliente", "cuánto sale?"], ["lucia", "Te cuento todo cuando vengas al local. ¿Para qué fecha es tu evento?"]], [150000]);
  assert(esUnPrecioQueDijoLucia("$150.000", origen));
  // Y sin la traza, con ese mismo texto de Lucía, no hay de dónde saber que era suyo: se deja.
  assert(!esUnPrecioQueDijoLucia("$150.000", { ...origen, preciosDevueltos: [] }));
});

simulada("guarda (caso parecido): si el cliente nombró ese número, no se descarta en código — lo decide el modelo", () => {
  const lucia = LUCIA_DA_EL_PRECIO;
  assert(!esUnPrecioQueDijoLucia("150 mil", { cliente: "Tengo 150 mil para el traje, alcanza?", lucia }));
  // «150» a secas es 150 mil: el cliente no escribe los ceros.
  assert(!esUnPrecioQueDijoLucia("150", { cliente: "tengo 150, alcanza?", lucia }));
  // El límite de la guarda, a propósito: un cliente que PREGUNTA por el precio también lo nombra
  // (caso real del 6/10: «¿están todos en 150mil?»). Distinguir pregunta de presupuesto es tarea del
  // modelo (la instrucción, defensa a), no de una regla de código que se equivocaría para un lado.
  assert(!esUnPrecioQueDijoLucia("a partir de $150.000", { cliente: "Y el precio depende de los trajes o estan todos en 150mil?", lucia }));
});

simulada("guarda (caso parecido): el presupuesto propio del cliente se guarda aunque Lucía haya dicho otro precio", () => {
  const lucia = LUCIA_DA_EL_PRECIO;
  assert(!esUnPrecioQueDijoLucia("hasta 120 mil", { cliente: "tengo hasta 120 mil", lucia }));
  // Mezclado con el de Lucía: tiene un número que no es de ella, así que no es un eco. Se deja.
  assert(!esUnPrecioQueDijoLucia("tengo 200 mil; el alquiler arranca en $150.000", { cliente: "puedo gastar 200 mil", lucia }));
  assert(!esUnPrecioQueDijoLucia("entre 100 y 150 mil", { cliente: "no sé, lo que salga", lucia }));
  // Sin ningún número no hay con qué comparar (ficha real del 10/10: «no tengo la plata»).
  assert(!esUnPrecioQueDijoLucia("no tengo la plata", { cliente: "Es solo para probar, porque todavía no tengo la plata", lucia }));
});

simulada("validarExtraccion con lo que dijo cada uno: descarta el presupuesto eco, avisa por qué y guarda el resto", () => {
  const { origen } = charla([["cliente", "cuánto sale? es para un casamiento"], ["lucia", LUCIA_DA_EL_PRECIO]]);
  const { ficha, descartados } = validarExtraccion({ ...FICHA_NULA, evento: "casamiento", presupuesto_mencionado: "a partir de $150.000" }, HOY, origen);
  assertEquals(ficha, { evento: "casamiento" });
  assertEquals(descartados, [`presupuesto_mencionado="a partir de $150.000" (es un precio que dijo Lucía, no lo que el cliente quiere gastar)`]);
});

simulada("validarExtraccion sin lo que dijo cada uno: el presupuesto pasa como antes (quien no pasa el origen no pierde nada)", () => {
  const { ficha, descartados } = validarExtraccion({ presupuesto_mencionado: "a partir de $150.000" }, HOY);
  assertEquals(ficha.presupuesto_mencionado, "a partir de $150.000");
  assertEquals(descartados, []);
});

simulada("validarExtraccion: un JSON que no es la ficha (null, lista, número, texto) da ficha vacía, sin tirar", () => {
  for (const cruda of [null, [], 42, "hola", [{ nombre: "Juan" }]]) {
    assertEquals(validarExtraccion(cruda as unknown as Record<string, unknown>, HOY), { ficha: {}, descartados: [] }, JSON.stringify(cruda));
  }
});

// ── 2. El pedido al modelo y la lectura de la respuesta ─────────────────────────────────────

type Pedido = { url: string; init: RequestInit; body: Record<string, unknown> };
function fetcherQueAnota(contestar: (n: number) => Response | Promise<Response>): { fetcher: typeof fetch; pedidos: Pedido[] } {
  const pedidos: Pedido[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) });
    return await contestar(pedidos.length);
  }) as typeof fetch;
  return { fetcher, pedidos };
}

simulada("pedido: va a Chat Completions con el modelo del fichero, la charla entera y el esquema estricto de la ficha", async () => {
  const { texto, origen } = charla([["cliente", "Hola, cuánto sale alquilar un traje?"], ["lucia", LUCIA_DA_EL_PRECIO]]);
  const { fetcher, pedidos } = fetcherQueAnota(() => respuestaChat(JSON.stringify(FICHA_NULA)));
  await extraer(texto, fetcher, HOY, origen);
  assertEquals(pedidos.length, 1);
  const [p] = pedidos;
  assertEquals(p.url, URL_CHAT);
  assertEquals(p.init.method, "POST");
  // La clave viaja en el encabezado (no se imprime: puede ser la de verdad).
  assert(String(new Headers(p.init.headers).get("authorization")).startsWith("Bearer "), "falta la clave en el pedido");
  assertEquals(p.body.model, Deno.env.get("LLM_EXTRACTOR") ?? "");
  assertEquals(p.body.max_completion_tokens, 400);
  assertEquals(p.body.response_format, { type: "json_schema", json_schema: { name: "ficha", schema: ESQUEMA_FICHA, strict: true } });
  const mensajes = p.body.messages as { role: string; content: string }[];
  assertEquals(mensajes.map((m) => m.role), ["system", "user"]);
  assertEquals(mensajes[1].content, texto, "el fichero lee la charla tal cual, con las líneas de Lucía");
  assertStringIncludes(mensajes[0].content, `Fecha actual en Argentina: ${HOY}`);
});

simulada("pedido (defensa a): la instrucción y el esquema dicen que el presupuesto es lo que el CLIENTE quiere gastar, nunca un precio de Lucía", async () => {
  const { fetcher, pedidos } = fetcherQueAnota(() => respuestaChat(JSON.stringify(FICHA_NULA)));
  // Sin `hoy`: la fecha del día (2026-10-10) se leería como un monto de $10 en la cuenta de abajo.
  await extraer("Cliente: hola", fetcher);
  const sistema = String((pedidos[0].body.messages as { content: string }[])[0].content);
  assertStringIncludes(sistema, "presupuesto_mencionado es cuánto dijo el CLIENTE que quiere o puede gastar");
  assertStringIncludes(sistema, "NUNCA son el presupuesto del cliente");
  // Sin precios escritos a mano: el ejemplo no queda viejo cuando cambie el precio.
  assertEquals(montos(sistema), [], "la instrucción no tiene que traer un precio de la casa");
  const descripcion = String(ESQUEMA_FICHA.properties.presupuesto_mencionado.description);
  assertStringIncludes(descripcion, "CLIENTE");
  assertStringIncludes(descripcion, "Nunca un precio que dijo Lucía");
});

simulada("pedido: sin `hoy` no se le inventa una fecha al modelo", async () => {
  const { fetcher, pedidos } = fetcherQueAnota(() => respuestaChat(JSON.stringify(FICHA_NULA)));
  await extraer("Cliente: hola", fetcher);
  assert(!String((pedidos[0].body.messages as { content: string }[])[0].content).includes("Fecha actual"));
});

simulada("respuesta: lee la ficha, saltea los null, pasa los tokens y descarta el presupuesto eco", async () => {
  const { texto, origen } = charla([["cliente", "soy Martín, me caso el 14 de febrero a la noche, cuánto sale?"], ["lucia", LUCIA_DA_EL_PRECIO]]);
  const { fetcher } = fetcherQueAnota(() =>
    respuestaChat(
      JSON.stringify({ ...FICHA_NULA, nombre: "Martín", evento: "casamiento", rol: "novio", fecha_evento: "2027-02-14", dia_o_noche: "noche", presupuesto_mencionado: "a partir de $150.000" }),
      { prompt_tokens: 812, completion_tokens: 64 },
    )
  );
  const r = await extraer(texto, fetcher, HOY, origen);
  assert(r);
  assertEquals(r.ficha, { nombre: "Martín", evento: "casamiento", rol: "novio", fecha_evento: "2027-02-14", dia_o_noche: "noche" });
  assertEquals(r.descartados.length, 1);
  assertStringIncludes(r.descartados[0], "presupuesto_mencionado");
  assertEquals([r.tokensIn, r.tokensOut, r.tokensCacheados], [812, 64, 0]);
});

// ── 3. Si el modelo falla o devuelve basura: null o campos descartados, nunca una excepción ──

simulada("falla: OpenAI responde 500 dos veces → null (reintentó una vez)", async () => {
  const { fetcher, pedidos } = fetcherQueAnota(() => Response.json({ error: { message: "caído (prueba)" } }, { status: 500 }));
  assertEquals(await extraer("Cliente: hola", fetcher, HOY), null);
  assertEquals(pedidos.length, 2);
});

simulada("falla: el primer intento da 500 y el segundo sale bien → usa el segundo", async () => {
  const { fetcher, pedidos } = fetcherQueAnota((n) => n === 1 ? new Response("{}", { status: 500 }) : respuestaChat(JSON.stringify({ ...FICHA_NULA, ciudad: "Funes" })));
  const r = await extraer("Cliente: soy de Funes", fetcher, HOY);
  assertEquals(r?.ficha, { ciudad: "Funes" });
  assertEquals(pedidos.length, 2);
});

simulada("falla: sin red (fetch tira) → null, sin tirar", async () => {
  const { fetcher, pedidos } = fetcherQueAnota(() => {
    throw new TypeError("error de red (prueba)");
  });
  assertEquals(await extraer("Cliente: hola", fetcher, HOY), null);
  assertEquals(pedidos.length, 2);
});

simulada("basura: sin contenido, texto suelto, JSON cortado o JSON que no es la ficha → null", async () => {
  for (const contenido of [null, "Perdón, no puedo ayudarte con eso.", '{"nombre": "Jua', "null", "[]", "42", '"hola"']) {
    const { fetcher } = fetcherQueAnota(() => respuestaChat(contenido));
    assertEquals(await extraer("Cliente: hola", fetcher, HOY), null, `contenido ${JSON.stringify(contenido)}`);
  }
});

simulada("basura: campos con valores que no existen se descartan uno por uno; lo bueno se guarda", async () => {
  const { fetcher } = fetcherQueAnota(() =>
    respuestaChat(JSON.stringify({
      ...FICHA_NULA,
      nombre: 123, // no es texto: se ignora
      evento: "boda",
      rol: "madre",
      fecha_evento: "noviembre",
      email: "juan arroba gmail",
      talle_aprox: "   ",
      ciudad: "Rosario",
    }))
  );
  const r = await extraer("Cliente: ...", fetcher, HOY);
  assert(r);
  assertEquals(r.ficha, { ciudad: "Rosario" });
  // En el orden de CAMPOS_FICHA (ficha.ts).
  assertEquals(r.descartados, [
    `evento="boda"`,
    `fecha_evento="noviembre" (no es AAAA-MM-DD)`,
    `rol="madre"`,
    `email="juan arroba gmail" (no tiene forma de mail)`,
  ]);
});

simulada("sin OPENAI_API_KEY tira (es un error de programación, no de red) y no llama a nadie", async () => {
  const antes = Deno.env.get("OPENAI_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  try {
    const { fetcher, pedidos } = fetcherQueAnota(() => respuestaChat("{}"));
    await assertRejects(() => extraer("Cliente: hola", fetcher, HOY), Error, "Falta OPENAI_API_KEY");
    assertEquals(pedidos.length, 0);
  } finally {
    if (antes !== undefined) Deno.env.set("OPENAI_API_KEY", antes);
  }
});

// ── 4. Un turno entero, con la base en memoria ──────────────────────────────────────────────
// Lo que importa acá no es el fichero solo sino cómo lo usa turno.ts: que le pase lo que dijo cada uno
// (y los precios de la traza) y que, si el fichero se cae, el cliente reciba su respuesta igual.

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const CHARLA = "22222222-2222-4222-8222-222222222222";

function baseConCatalogo(): BaseEnMemoria {
  const db = new BaseEnMemoria();
  db.fragmentos["que-incluye"] = "El alquiler incluye el ambo (saco y pantalón), los ajustes de sastrería y la tintorería antes y después.";
  db.precios = [150000];
  return db;
}

function escribe(db: BaseEnMemoria, texto: string) {
  db.agregarMensaje({ direccion: "entrante", tipo: "texto", contenido: texto, enviado_at: new Date(AHORA.getTime() - 1000).toISOString() });
}

// El principal: primero consulta el catálogo (así el precio queda en la traza, como en producción) y
// después contesta `texto`. El fichero contesta con `ficha`, o con lo que devuelva `fichero`.
function openaiDelTurno(p: { texto: string; ficha?: Record<string, unknown>; fichero?: (pedido: PedidoSimulado) => RespuestaSimulada }) {
  const alFichero: PedidoSimulado[] = [];
  let vueltas = 0;
  const fetcher = openaiSimulado((pedido) => {
    if (pedido.schema === "ficha") {
      alFichero.push(pedido);
      return p.fichero ? p.fichero(pedido) : { content: JSON.stringify({ ...FICHA_NULA, ...(p.ficha ?? {}) }) };
    }
    vueltas++;
    if (vueltas === 1) return { content: null, tool_calls: [llamar("consultar_catalogo", { modelo: null, accesorios: null })] };
    return { content: p.texto };
  });
  return { fetcher, alFichero };
}

// Un fetcher que deja pasar al principal y al fichero le hace lo que diga `alFichero`.
function conFicheroRoto(base: typeof fetch, alFichero: () => Response): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.response_format?.json_schema?.name === "ficha") return alFichero();
    return base(url, init);
  }) as typeof fetch;
}

const turno = (db: BaseEnMemoria, fetcher: typeof fetch) =>
  correrTurno(db, {
    clienteId: CLIENTE, telefono: "+5490000000000", conversacionId: CHARLA, ahora: AHORA, tz: TZ,
    calendario: calendarioDeEnsayo, derivacionTel: null, prompt: "Sos Lucía (prompt de prueba).", fetcher,
  });

const TEXTO_CON_PRECIO = "El alquiler arranca a partir de $150.000 e incluye el ambo, los ajustes de sastrería y la tintorería. ¿Para qué fecha es tu evento?";

simulada("turno: Lucía dice el precio, el fichero lo anota como presupuesto → no llega a la ficha; el resto sí", async () => {
  const db = baseConCatalogo();
  escribe(db, "Hola, cuánto sale alquilar un traje? Es para un casamiento");
  const { fetcher, alFichero } = openaiDelTurno({ texto: TEXTO_CON_PRECIO, ficha: { evento: "casamiento", presupuesto_mencionado: "a partir de $150.000" } });
  const r = await turno(db, fetcher);
  assertEquals(r.derivo, false);
  assertStringIncludes(r.mensajesAlCliente.join("\n"), "$150.000");
  // El fichero vio el precio en la línea de Lucía (por eso se confundía)…
  assertEquals(alFichero.length, 1);
  assertStringIncludes(String(alFichero[0].messages[1].content), "Lucía: El alquiler arranca a partir de $150.000");
  // …y la ficha quedó sin presupuesto, con el evento guardado y el descarte en la bitácora.
  assertEquals(db.ficha.presupuesto_mencionado, null);
  assertEquals(db.ficha.evento, "casamiento");
  const descarte = db.eventos.find((e) => e.detalle.etapa === "extraer" && Array.isArray(e.detalle.descartados));
  assert(descarte, `falta el descarte en la bitácora: ${JSON.stringify(db.eventos)}`);
  assertStringIncludes(JSON.stringify(descarte.detalle.descartados), "es un precio que dijo Lucía");
});

simulada("turno: un precio que solo está en la traza (Lucía no lo escribió) también se frena — turno.ts le pasa traza.preciosDevueltos", async () => {
  const db = baseConCatalogo();
  escribe(db, "Hola, cuánto sale alquilar un traje?");
  const { fetcher } = openaiDelTurno({ texto: "Te cuento todo cuando vengas al local. ¿Para qué fecha es tu evento?", ficha: { presupuesto_mencionado: "150000" } });
  const r = await turno(db, fetcher);
  assert(!r.mensajesAlCliente.join("\n").includes("150"), "este caso es justamente sin el precio en el texto de Lucía");
  assertEquals(db.ficha.presupuesto_mencionado, null);
});

simulada("turno (caso parecido): el presupuesto que dijo el cliente se guarda aunque Lucía haya dado otro precio", async () => {
  const db = baseConCatalogo();
  escribe(db, "Hola, tengo hasta 120 mil para el traje, cuánto sale?");
  const { fetcher } = openaiDelTurno({ texto: TEXTO_CON_PRECIO, ficha: { presupuesto_mencionado: "hasta 120 mil" } });
  await turno(db, fetcher);
  assertEquals(db.ficha.presupuesto_mencionado, "hasta 120 mil");
});

simulada("turno (caso parecido): si el cliente dijo el mismo número que el precio, se guarda", async () => {
  const db = baseConCatalogo();
  escribe(db, "Tengo 150 mil justo para el traje, cuánto sale?");
  const { fetcher } = openaiDelTurno({ texto: TEXTO_CON_PRECIO, ficha: { presupuesto_mencionado: "150 mil" } });
  await turno(db, fetcher);
  assertEquals(db.ficha.presupuesto_mencionado, "150 mil");
});

simulada("turno: Lucía ya había dicho el precio en un turno anterior y el fichero lo arrastra → tampoco se guarda", async () => {
  const db = baseConCatalogo();
  db.agregarMensaje({ direccion: "entrante", tipo: "texto", contenido: "cuánto sale?", enviado_at: new Date(AHORA.getTime() - 120_000).toISOString() });
  db.agregarMensaje({ direccion: "saliente", tipo: "texto", contenido: "El alquiler arranca a partir de $150.000 e incluye el ambo.", enviado_at: new Date(AHORA.getTime() - 60_000).toISOString() });
  escribe(db, "Dale, es para el 12 de diciembre");
  // Este turno Lucía no consulta nada: solo pregunta.
  const fetcher = openaiSimulado((p) => p.schema === "ficha"
    ? { content: JSON.stringify({ ...FICHA_NULA, fecha_evento: "2026-12-12", presupuesto_mencionado: "a partir de $150.000" }) }
    : { content: "Perfecto, anotado. ¿Es de día o de noche?" });
  await turno(db, fetcher);
  assertEquals(db.ficha.fecha_evento, "2026-12-12");
  assertEquals(db.ficha.presupuesto_mencionado, null);
});

for (const [nombre, alFichero] of [
  ["OpenAI da 500 en los dos intentos", () => Response.json({ error: { message: "caído (prueba)" } }, { status: 500 })],
  ["contesta un texto suelto en vez de JSON", () => respuestaChat("Perdón, no puedo ayudarte con eso.")],
  ["contesta un JSON cortado a la mitad", () => respuestaChat('{"nombre": "Jua')],
  ["contesta null", () => respuestaChat("null")],
  ["se cae la red", () => {
    throw new TypeError("error de red (prueba)");
  }],
] as [string, () => Response][]) {
  simulada(`turno: si el fichero falla (${nombre}), el cliente recibe su respuesta igual y queda el error en la bitácora`, async () => {
    const db = baseConCatalogo();
    escribe(db, "Hola, cuánto sale alquilar un traje?");
    const { fetcher } = openaiDelTurno({ texto: TEXTO_CON_PRECIO });
    const r = await turno(db, conFicheroRoto(fetcher, alFichero));
    assertEquals(r.derivo, false);
    assertStringIncludes(r.mensajesAlCliente.join("\n"), "$150.000");
    assertEquals(db.salientes().length, r.mensajesAlCliente.length, "la respuesta quedó guardada para el próximo turno");
    assertEquals(db.fichaEscrita, [], "nada que escribir en la ficha");
    assert(
      db.eventos.some((e) => e.tipo === "error" && e.detalle.etapa === "extraer"),
      `falta el error del fichero en la bitácora: ${JSON.stringify(db.eventos.map((e) => e.detalle.etapa))}`,
    );
  });
}

// ── 5. Con el modelo de verdad (PRUEBA_MODELO_REAL=1) ───────────────────────────────────────
// Cinco charlas chicas (~1 centavo de dólar en total con gpt-5.4-mini). Se mira lo que contestó el
// MODELO (defensa a: la instrucción) y lo que quedó después de la guarda (defensa b). La fecha de hoy
// es fija para que el año de "14 de febrero" no dependa del día en que se corre.

type Capturada = { contenido: string | null; tokensIn: number; tokensOut: number; tokensCacheados: number };
function fetchQueCaptura(): { fetcher: typeof fetch; capturas: Capturada[] } {
  const capturas: Capturada[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const r = await fetch(url, init);
    const j = await r.clone().json().catch(() => ({}));
    capturas.push({
      contenido: j?.choices?.[0]?.message?.content ?? null,
      tokensIn: Number(j?.usage?.prompt_tokens ?? 0),
      tokensOut: Number(j?.usage?.completion_tokens ?? 0),
      tokensCacheados: Number(j?.usage?.prompt_tokens_details?.cached_tokens ?? 0),
    });
    return r;
  }) as typeof fetch;
  return { fetcher, capturas };
}

Deno.test({
  name: "fichero con el modelo real: cinco charlas chicas (PRUEBA_MODELO_REAL=1)",
  ignore: !MODELO_REAL,
  async fn(t) {
    exigirClaveDeOpenAI();
    if (!Deno.env.get("LLM_EXTRACTOR")) {
      // El .env de este repo no trae los modelos (viven en los secretos de Supabase): el de producción
      // es gpt-5.4-mini (extractor.ts, AGENTE.md § 11).
      Deno.env.set("LLM_EXTRACTOR", "gpt-5.4-mini");
      console.log("LLM_EXTRACTOR no estaba en el entorno: se usa gpt-5.4-mini (el de producción, extractor.ts)");
    }
    const { fetcher, capturas } = fetchQueCaptura();
    const crudo = () => JSON.parse(capturas[capturas.length - 1].contenido ?? "{}");

    await t.step("el «a partir de $150.000» de Lucía no es el presupuesto del cliente", async () => {
      const { texto, origen } = charla([
        ["cliente", "Hola! cuánto sale alquilar un traje?"],
        ["lucia", LUCIA_DA_EL_PRECIO],
        ["cliente", "Es para el casamiento de mi hermano, soy invitado"],
      ], [150000]);
      const r = await extraer(texto, fetcher, HOY, origen);
      assert(r, "el modelo no contestó");
      assertEquals(crudo().presupuesto_mencionado, null, `el modelo anotó ${JSON.stringify(crudo().presupuesto_mencionado)}`);
      assertEquals(r.ficha.presupuesto_mencionado, undefined);
      assertEquals(r.ficha.evento, "casamiento");
      assertEquals(r.ficha.rol, "invitado");
    });

    await t.step("los precios de los accesorios tampoco", async () => {
      const { texto, origen } = charla([
        ["cliente", "Hola, quería saber el precio del alquiler"],
        ["lucia", "El alquiler arranca a partir de $150.000 e incluye el ambo, los ajustes y la tintorería."],
        ["cliente", "y la camisa y los zapatos?"],
        ["lucia", "La camisa con corbata se alquila por $33.500 y el zapato con cinturón por $55.000."],
        ["cliente", "Buenísimo, gracias"],
      ], [150000, 33500, 55000]);
      const r = await extraer(texto, fetcher, HOY, origen);
      assert(r, "el modelo no contestó");
      assertEquals(crudo().presupuesto_mencionado, null, `el modelo anotó ${JSON.stringify(crudo().presupuesto_mencionado)}`);
      assertEquals(r.ficha.presupuesto_mencionado, undefined);
    });

    await t.step("lo que el cliente dice que puede gastar sí es su presupuesto", async () => {
      const { texto, origen } = charla([
        ["cliente", "Hola, necesito un traje para la graduación de mi hijo el 12 de diciembre. Tengo hasta 120 mil"],
        ["lucia", "El alquiler arranca a partir de $150.000 e incluye el ambo, los ajustes de sastrería y la tintorería. ¿Querés que te busque un turno para venir a probártelo?"],
        ["cliente", "Uh, se me va un poco"],
      ], [150000]);
      const r = await extraer(texto, fetcher, HOY, origen);
      assert(r, "el modelo no contestó");
      assert(r.ficha.presupuesto_mencionado, `no guardó el presupuesto del cliente: ${JSON.stringify(crudo())}`);
      assertEquals(montos(r.ficha.presupuesto_mencionado).map((n) => (n < 1000 ? n * 1000 : n)), [120000], r.ficha.presupuesto_mencionado);
      assertEquals(r.ficha.evento, "graduacion");
      assertEquals(r.ficha.fecha_evento, "2026-12-12");
    });

    await t.step("preguntar si todos están a ese precio no es tener esa plata (caso real del 6/10)", async () => {
      const { texto, origen } = charla([
        ["cliente", "Vi que alquilan trajes y quería saber como es"],
        ["lucia", "El alquiler es *a partir de $150.000*. Retirás el traje el día anterior al evento y lo devolvés el día hábil siguiente."],
        ["cliente", "Y el precio depende de los trajes o estan todos en 150mil?"],
      ], [150000]);
      const r = await extraer(texto, fetcher, HOY, origen);
      assert(r, "el modelo no contestó");
      // Acá la guarda en código no ayuda (el cliente nombró el número): depende de la instrucción.
      assertEquals(crudo().presupuesto_mencionado, null, `el modelo anotó ${JSON.stringify(crudo().presupuesto_mencionado)}`);
    });

    await t.step("los datos de siempre: nombre, evento, rol, fecha con el año que viene, noche y talle", async () => {
      const { texto, origen } = charla([
        ["cliente", "Hola, soy Martín. Me caso el 14 de febrero a la noche y uso talle 50"],
        ["lucia", "¡Felicitaciones, Martín! 🥂 Entonces tenemos que encontrar un look especial para vos. ¿Querés venir a probarte?"],
      ]);
      const r = await extraer(texto, fetcher, HOY, origen);
      assert(r, "el modelo no contestó");
      assertMatch(String(r.ficha.nombre), /^Mart[ií]n$/);
      assertEquals(r.ficha.evento, "casamiento");
      assertEquals(r.ficha.rol, "novio");
      assertEquals(r.ficha.fecha_evento, "2027-02-14");
      assertEquals(r.ficha.dia_o_noche, "noche");
      assertMatch(String(r.ficha.talle_aprox), /50/);
      assertEquals(r.ficha.presupuesto_mencionado, undefined);
    });

    const modelo = Deno.env.get("LLM_EXTRACTOR") ?? "";
    const costo = capturas.reduce((s, c) => s + costoUsd(modelo, c.tokensIn, c.tokensOut, c.tokensCacheados), 0);
    const tIn = capturas.reduce((s, c) => s + c.tokensIn, 0);
    const tOut = capturas.reduce((s, c) => s + c.tokensOut, 0);
    console.log(`fichero real (${modelo}): ${capturas.length} llamadas, ${tIn} tokens de entrada y ${tOut} de salida, ~US$ ${costo.toFixed(5)}`);
  },
});
