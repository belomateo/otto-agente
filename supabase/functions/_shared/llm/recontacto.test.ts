// decidirRecontacto con un fetch falso: lo que se prueba acá es qué hace el código con cada
// respuesta del modelo (y sin respuesta), no el criterio del modelo — eso se probó con charlas
// reales el 14/10 (Walter y Nano no; los que solo dejaron de contestar o van a avisar, sí).

import { assertEquals } from "jsr:@std/assert@1";
import { charlaParaRecontacto, decidirRecontacto } from "./recontacto.ts";

function fetchQueDevuelve(contenido: string | null, status = 200): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(
        JSON.stringify(status === 200 ? { choices: [{ message: { content: contenido } }], usage: { prompt_tokens: 300, completion_tokens: 20 } } : { error: "x" }),
        { status },
      ),
    )) as typeof fetch;
}

function conModelo(fn: () => Promise<void>) {
  return async () => {
    Deno.env.set("LLM_EXTRACTOR", "gpt-5.4-mini");
    Deno.env.set("OPENAI_API_KEY", Deno.env.get("OPENAI_API_KEY") ?? "clave-de-prueba");
    await fn();
  };
}

Deno.test("charlaParaRecontacto: en orden, con quién lo dijo, y el audio con su transcripción", () => {
  const t = charlaParaRecontacto([
    { direccion: "saliente", contenido: "Ya cancelé el turno, Walter.\n\n¿Querés que busquemos otro día?" },
    { direccion: "entrante", contenido: "no por ahora" },
    { direccion: "entrante", contenido: "", transcripcion: "después te escribo" },
  ]);
  assertEquals(
    t,
    "Mr Otto: Ya cancelé el turno, Walter. ¿Querés que busquemos otro día?\nCliente: no por ahora\nCliente: [audio: después te escribo]",
  );
});

Deno.test("charlaParaRecontacto: solo los últimos mensajes", () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({ direccion: "entrante" as const, contenido: `m${i}` }));
  const t = charlaParaRecontacto(muchos, 3);
  assertEquals(t, "Cliente: m27\nCliente: m28\nCliente: m29");
});

Deno.test("decidirRecontacto: no_mandar=true → no se manda, con el motivo", conModelo(async () => {
  const d = await decidirRecontacto("Cliente: no por ahora", fetchQueDevuelve(JSON.stringify({ que_dijo: "no por ahora", no_mandar: true })));
  assertEquals(d?.mandar, false);
  assertEquals(d?.motivo, "no por ahora");
  assertEquals(d?.modelo, "gpt-5.4-mini");
}));

Deno.test("decidirRecontacto: no_mandar=false → se manda", conModelo(async () => {
  const d = await decidirRecontacto("Cliente: gracias", fetchQueDevuelve(JSON.stringify({ que_dijo: "nada", no_mandar: false })));
  assertEquals(d?.mandar, true);
}));

Deno.test("decidirRecontacto: si el modelo devuelve algo que no es la respuesta pedida → null (no se manda)", conModelo(async () => {
  assertEquals(await decidirRecontacto("x", fetchQueDevuelve("no es json")), null);
  assertEquals(await decidirRecontacto("x", fetchQueDevuelve(JSON.stringify({ que_dijo: "falta el sí/no" }))), null);
  assertEquals(await decidirRecontacto("x", fetchQueDevuelve(null)), null);
}));

Deno.test("decidirRecontacto: si la llamada falla dos veces → null (no se manda)", conModelo(async () => {
  assertEquals(await decidirRecontacto("x", fetchQueDevuelve(null, 500)), null);
}));

Deno.test("decidirRecontacto: sin modelo configurado → null (no se manda)", async () => {
  const antes = Deno.env.get("LLM_EXTRACTOR");
  Deno.env.delete("LLM_EXTRACTOR");
  try {
    assertEquals(await decidirRecontacto("x", fetchQueDevuelve(JSON.stringify({ que_dijo: "", no_mandar: false }))), null);
  } finally {
    if (antes !== undefined) Deno.env.set("LLM_EXTRACTOR", antes);
  }
});
