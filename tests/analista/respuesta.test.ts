// La lectura de lo que devuelve el modelo del analista (0102, 10/10): nada se guarda sin pasar por el
// código, y sobre todo ninguna cita que no esté en la charla. Puro: sin red ni base.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { armarCharla, type MensajeNumerado } from "../../supabase/functions/analista/pedido.ts";
import { citaEnMensaje, leerAnalisis, normalizarParaCita, ubicarCita } from "../../supabase/functions/analista/respuesta.ts";
import { charla, charlaTipica, cliente, FECHA, lucia, mensaje, respuestaJson, TZ } from "./_ayuda.ts";

const numerados = (): MensajeNumerado[] => armarCharla(charlaTipica("c1"), FECHA, TZ).numerados;

const error = (extra: Record<string, unknown> = {}) => ({
  categoria: "dato_falso",
  gravedad: "alta",
  mensaje: 2,
  cita: "a partir de $150.000",
  que_estuvo_mal: "Dio un precio que no es.",
  que_conviene: "Consultar el catálogo.",
  ...extra,
});
const mejora = (extra: Record<string, unknown> = {}) => ({
  categoria: "dato_faltante",
  mensaje: 1,
  cita: "Queria averiguar por precio",
  tema: "que-incluye",
  que_falto: "No está cargado si el chaleco va aparte.",
  texto_sugerido: "El chaleco [completar: se alquila aparte o viene incluido].",
  ...extra,
});

Deno.test("una respuesta bien formada: cada punto con su mensaje, su autor y la cita tal cual", () => {
  const n = numerados();
  const l = leerAnalisis(respuestaJson({ errores: [error()], mejoras: [mejora()] }), n)!;
  assertEquals(l.descartados, []);
  assertEquals(l.hallazgos, [
    {
      tipo: "error", categoria: "dato_falso", gravedad: "alta", mensajeId: n[1].id, autorCita: "lucia", cita: "a partir de $150.000",
      quePaso: "Dio un precio que no es.", queConviene: "Consultar el catálogo.", tema: null, textoSugerido: null,
    },
    {
      tipo: "mejora", categoria: "dato_faltante", gravedad: null, mensajeId: n[0].id, autorCita: "cliente", cita: "Queria averiguar por precio",
      quePaso: "No está cargado si el chaleco va aparte.", queConviene: null, tema: "que-incluye",
      textoSugerido: "El chaleco [completar: se alquila aparte o viene incluido].",
    },
  ]);
});

Deno.test("una charla sin problemas: las dos listas vacías se leen bien (no es un fallo)", () => {
  assertEquals(leerAnalisis(respuestaJson({}), numerados()), { hallazgos: [], descartados: [] });
});

Deno.test("lo que no se puede leer es null (la charla queda como fallo): vacío, cortado, otra forma", () => {
  const n = numerados();
  assertEquals(leerAnalisis(null, n), null);
  assertEquals(leerAnalisis("   ", n), null);
  assertEquals(leerAnalisis('{"errores": [{"categoria": "dato_fal', n), null);
  assertEquals(leerAnalisis("[]", n), null);
  assertEquals(leerAnalisis('{"errores": []}', n), null);
  assertEquals(leerAnalisis('{"errores": {}, "mejoras": []}', n), null);
});

Deno.test("una categoría que no existe, o un punto sin explicación, se descarta con el motivo (el resto queda)", () => {
  const l = leerAnalisis(
    respuestaJson({
      errores: [error({ categoria: "ortografia" }), error({ que_estuvo_mal: "  " }), error({ mensaje: 3, cita: "Incluye saco y pantalón" })],
      mejoras: [mejora({ categoria: "regla" }), mejora({ texto_sugerido: "" })],
    }),
    numerados(),
  )!;
  assertEquals(l.hallazgos.length, 1);
  assertEquals(l.hallazgos[0].cita, "Incluye saco y pantalón");
  assertEquals(l.descartados.length, 4);
  assert(l.descartados[0].includes("ortografia"));
});

Deno.test("la cita en otro mensaje: se corrige el número al mensaje donde está de verdad", () => {
  const n = numerados();
  const l = leerAnalisis(respuestaJson({ errores: [error({ mensaje: 3, cita: "El alquiler del ambo es" })] }), n)!;
  assertEquals(l.hallazgos[0].mensajeId, n[1].id);
  assertEquals(l.hallazgos[0].cita, "El alquiler del ambo es");
});

Deno.test("la cita no está en la charla pero el número sí: se guarda el texto real del mensaje, nunca el inventado", () => {
  const n = numerados();
  const l = leerAnalisis(respuestaJson({ errores: [error({ mensaje: 5, cita: "Te reservé el turno para el lunes" })] }), n)!;
  assertEquals(l.hallazgos[0].mensajeId, n[4].id);
  assertEquals(l.hallazgos[0].cita, "Perfecto, Colo. ¿Querés que te busque un turno en el local?");
});

Deno.test("sin número válido y con una cita que no está: el error se descarta; la mejora queda, sin cita", () => {
  const l = leerAnalisis(
    respuestaJson({
      errores: [error({ mensaje: 99, cita: "algo que nunca dijo" })],
      mejoras: [mejora({ mensaje: null, cita: "algo que nunca dijo" }), mejora({ mensaje: null, cita: null, categoria: "frase", tema: null })],
    }),
    numerados(),
  )!;
  assertEquals(l.hallazgos.map((h) => [h.tipo, h.mensajeId, h.cita, h.autorCita]), [["mejora", null, null, null], ["mejora", null, null, null]]);
  assertEquals(l.descartados.length, 1);
  assert(l.descartados[0].includes("sin un mensaje de ese día"));
});

Deno.test("lo que escribió el equipo no es un error de Lucía", () => {
  const c = charla("c2", [cliente("¿abren el lunes?", "10:00"), mensaje("saliente", "[mostrador] Sí, abrimos", "10:05"), lucia("Te espero el lunes.", "10:06")]);
  const n = armarCharla(c, FECHA, TZ).numerados;
  const l = leerAnalisis(respuestaJson({ errores: [error({ mensaje: 2, cita: "Sí, abrimos" })], mejoras: [mejora({ mensaje: 2, cita: "Sí, abrimos", categoria: "frase" })] }), n)!;
  assertEquals(l.hallazgos.length, 1, "la mejora queda, sin la cita del equipo");
  assertEquals([l.hallazgos[0].tipo, l.hallazgos[0].cita], ["mejora", null]);
  assert(l.descartados[0].includes("del equipo"));
});

Deno.test("la cita se reconoce aunque el modelo saque la negrita, las tildes o las comillas, o copie la línea entera", () => {
  const n = numerados();
  for (const cita of [
    "El alquiler del ambo es a partir de $150.000.", // sin los asteriscos
    "el alquiler del ambo es *A PARTIR DE $150.000*", // mayúsculas
    "«Hola, Colo. El alquiler»", // comillas
    "[2] 11:34 Lucía: Hola, Colo. El alquiler del ambo", // la línea entera
    "Hola, Colo… a partir de $150.000", // saltea con puntos suspensivos
  ]) {
    const u = ubicarCita(cita, 2, n);
    assert(u?.exacta, `no reconoció: ${cita}`);
    assertEquals(u!.mensaje.numero, 2);
  }
  // Un mensaje de varios renglones se le muestra al modelo en una línea, con « / »: puede citarlo sin eso.
  const conRenglones = armarCharla(charla("c3", [lucia("Te paso los pasos:\n\n1️⃣ Venís al local\n2️⃣ Te probás el traje", "12:00")]), FECHA, TZ).numerados;
  assertEquals(conRenglones[0].texto, "Te paso los pasos: / 1️⃣ Venís al local / 2️⃣ Te probás el traje");
  assert(citaEnMensaje(conRenglones[0].texto, "Venís al local 2️⃣ Te probás el traje"));
  // Tramos en desorden o inventados no pasan.
  assertEquals(citaEnMensaje(n[1].texto, "a partir de $150.000 ... Hola, Colo"), false);
  assertEquals(citaEnMensaje(n[2].texto, "Incluye saco, pantalón y camisa"), false);
});

Deno.test("una cita muy corta no prueba nada, salvo que sea el mensaje entero", () => {
  const n = numerados();
  assertEquals(citaEnMensaje(n[1].texto, "Hol"), false);
  assertEquals(citaEnMensaje(n[3].texto, "20/11"), true);
  assertEquals(normalizarParaCita("  ¿Querés   *ESTO*?  "), "queres esto?");
});

Deno.test("como mucho 5 errores y 3 mejoras por charla: quedan los más graves", () => {
  const graves = ["baja", "media", "alta", "baja", "media", "alta", "baja"];
  const l = leerAnalisis(
    respuestaJson({
      errores: graves.map((g, i) => error({ gravedad: g, mensaje: (i % 5) + 1, cita: null, categoria: ["tono", "regla", "dato_falso", "no_contesto", "promesa_no_cumplida", "derivo_sin_necesidad", "no_ofrecio_turno"][i] })),
      mejoras: [1, 2, 3, 4].map((m) => mejora({ mensaje: m, cita: null, categoria: "frase" })),
    }),
    numerados(),
  )!;
  const errores = l.hallazgos.filter((h) => h.tipo === "error");
  assertEquals(errores.map((e) => e.gravedad), ["alta", "alta", "media", "media", "baja"]);
  assertEquals(l.hallazgos.filter((h) => h.tipo === "mejora").length, 3);
  assertEquals(l.descartados.length, 3);
});

Deno.test("el mismo error dos veces en el mismo mensaje se anota una vez; gravedad o tema raros se corrigen", () => {
  const l = leerAnalisis(
    respuestaJson({
      errores: [error({ gravedad: "gravísima" }), error({ cita: "Hola, Colo" })],
      mejoras: [mejora({ tema: "chalecos" })],
    }),
    numerados(),
  )!;
  assertEquals(l.hallazgos.length, 2);
  assertEquals(l.hallazgos[0].gravedad, "media");
  assertEquals(l.hallazgos[1].tema, null);
  assert(l.descartados[0].includes("repetido"));
});

Deno.test("textos larguísimos del modelo se cortan antes de guardarlos", () => {
  const l = leerAnalisis(respuestaJson({ errores: [error({ que_estuvo_mal: "x".repeat(5000), que_conviene: "y".repeat(5000) })] }), numerados())!;
  assert(l.hallazgos[0].quePaso.length <= 900);
  assert(l.hallazgos[0].queConviene!.length <= 900);
});
