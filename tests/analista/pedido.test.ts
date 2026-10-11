// El pedido al modelo del analista de charlas (0102, 10/10): cómo se arma la charla que lee, las
// instrucciones, el esquema y la petición, y qué fecha analiza. Puro: sin red ni base.
// Correr: env -u OPENAI_API_KEY deno test tests/analista --allow-all --no-lock --node-modules-dir=none

import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import {
  armarCalendario,
  armarCharla,
  armarInstrucciones,
  armarPeticion,
  CATEGORIAS_ERROR,
  CATEGORIAS_MEJORA,
  describirEvento,
  ESQUEMA_ANALISIS,
  leerPedido,
  MAXIMO_MENSAJES_DEL_DIA,
  modeloDelAnalista,
  razonamientoDelAnalista,
} from "../../supabase/functions/analista/pedido.ts";
import { a, charla, charlaTipica, cliente, evento, FECHA, lucia, mensaje, TZ } from "./_ayuda.ts";

Deno.test("armarCharla: numera solo los mensajes del día, con su autor y su hora", () => {
  const c = charlaTipica("c1");
  const { texto, numerados } = armarCharla(c, FECHA, TZ);
  assertEquals(numerados.map((m) => [m.numero, m.autor]), [[1, "cliente"], [2, "lucia"], [3, "lucia"], [4, "cliente"], [5, "lucia"]]);
  assertEquals(numerados[1].id, c.delDia[1].id);
  assertStringIncludes(texto, "[1] 11:34 Cliente: Hola! Queria averiguar");
  assertStringIncludes(texto, "[2] 11:34 Lucía: Hola, Colo. El alquiler del ambo es *a partir de $150.000*.");
  assertStringIncludes(texto, "CHARLA DEL VIERNES 9 DE OCTUBRE DE 2026");
  assertStringIncludes(texto, "- fecha del evento: 2026-11-20");
  assertStringIncludes(texto, "SUS TURNOS (estado de hoy):\n- ninguno");
});

Deno.test("armarCharla: lo de antes va como contexto, sin número; el equipo y las plantillas se distinguen de Lucía", () => {
  const c = charla("c2", [
    cliente("¿y para el sábado?", "10:00"),
    mensaje("saliente", "[mostrador] Te esperamos el sábado a las 11", "10:05"),
    mensaje("saliente", "¡Hola Colo! Te recordamos tu turno", "10:10", { tipo: "template" }),
    cliente(null, "10:20", { tipo: "audio", transcripcion: "quería saber si abren el lunes" }),
    cliente(null, "10:21", { tipo: "image", contenido: "este color" }),
    lucia("El lunes 12 el local está cerrado.", "10:22", { noEnviado: "error_al_enviar" }),
  ], {
    antes: [{ ...cliente("hola", "18:00"), at: a("18:00", "2026-10-08") }, { ...lucia("Hola! Soy Lucía", "18:00"), at: a("18:01", "2026-10-08") }],
    turnos: [{ inicio: a("11:00", "2026-10-13"), estado: "sin-confirmar", tipo: "invitado", creadoAt: a("10:05") }],
  });
  const { texto, numerados } = armarCharla(c, FECHA, TZ);
  assertEquals(numerados.map((m) => m.autor), ["cliente", "equipo", "plantilla", "cliente", "cliente", "lucia"]);
  assertStringIncludes(texto, "· 8/10 18:00 Cliente: hola");
  assertStringIncludes(texto, "· 8/10 18:01 Lucía: Hola! Soy Lucía");
  assert(!/\[\d+\] 18:0/.test(texto), "lo de antes no lleva número");
  assertStringIncludes(texto, "[2] 10:05 [equipo] Persona del local, desde el panel: Te esperamos el sábado a las 11");
  assert(!texto.includes("[mostrador]"), "la marca de mostrador no se muestra");
  assertStringIncludes(texto, "[3] 10:10 Lucía (plantilla automática): ¡Hola Colo!");
  assertStringIncludes(texto, "[4] 10:20 Cliente: (audio) «quería saber si abren el lunes»");
  assertStringIncludes(texto, "[5] 10:21 Cliente: (foto) este color");
  assertStringIncludes(texto, "[6] 10:22 Lucía: El lunes 12 el local está cerrado. [no le llegó al cliente: error_al_enviar]");
  assertStringIncludes(texto, "- 13/10 11:00 · invitado · sin-confirmar · sacado el 9/10 10:05");
});

Deno.test("armarCharla: la bitácora queda debajo de la respuesta a la que pertenece y lo que no interesa no se muestra", () => {
  const c = charlaTipica("c3");
  c.eventos = [
    evento("pensamiento", { etapa: "clasificar", intencion: "alquiler", derivar_duro: false }, "11:34"),
    evento("herramienta", { herramienta: "consultar_catalogo", argumentos: { modelo: null }, ok: true }, "11:34"),
    evento("ok", { etapa: "worker-lucia", burbujas: 2 }, "11:34"),
    evento("error", { etapa: "agrupar-rafaga", error: "no había ningún mensaje entrante nuevo para contestar" }, "11:34"),
    evento("herramienta", { herramienta: "buscar_horarios", argumentos: { desde: "2026-10-10", tipo_turno: null }, ok: false, rechazo: "evento_inminente" }, "11:35"),
  ];
  // Los eventos se guardan un instante después de los mensajes del turno.
  c.eventos[0].at = new Date(c.delDia[2].at.getTime() + 1000);
  c.eventos[1].at = new Date(c.delDia[2].at.getTime() + 1001);
  c.eventos[4].at = new Date(c.delDia[4].at.getTime() + 1000);
  const { texto } = armarCharla(c, FECHA, TZ);
  const lineas = texto.split("\n");
  const i3 = lineas.findIndex((l) => l.startsWith("[3] "));
  assertEquals(lineas[i3 + 1], "    ↳ herramienta consultar_catalogo() → ok");
  assert(lineas[i3 + 2].startsWith("[4] "), "el clasificador sin derivar, el worker y la ráfaga vacía no aparecen");
  assertStringIncludes(texto, '↳ herramienta buscar_horarios(desde="2026-10-10") → rechazada (evento_inminente)');
});

Deno.test("describirEvento: controles, pases al equipo y notas, en una línea", () => {
  assertEquals(
    describirEvento(evento("error", { etapa: "barandilla", barandilla: "repeticiones", chequeo: "confirmacion_doble", accion: "cortar", motivo: "se recorta la frase repetida" }, "10:00")),
    "control repeticiones/confirmacion_doble (cortar): se recorta la frase repetida",
  );
  assertEquals(
    describirEvento(evento("error", {
      etapa: "barandilla",
      saltos: [{ barandilla: "dato_sin_consultar", chequeo: "precio_sin_herramienta", accion: "rehacer", motivo: "un precio ($540.000) sin consultar_catalogo" }],
      instruccion: "Reescribí…",
    }, "10:00")),
    "primer intento rehecho por los controles · control dato_sin_consultar/precio_sin_herramienta (rehacer): un precio ($540.000) sin consultar_catalogo",
  );
  assertEquals(
    describirEvento(evento("derivacion", { motivo: "dato_no_encontrado", origen: "herramienta", derivacion_id: "x" }, "10:00")),
    "pasó la charla al equipo · motivo dato_no_encontrado (lo decidió: herramienta)",
  );
  assertEquals(describirEvento(evento("error", { etapa: "principal", motivo: "sin texto" }, "10:00")), "el modelo no terminó la respuesta (sin texto)");
  assertEquals(
    describirEvento(evento("pensamiento", { etapa: "ultimo-intento", nota: "contestó sin herramientas" }, "10:00")),
    "nota (ultimo-intento): contestó sin herramientas",
  );
  assertEquals(describirEvento(evento("pensamiento", { etapa: "clasificar", derivar_duro: true, motivo_derivacion: "reclamo" }, "10:00")), "clasificador: derivar (reclamo)");
  assertEquals(describirEvento(evento("pensamiento", { etapa: "extraer", guardado: ["nombre"] }, "10:00")), null);
  assertEquals(describirEvento(evento("ok", { etapa: "envio_programado", tipo: "recontacto_1" }, "10:00")), null);
});

Deno.test("armarCharla: una charla larguísima manda los últimos mensajes y avisa cuántos quedaron afuera", () => {
  const muchos = Array.from({ length: MAXIMO_MENSAJES_DEL_DIA + 5 }, (_, i) => {
    const m = cliente(`mensaje ${i + 1}`, "12:00");
    m.at = new Date(a("12:00").getTime() + i * 1000);
    return m;
  });
  const { texto, numerados, recortados } = armarCharla(charla("c4", muchos), FECHA, TZ);
  assertEquals(recortados, 5);
  assertEquals(numerados.length, MAXIMO_MENSAJES_DEL_DIA);
  assertEquals(numerados[0].texto, "mensaje 6");
  assertStringIncludes(texto, "se dejaron afuera los primeros 5 mensajes del día");
});

Deno.test("armarCharla: un mensaje enorme se corta", () => {
  const { numerados } = armarCharla(charla("c5", [cliente("x".repeat(5000), "12:00")]), FECHA, TZ);
  assert(numerados[0].texto.length <= 1500);
  assert(numerados[0].texto.endsWith("…"));
});

Deno.test("armarInstrucciones: las reglas de Lucía tal cual y lo que es verdad (fichas, precios, horario), siempre igual", () => {
  const datos = {
    prompt: "Sos Lucía, del equipo de Mr Otto.\r\n1. CÓMO HABLÁS",
    fragmentos: [{ tema: "talles", titulo: "Talles", texto: "Del 44 al 62." }],
    catalogo: [{ modelo: "Ambo Liso", precio: 150000 }, { modelo: "Smoking", precio: 185000 }, { modelo: "Sin cargar", precio: 0 }],
    accesorios: [{ nombre: "Camisa + corbata", precio: 33500, precioCompra: null }],
    calendario: "- lunes 12/10: cerrado (Feriado)",
  };
  const t = armarInstrucciones(datos);
  assertStringIncludes(t, "Sos el analista de calidad de Lucía");
  assertStringIncludes(t, "Sos Lucía, del equipo de Mr Otto.\n1. CÓMO HABLÁS");
  assertStringIncludes(t, "### talles · Talles\nDel 44 al 62.");
  assertStringIncludes(t, "El alquiler arranca en $150.000");
  assertStringIncludes(t, "- Smoking: $185.000");
  assert(!t.includes("Sin cargar"), "un precio en 0 es «todavía no cargado», no un precio");
  assertStringIncludes(t, "- Camisa + corbata: alquiler $33.500");
  assertStringIncludes(t, "- lunes 12/10: cerrado (Feriado)");
  // Es el comienzo de cada pedido de la noche: tiene que ser idéntico para que OpenAI lo cachee.
  assertEquals(armarInstrucciones(datos), t);
});

Deno.test("armarPeticion: Responses, sin guardar en OpenAI, JSON estricto, el prefijo cacheado primero", () => {
  const p = armarPeticion({ modelo: "gpt-6.1-sol", instrucciones: "INSTRUCCIONES", charla: "CHARLA", fecha: FECHA, hoy: "2026-10-10", razonamiento: "low" });
  assertEquals(p.model, "gpt-6.1-sol");
  assertEquals(p.store, false);
  assertEquals(p.reasoning, { effort: "low" });
  assertEquals(p.prompt_cache_key, "otto-analista");
  assertEquals(p.text?.format.type, "json_schema");
  assertEquals(p.text?.format.strict, true);
  assertEquals(p.text?.format.schema, ESQUEMA_ANALISIS);
  assert(p.max_output_tokens > 1000);
  assertEquals(p.tools, undefined);
  const [developer, user] = p.input as { role: string; content: string }[];
  assertEquals(developer, { role: "developer", content: "INSTRUCCIONES" });
  assertEquals(user.role, "user");
  assertMatch(user.content, /viernes 9 de octubre de 2026.*sábado 10 de octubre de 2026[\s\S]*CHARLA$/);
});

// OpenAI rechaza un esquema estricto si un objeto no lista todas sus propiedades en required o deja
// pasar propiedades de más: se chequea acá y no en la primera noche.
Deno.test("ESQUEMA_ANALISIS cumple las reglas del modo estricto y usa las mismas categorías que la base", () => {
  const revisar = (nodo: Record<string, unknown>, camino: string) => {
    if (nodo.type === "object" || (Array.isArray(nodo.type) && nodo.type.includes("object"))) {
      const props = Object.keys(nodo.properties as Record<string, unknown>);
      assertEquals([...(nodo.required as string[])].sort(), [...props].sort(), `${camino}: required tiene que tener todas las propiedades`);
      assertEquals(nodo.additionalProperties, false, `${camino}: additionalProperties false`);
      for (const [k, v] of Object.entries(nodo.properties as Record<string, Record<string, unknown>>)) revisar(v, `${camino}.${k}`);
    }
    if (nodo.items) revisar(nodo.items as Record<string, unknown>, `${camino}[]`);
  };
  revisar(ESQUEMA_ANALISIS as unknown as Record<string, unknown>, "raíz");
  const props = ESQUEMA_ANALISIS.properties;
  assertEquals([...props.errores.items.properties.categoria.enum], [...CATEGORIAS_ERROR]);
  assertEquals([...props.mejoras.items.properties.categoria.enum], [...CATEGORIAS_MEJORA]);
});

Deno.test("las categorías del código son las del check de la migración 0102", async () => {
  const sql = await Deno.readTextFile(new URL("../../supabase/migrations/0102_analista_de_charlas.sql", import.meta.url));
  for (const c of [...CATEGORIAS_ERROR, ...CATEGORIAS_MEJORA]) assertStringIncludes(sql, `'${c}'`);
  const enElCheck = (tipo: string) =>
    [...(sql.match(new RegExp(`tipo = '${tipo}' and categoria in \\(([^)]*)\\)`))?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assertEquals(enElCheck("error"), [...CATEGORIAS_ERROR]);
  assertEquals(enElCheck("mejora"), [...CATEGORIAS_MEJORA]);
});

Deno.test("leerPedido: sin fecha analiza ayer en hora de Argentina; a mano, solo días que ya terminaron", () => {
  // 10/10 a las 03:00 de Argentina (06:00 UTC): ayer es el 9.
  assertEquals(leerPedido({}, new Date("2026-10-10T06:00:00Z"), TZ), { fecha: "2026-10-09", relevo: 0 });
  // 02:30 UTC del 10 todavía es el 9 en Argentina: ayer es el 8.
  assertEquals(leerPedido(null, new Date("2026-10-10T02:30:00Z"), TZ), { fecha: "2026-10-08", relevo: 0 });
  assertEquals(leerPedido({ fecha: "2026-10-01", relevo: 3 }, new Date("2026-10-10T06:00:00Z"), TZ), { fecha: "2026-10-01", relevo: 3 });
  assert("error" in leerPedido({ fecha: "2026-10-10" }, new Date("2026-10-10T06:00:00Z"), TZ), "hoy todavía no terminó");
  assert("error" in leerPedido({ fecha: "2026-10-31" }, new Date("2026-10-10T06:00:00Z"), TZ));
  assert("error" in leerPedido({ fecha: "9/10/2026" }, new Date("2026-10-10T06:00:00Z"), TZ));
  assert("error" in leerPedido({ fecha: "2026-02-30" }, new Date("2026-10-10T06:00:00Z"), TZ));
  assert("error" in leerPedido({ relevo: -1 }, new Date("2026-10-10T06:00:00Z"), TZ));
  assert("error" in leerPedido({ relevo: "2" }, new Date("2026-10-10T06:00:00Z"), TZ));
});

Deno.test("modelo y razonamiento: LLM_ANALISTA y si no, el de Lucía; low si no se dice o no se entiende", () => {
  assertEquals(modeloDelAnalista("gpt-6-sol", "gpt-6.1-sol"), "gpt-6-sol");
  assertEquals(modeloDelAnalista("  ", "gpt-6.1-sol"), "gpt-6.1-sol");
  assertEquals(modeloDelAnalista(undefined, undefined), "");
  assertEquals(razonamientoDelAnalista(undefined), "low");
  assertEquals(razonamientoDelAnalista(" Medium "), "medium");
  assertEquals(razonamientoDelAnalista("muchísimo"), "low");
});

Deno.test("armarCalendario: desde el día de las charlas, con cerrados, posibles feriados y domingos", () => {
  const horario = [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, apertura: 600, cierre: 1140 })).concat([{ diaSemana: 6, apertura: 570, cierre: 1110 }]);
  const sinTurnos = new Map([
    ["2026-10-12", { motivo: "Feriado", posibleFeriado: false }],
    ["2026-11-23", { motivo: "Feriado: Soberanía", posibleFeriado: true }],
  ]);
  const t = armarCalendario(FECHA, horario, sinTurnos, 4).split("\n");
  assertEquals(t, [
    "- viernes 9/10 (el día de las charlas): abre de 10:00 a 19:00",
    "- sábado 10/10: abre de 9:30 a 18:30",
    "- domingo 11/10: cerrado",
    "- lunes 12/10: cerrado (Feriado)",
  ]);
  assertStringIncludes(armarCalendario("2026-11-23", horario, sinTurnos, 1), "posible feriado (Soberanía): Lucía no lo ofrece ni lo recomienda");
});
