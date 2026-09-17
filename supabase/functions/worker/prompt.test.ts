// El prompt de Lucía sale de la base y, si la base no puede darlo, del archivo que viene en la
// función. Acá se prueba esa elección y la caché; que lo que devuelve la base sea el prompt
// correcto lo prueba tests/sql/prompt-vigente.mjs contra la base de verdad.
import { assertEquals } from "jsr:@std/assert@1";
import type { Db } from "../_shared/db.ts";
import { olvidarPrompt, promptDeLucia, VIGENCIA_MS } from "./prompt.ts";

const DE_LA_BASE = "Sos Lucía, y atendés lo que la dueña acaba de escribir.\n";

function baseDoble(respuestas: (string | null | Error)[]): { db: Db; pedidos: number } {
  const estado = { pedidos: 0 };
  const db: Db = {
    // deno-lint-ignore no-explicit-any
    consulta: ((_sql: string) => {
      const r = respuestas[Math.min(estado.pedidos, respuestas.length - 1)];
      estado.pedidos++;
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve([{ p: r }]);
      // deno-lint-ignore no-explicit-any
    }) as any,
  };
  return { db, get pedidos() { return estado.pedidos; } } as { db: Db; pedidos: number };
}

const EN = (seg: number) => new Date(Date.UTC(2026, 8, 16, 12, 0, seg));

Deno.test("usa lo que hay en la base", async () => {
  olvidarPrompt();
  const b = baseDoble([DE_LA_BASE]);
  const r = await promptDeLucia(b.db, EN(0));
  assertEquals([r.origen, r.texto], ["base", DE_LA_BASE]);
});

Deno.test("no le pregunta a la base en cada turno: la caché dura un minuto", async () => {
  olvidarPrompt();
  const b = baseDoble([DE_LA_BASE]);
  await promptDeLucia(b.db, EN(0));
  await promptDeLucia(b.db, EN(30));
  assertEquals(b.pedidos, 1);
});

Deno.test("pasado el minuto vuelve a preguntar, y un cambio de la dueña entra", async () => {
  olvidarPrompt();
  const cambiado = "Sos Lucía, y ahora hablás distinto.\n";
  const b = baseDoble([DE_LA_BASE, cambiado]);
  await promptDeLucia(b.db, EN(0));
  const r = await promptDeLucia(b.db, new Date(EN(0).getTime() + VIGENCIA_MS + 1));
  assertEquals([b.pedidos, r.texto], [2, cambiado]);
});

Deno.test("si la base no puede armar uno bueno, usa el prompt.md de la función", async () => {
  olvidarPrompt();
  const b = baseDoble([null]);
  const r = await promptDeLucia(b.db, EN(0));
  assertEquals(r.origen, "archivo");
  // Es el prompt de verdad, el que se publicó con la función.
  assertEquals(r.texto.startsWith("Sos Lucía,"), true);
  assertEquals(r.texto.length > 1000, true);
});

Deno.test("si la base se cae, tampoco se queda muda", async () => {
  olvidarPrompt();
  const b = baseDoble([new Error("se cortó la conexión")]);
  const r = await promptDeLucia(b.db, EN(0));
  assertEquals(r.origen, "archivo");
  assertEquals(r.texto.startsWith("Sos Lucía,"), true);
});

Deno.test("con la base caída no le pregunta en cada turno; al minuto reintenta y se recupera", async () => {
  olvidarPrompt();
  const b = baseDoble([new Error("caída"), DE_LA_BASE]);
  assertEquals((await promptDeLucia(b.db, EN(0))).origen, "archivo");
  assertEquals((await promptDeLucia(b.db, EN(30))).origen, "archivo");
  assertEquals(b.pedidos, 1);
  const r = await promptDeLucia(b.db, new Date(EN(0).getTime() + VIGENCIA_MS + 1));
  assertEquals([b.pedidos, r.origen], [2, "base"]);
});
