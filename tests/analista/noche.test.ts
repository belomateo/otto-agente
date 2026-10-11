// Una corrida del analista de charlas (0102, 10/10) con la base en memoria y el modelo simulado: que
// una charla que falla no corte la noche, los topes de charlas y de plata, el tiempo de la Edge
// Function, los reintentos y el relevo. Puro: sin red ni base.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.13";
import {
  correrNoche,
  debePedirRelevo,
  type LlamarModelo,
  llamadaReal,
  type ResumenCorrida,
  TOPES,
} from "../../supabase/functions/analista/noche.ts";
import { MAXIMO_RELEVOS } from "../../supabase/functions/analista/pedido.ts";
import { charlaTipica, FECHA, RepoEnMemoria, respuestaJson, TZ, usoQueCuesta } from "./_ayuda.ts";

const MODELO = "gpt-6.1-sol";
const PROMPT = "Sos Lucía, del equipo de Mr Otto.";
const UN_ERROR = respuestaJson({
  errores: [{ categoria: "no_ofrecio_turno", gravedad: "media", mensaje: 5, cita: "¿Querés que te busque un turno", que_estuvo_mal: "x", que_conviene: "y" }],
});

const charlas = (n: number) => Array.from({ length: n }, (_, i) => charlaTipica(`c${i + 1}`));

/** Modelo simulado: contesta lo que diga `fn` según la charla (por el id que va en el texto). */
function modelo(fn: (id: string) => string | null | Error, uso = usoQueCuesta(0.01)): LlamarModelo & { llamadas: string[] } {
  const llamadas: string[] = [];
  const f: LlamarModelo = async ({ charla }) => {
    const id = /Cliente: (c\d+)/.exec(charla)?.[1] ?? "?";
    llamadas.push(id);
    const r = fn(id);
    if (r instanceof Error) throw r;
    return r === null ? null : { contenido: r, uso, modelo: MODELO };
  };
  return Object.assign(f, { llamadas });
}

// Cada charla de prueba lleva su id como nombre del cliente, así el modelo simulado sabe cuál es.
function repo(n: number) {
  const r = new RepoEnMemoria(charlas(n));
  for (const c of r.charlas) c.cliente = c.conversacionId;
  return r;
}

const correr = (r: RepoEnMemoria, llamarModelo: LlamarModelo, topes: Partial<typeof TOPES> = {}, ahora: () => number = () => Date.now()) =>
  correrNoche({ fecha: FECHA, tz: TZ, prompt: PROMPT }, { repo: r, llamarModelo, ahora, topes });

Deno.test("analiza todas las charlas del día, guarda lo que encontró y suma el costo", async () => {
  const r = repo(3);
  const m = modelo(() => UN_ERROR);
  const res = await correr(r, m);
  assertEquals(m.llamadas.sort(), ["c1", "c2", "c3"]);
  assertEquals([res.charlas, res.tomadas, res.analizadas, res.fallidas, res.errores, res.mejoras, res.pendientes], [3, 3, 3, 0, 3, 0, 0]);
  assertEquals(r.guardados.length, 3);
  assertEquals(r.guardados[0].hallazgos[0].categoria, "no_ofrecio_turno");
  assertEquals(r.guardados[0].consumo, { modelo: MODELO, uso: usoQueCuesta(0.01), costoUsd: 0.01 });
  assertEquals(res.costoCorridaUsd, 0.03);
  assertEquals(res.costoNocheUsd, 0.03);
  assertEquals(r.referenciaLeida, 1, "las fichas y el horario se leen una vez por corrida");
});

Deno.test("el modelo recibe las instrucciones con las reglas de Lucía y la charla numerada", async () => {
  const r = repo(1);
  let visto: { instrucciones: string; charla: string } | null = null;
  await correr(r, async (p) => {
    visto = p;
    return { contenido: respuestaJson({}), uso: usoQueCuesta(0.01), modelo: MODELO };
  });
  assertStringIncludes(visto!.instrucciones, "Sos el analista de calidad de Lucía");
  assertStringIncludes(visto!.instrucciones, PROMPT);
  assertStringIncludes(visto!.instrucciones, "- Ambo Liso: $150.000");
  assertStringIncludes(visto!.charla, "[2] 11:34 Lucía: Hola, Colo.");
});

Deno.test("si el modelo no contesta una charla, esa queda como fallo y la noche sigue con las demás", async () => {
  const r = repo(3);
  const res = await correr(r, modelo((id) => (id === "c2" ? null : UN_ERROR)));
  assertEquals([res.analizadas, res.fallidas], [2, 1]);
  assertEquals(r.fallos.map((f) => [f.id, f.consumo]), [["c2", null]]);
  assertStringIncludes(r.fallos[0].detalle, "no contestó");
  assertEquals(r.revisiones.get("c2")?.estado, "fallo");
  assertEquals(res.pendientes, 1, "la que falló se reintenta una vez en otra corrida");
  assert(debePedirRelevo(res, 0));
});

Deno.test("si la llamada tira un error, lo mismo: fallo con el motivo y sigue", async () => {
  const r = repo(3);
  const res = await correr(r, modelo((id) => (id === "c1" ? new Error("OpenAI respondió 500") : UN_ERROR)));
  assertEquals([res.analizadas, res.fallidas], [2, 1]);
  assertStringIncludes(r.fallos[0].detalle, "OpenAI respondió 500");
});

Deno.test("una respuesta que no es el JSON pedido queda como fallo, y lo que costó igual se anota", async () => {
  const r = repo(2);
  const res = await correr(r, modelo((id) => (id === "c1" ? '{"errores": [ cortado' : UN_ERROR)));
  assertEquals([res.analizadas, res.fallidas], [1, 1]);
  assertEquals(r.fallos[0].consumo?.costoUsd, 0.01);
  assertEquals(res.costoCorridaUsd, 0.02);
});

Deno.test("si no se puede leer la charla o guardar lo encontrado, esa queda como fallo y sigue", async () => {
  const r = repo(3);
  r.fallarGuardar.add("c3");
  const original = r.cargarCharla.bind(r);
  r.cargarCharla = (f, id) => (id === "c2" ? Promise.reject(new Error("timeout de la base")) : original(f, id));
  const res = await correr(r, modelo(() => UN_ERROR));
  assertEquals([res.analizadas, res.fallidas], [1, 2]);
  assertEquals(r.fallos.map((f) => f.id).sort(), ["c2", "c3"]);
  assertStringIncludes(r.fallos.find((f) => f.id === "c2")!.detalle, "no se pudo leer la charla");
  assertStringIncludes(r.fallos.find((f) => f.id === "c3")!.detalle, "no se pudo guardar");
});

Deno.test("si la base no deja tomar una charla, se sigue con las demás y queda pendiente para el relevo", async () => {
  const r = repo(3);
  const tomar = r.tomar.bind(r);
  r.tomar = (f, id) => (id === "c2" ? Promise.reject(new Error("deadlock detected")) : tomar(f, id));
  const res = await correr(r, modelo(() => UN_ERROR));
  assertEquals([res.tomadas, res.analizadas, res.pendientes], [2, 2, 1]);
  assert(debePedirRelevo(res, 0));
});

Deno.test("los puntos que no pasan la validación se descartan y quedan en el detalle de la corrida", async () => {
  const r = repo(1);
  const res = await correr(r, modelo(() => respuestaJson({ errores: [{ categoria: "inventada", gravedad: "alta", mensaje: 1, cita: "x", que_estuvo_mal: "x", que_conviene: "y" }] })));
  assertEquals([res.analizadas, res.errores, res.descartados], [1, 0, 1]);
  assertStringIncludes(res.detalles[0], "inventada");
});

Deno.test("tope de plata: al llegar a US$ 1 no empieza otra charla y las que quedan se anotan como salteadas", async () => {
  const r = repo(6);
  const res = await correr(r, modelo(() => UN_ERROR, usoQueCuesta(0.4)), { concurrencia: 1 });
  assertEquals([res.analizadas, res.salteadas, res.tope, res.pendientes], [3, 3, "costo", 0]);
  assertEquals(res.costoNocheUsd, 1.2, "se puede pasar por lo que costó la última, nunca por una charla más");
  assertEquals(r.salteadas.map((s) => s.id), ["c4", "c5", "c6"]);
  assertStringIncludes(r.salteadas[0].detalle, "US$ 1");
  assert(!debePedirRelevo(res, 0), "con el tope no se pide relevo");
});

Deno.test("el tope de plata cuenta lo que ya gastaron las corridas anteriores de la misma noche", async () => {
  const r = repo(4);
  r.revisiones.set("c1", { conversacionId: "c1", estado: "analizada", intentos: 1, costoUsd: 0.95, tomadaAt: new Date() });
  const m = modelo(() => UN_ERROR, usoQueCuesta(0.1));
  const res = await correr(r, m, { concurrencia: 1 });
  assertEquals(m.llamadas, ["c2"], "con 0,95 gastados entra una más y ahí corta");
  assertEquals([res.tope, res.salteadas], ["costo", 2]);
  assertEquals(res.costoNocheUsd, 1.05);
});

Deno.test("tope de charlas: nunca más que el máximo por noche, aunque se analicen varias a la vez", async () => {
  const r = repo(7);
  const m = modelo(() => UN_ERROR);
  const res = await correr(r, m, { maxCharlas: 3, concurrencia: 3 });
  assertEquals(m.llamadas.length, 3);
  assertEquals([res.analizadas, res.salteadas, res.tope], [3, 4, "charlas"]);
  assertStringIncludes(r.salteadas[0].detalle, "tope de 3 charlas");
});

Deno.test("el tope de charlas cuenta las de corridas anteriores; un reintento no es una charla nueva", async () => {
  const r = repo(4);
  r.revisiones.set("c1", { conversacionId: "c1", estado: "analizada", intentos: 1, costoUsd: 0.01, tomadaAt: new Date() });
  r.revisiones.set("c2", { conversacionId: "c2", estado: "fallo", intentos: 1, costoUsd: 0, tomadaAt: new Date() });
  const m = modelo(() => UN_ERROR);
  const res = await correr(r, m, { maxCharlas: 2, concurrencia: 1 });
  assertEquals(m.llamadas, ["c2"], "c2 se reintenta (ya contaba); c3 y c4 serían la tercera y la cuarta");
  assertEquals([res.tope, res.salteadas], ["charlas", 2]);
});

Deno.test("no vuelve a analizar lo ya hecho; un fallo se reintenta una sola vez", async () => {
  const r = repo(4);
  const hace = new Date();
  r.revisiones.set("c1", { conversacionId: "c1", estado: "analizada", intentos: 1, costoUsd: 0.01, tomadaAt: hace });
  r.revisiones.set("c2", { conversacionId: "c2", estado: "fallo", intentos: 1, costoUsd: 0, tomadaAt: hace });
  r.revisiones.set("c3", { conversacionId: "c3", estado: "fallo", intentos: 2, costoUsd: 0, tomadaAt: hace });
  r.revisiones.set("c4", { conversacionId: "c4", estado: "salteada", intentos: 0, costoUsd: 0, tomadaAt: hace });
  const m = modelo(() => null);
  const res = await correr(r, m);
  assertEquals(m.llamadas, ["c2"]);
  assertEquals([res.tomadas, res.fallidas, res.pendientes], [1, 1, 0], "c2 ya usó su reintento: no queda nada pendiente");
  assert(!debePedirRelevo(res, 0));
});

Deno.test("una charla colgada (la corrida que la tenía se murió) se retoma pasados 10 minutos, no antes", async () => {
  const r = repo(2);
  r.revisiones.set("c1", { conversacionId: "c1", estado: "analizando", intentos: 1, costoUsd: 0, tomadaAt: new Date(Date.now() - 11 * 60_000) });
  r.revisiones.set("c2", { conversacionId: "c2", estado: "analizando", intentos: 1, costoUsd: 0, tomadaAt: new Date(Date.now() - 60_000) });
  const m = modelo(() => UN_ERROR);
  const res = await correr(r, m);
  assertEquals(m.llamadas, ["c1"], "c2 la tiene otra corrida que sigue viva");
  assertEquals(res.analizadas, 1);
});

Deno.test("el tiempo: no empieza una charla si no le alcanza para terminarla, y lo que queda pide relevo", async () => {
  const r = repo(5);
  let reloj = 1_000_000;
  const m = modelo(() => {
    reloj += 40_000; // cada análisis tarda 40 s
    return UN_ERROR;
  });
  const res = await correr(r, m, { concurrencia: 1 }, () => reloj);
  // 125 s de corrida y 50 s mínimos para empezar: en 0 s y 40 s entra; a los 80 s quedan 45 s.
  assertEquals(m.llamadas, ["c1", "c2"]);
  assertEquals([res.analizadas, res.sinTiempo, res.pendientes, res.tope], [2, true, 3, null]);
  assert(debePedirRelevo(res, 0));
});

Deno.test("al modelo le llega hasta cuándo puede tardar: lo que le queda a la corrida, menos el margen para guardar", async () => {
  const r = repo(1);
  const reloj = 5_000_000;
  let hasta = 0;
  await correr(r, async (_p, hastaMs) => {
    hasta = hastaMs;
    return { contenido: respuestaJson({}), uso: usoQueCuesta(0.01), modelo: MODELO };
  }, {}, () => reloj);
  assertEquals(hasta, reloj + TOPES.limiteCorridaMs - TOPES.margenGuardarMs);
});

Deno.test("de a varias a la vez, pero nunca más que la concurrencia", async () => {
  const r = repo(7);
  let enCurso = 0;
  let maximo = 0;
  const res = await correr(r, async () => {
    enCurso++;
    maximo = Math.max(maximo, enCurso);
    await new Promise((listo) => setTimeout(listo, 5));
    enCurso--;
    return { contenido: UN_ERROR, uso: usoQueCuesta(0.01), modelo: MODELO };
  }, { concurrencia: 3 });
  assertEquals(maximo, 3);
  assertEquals(res.analizadas, 7);
});

Deno.test("la primera llamada de la corrida va sola (así las demás encuentran las instrucciones en el caché)", async () => {
  const r = repo(4);
  const eventos: string[] = [];
  let enCurso = 0;
  await correr(r, async ({ charla }) => {
    const id = /Cliente: (c\d+)/.exec(charla)?.[1];
    eventos.push(`empieza ${id} con ${enCurso} en curso`);
    enCurso++;
    await new Promise((listo) => setTimeout(listo, 5));
    enCurso--;
    return { contenido: UN_ERROR, uso: usoQueCuesta(0.01), modelo: MODELO };
  }, { concurrencia: 3 });
  assertEquals(eventos[0], "empieza c1 con 0 en curso");
  assertEquals(eventos[1], "empieza c2 con 0 en curso", "la segunda espera a que vuelva la primera");
  assert(eventos.slice(2).some((e) => !e.endsWith("con 0 en curso")), "después sí van juntas");
});

Deno.test("si la primera llamada falla, las demás no se quedan esperando", async () => {
  const r = repo(3);
  const res = await correr(r, modelo((id) => (id === "c1" ? new Error("se cortó") : UN_ERROR)), { concurrencia: 3 });
  assertEquals([res.analizadas, res.fallidas], [2, 1]);
});

Deno.test("sin nada que hacer no lee las fichas ni llama al modelo", async () => {
  const r = repo(2);
  for (const id of ["c1", "c2"]) r.revisiones.set(id, { conversacionId: id, estado: "analizada", intentos: 1, costoUsd: 0.02, tomadaAt: new Date() });
  const res = await correr(r, modelo(() => {
    throw new Error("no debería llamarse");
  }));
  assertEquals([res.charlas, res.tomadas, res.pendientes, r.referenciaLeida], [2, 0, 0, 0]);
  assertEquals(res.costoNocheUsd, 0.04);
});

Deno.test("debePedirRelevo: solo si quedó algo, sin tope, con avance y sin pasarse de relevos", () => {
  const base: ResumenCorrida = {
    fecha: FECHA, charlas: 10, tomadas: 4, analizadas: 4, fallidas: 0, errores: 0, mejoras: 0, descartados: 0, salteadas: 0,
    tope: null, sinTiempo: true, pendientes: 6, costoCorridaUsd: 0, costoNocheUsd: 0, detalles: [],
  };
  assert(debePedirRelevo(base, 0));
  assert(!debePedirRelevo({ ...base, pendientes: 0 }, 0));
  assert(!debePedirRelevo({ ...base, tope: "costo" }, 0));
  assert(!debePedirRelevo({ ...base, tomadas: 0 }, 0), "si esta corrida no pudo tomar ninguna, otra la tiene");
  assert(!debePedirRelevo(base, MAXIMO_RELEVOS));
});

Deno.test("llamadaReal: arma la petición de Responses y devuelve el texto y el uso (OpenAI simulado)", async () => {
  const anterior = Deno.env.get("OPENAI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "clave-de-prueba");
  try {
    let cuerpo: Record<string, unknown> = {};
    let url = "";
    const fetcher = (async (u: string | URL | Request, init?: RequestInit) => {
      url = String(u);
      cuerpo = JSON.parse(String(init?.body));
      return Response.json({
        output: [{ type: "message", content: [{ type: "output_text", text: respuestaJson({}) }] }],
        usage: { input_tokens: 9000, output_tokens: 700, input_tokens_details: { cached_tokens: 8000 } },
      });
    }) as typeof fetch;
    const llamar = llamadaReal({ modelo: MODELO, razonamiento: "low", fecha: FECHA, hoy: "2026-10-10", fetcher });
    const r = await llamar({ instrucciones: "INSTR", charla: "CHARLA" }, Date.now() + 60_000);
    assertEquals(url, "https://api.openai.com/v1/responses");
    assertEquals(cuerpo.model, MODELO);
    assertEquals((cuerpo.text as { format: { name: string } }).format.name, "analisis_charla");
    assertEquals(r, { contenido: respuestaJson({}), uso: { tokensIn: 9000, tokensOut: 700, tokensCacheados: 8000 }, modelo: MODELO });
  } finally {
    if (anterior === undefined) Deno.env.delete("OPENAI_API_KEY");
    else Deno.env.set("OPENAI_API_KEY", anterior);
  }
});
