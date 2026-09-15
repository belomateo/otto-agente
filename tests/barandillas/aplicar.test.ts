// Controles 2, 3 y 4 del hito 1.5: se aplican en orden formato → contenido → reglas, cada una
// devuelve su acción y su motivo, dos saltos en el mismo turno derivan, y las de formato no
// llaman a ningún LLM.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { aplicarBarandillas, BARANDILLAS } from "../../supabase/functions/_shared/barandillas/index.ts";
import { AHORA, entrada, HORA_MS, revisorDoble } from "./_ayuda.ts";

Deno.test("son 12 y van en orden formato → contenido → reglas", () => {
  assertEquals(BARANDILLAS.length, 12);
  const orden = { formato: 0, contenido: 1, reglas: 2 } as const;
  const etapas = BARANDILLAS.map((b) => orden[b.etapa]);
  assertEquals(etapas, [...etapas].sort((a, b) => a - b));
});

Deno.test("un mensaje que cumple todo sale tal cual", async () => {
  const texto = "¡Hola, Juan! Para graduaciones tenemos varios modelos. ¿Qué fecha es la graduación?";
  const r = await aplicarBarandillas(entrada(texto));
  assertEquals(r.decision, "enviar");
  assertEquals(r.saltos, []);
  assertEquals(r.texto, texto);
});

Deno.test("las que arreglan en código no piden rehacer: limpian, cortan y el mensaje sale", async () => {
  const r = await aplicarBarandillas(entrada("**¡Hola!** Te espero el jueves. Quedo atenta."));
  assertEquals(r.decision, "enviar");
  assertEquals(r.texto, "¡Hola! Te espero el jueves.");
  assertEquals(r.saltos.map((s) => [s.barandilla, s.accion]), [["sin_markdown", "limpiar"], ["sin_relleno", "cortar"]]);
});

Deno.test("una que pide rehacer vuelve al modelo con qué corregir", async () => {
  const r = await aplicarBarandillas(entrada("¿Cómo estás? ¿Para qué evento es?"));
  assertEquals(r.decision, "rehacer");
  assertMatch(r.instruccion ?? "", /una sola/);
});

Deno.test("dos saltos en el mismo turno: ya se rehizo una vez y vuelve a saltar, entonces deriva", async () => {
  const r = await aplicarBarandillas(entrada("¿Cómo estás? ¿Para qué evento es?"), { saltosPrevios: 1 });
  assertEquals(r.decision, "derivar");
  assertEquals(r.motivoDerivacion, "barandilla_doble");
});

Deno.test("en el primer intento, dos barandillas que piden rehacer se rehacen una sola vez con los dos motivos", async () => {
  const r = await aplicarBarandillas(entrada("Sale $150.000. ¿Te sirve? ¿Venís esta semana?"));
  assertEquals(r.decision, "rehacer");
  assertEquals(r.saltos.map((s) => s.barandilla).sort(), ["precio_sin_herramienta", "una_pregunta"]);
  assertMatch(r.instruccion ?? "", /consultar_catalogo/);
});

Deno.test("fuera de la ventana de Meta, bloquear le gana a todo", async () => {
  const r = await aplicarBarandillas(
    entrada("¿Cómo estás? ¿Seguís interesado?", { ultimoMensajeClienteAt: new Date(AHORA.getTime() - 25 * HORA_MS) }),
  );
  assertEquals(r.decision, "bloquear");
});

Deno.test("anunciar un pase sin derivar termina en derivar, y sin la pregunta", async () => {
  const r = await aplicarBarandillas(entrada("Te paso con alguien del equipo. ¿Te parece bien?"));
  assertEquals(r.decision, "derivar");
  assertEquals(r.ejecutarDerivacion, true);
  assertEquals(r.texto, "Te paso con alguien del equipo.");
});

Deno.test("cada salto deja barandilla, acción y motivo para la bitácora", async () => {
  const r = await aplicarBarandillas(entrada("**Soy una IA.** ¿a? ¿b?"));
  assert(r.saltos.length >= 3);
  for (const s of r.saltos) {
    assert(BARANDILLAS.some((b) => b.nombre === s.barandilla));
    assert(s.motivo.trim().length > 10);
  }
});

Deno.test("las de formato no llaman a ningún LLM: son funciones sincrónicas de código", () => {
  for (const b of BARANDILLAS.filter((x) => x.etapa === "formato")) {
    const r = b.evaluar(entrada("**hola** ¿a? ¿b? Quedo atenta."));
    assert(!(r instanceof Promise), `${b.nombre} es asincrónica: una de formato no puede esperar a un LLM`);
  }
});

Deno.test("en todo el recorrido, el revisor solo se llama para una negativa dudosa", async () => {
  const revisor = revisorDoble({ ok: true, motivo: "" });
  for (const texto of ["**hola**", "Quedo atenta.", "¿a? ¿b?", "x ".repeat(400), "Sale $150.000", "A las 16:15", "Soy una IA"]) {
    await aplicarBarandillas(entrada(texto, { revisor }));
  }
  assertEquals(revisor.llamadas, 0);
  await aplicarBarandillas(
    entrada("No hacemos envíos a otras ciudades, pero te lo dejamos listo en el local para que lo retires el día antes.", { revisor }),
  );
  assertEquals(revisor.llamadas, 1);
});
