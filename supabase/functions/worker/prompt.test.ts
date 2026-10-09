// El prompt de Lucía sale del prompt.md que viene en la función y, solo si el archivo no se puede
// leer, de la base (pedido de Mateo, 9/10). Acá se prueba esa elección y la caché del respaldo; que
// lo que devuelve la base sea un prompt correcto lo prueba tests/sql/prompt-vigente.mjs.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { Db } from "../_shared/db.ts";
import { olvidarPrompt, promptDeLucia, VIGENCIA_MS } from "./prompt.ts";

const DE_LA_BASE = "Sos Lucía, y atendés lo que alguien escribió en el panel.\n";

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

const EN = (seg: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, seg));
const sinArchivo = () => Promise.reject(new Error("no existe"));

Deno.test("usa el prompt.md de la función aunque la base tenga otro, y ni le pregunta a la base", async () => {
  olvidarPrompt();
  const b = baseDoble([DE_LA_BASE]);
  const r = await promptDeLucia(b.db, EN(0));
  assertEquals(r.origen, "archivo");
  // Es el prompt de verdad, el que se publica con la función.
  assertEquals(r.texto.startsWith("Sos Lucía,"), true);
  assertEquals(r.texto.length > 1000, true);
  assertEquals(b.pedidos, 0);
});

Deno.test("el archivo se lee una sola vez", async () => {
  olvidarPrompt();
  let lecturas = 0;
  const leer = () => {
    lecturas++;
    return Promise.resolve("Sos Lucía, del archivo.\n");
  };
  const b = baseDoble([DE_LA_BASE]);
  await promptDeLucia(b.db, EN(0), leer);
  await promptDeLucia(b.db, EN(30), leer);
  assertEquals([lecturas, b.pedidos], [1, 0]);
});

Deno.test("sin archivo, usa la copia de la base", async () => {
  olvidarPrompt();
  const b = baseDoble([DE_LA_BASE]);
  const r = await promptDeLucia(b.db, EN(0), sinArchivo);
  assertEquals([r.origen, r.texto], ["base", DE_LA_BASE]);
});

Deno.test("un archivo vacío cuenta como que no está", async () => {
  olvidarPrompt();
  const b = baseDoble([DE_LA_BASE]);
  const r = await promptDeLucia(b.db, EN(0), () => Promise.resolve("  \n"));
  assertEquals(r.origen, "base");
});

Deno.test("el respaldo de la base se cachea un minuto", async () => {
  olvidarPrompt();
  const b = baseDoble([DE_LA_BASE, "Sos Lucía, cambiada.\n"]);
  await promptDeLucia(b.db, EN(0), sinArchivo);
  await promptDeLucia(b.db, EN(30), sinArchivo);
  assertEquals(b.pedidos, 1);
  const r = await promptDeLucia(b.db, new Date(EN(0).getTime() + VIGENCIA_MS + 1), sinArchivo);
  assertEquals([b.pedidos, r.texto], [2, "Sos Lucía, cambiada.\n"]);
});

Deno.test("sin archivo y sin base, falla (la cola reintenta) en vez de contestar sin instrucciones", async () => {
  olvidarPrompt();
  const caida = baseDoble([new Error("se cortó la conexión")]);
  await assertRejects(() => promptDeLucia(caida.db, EN(0), sinArchivo));
  olvidarPrompt();
  const vacia = baseDoble([null]);
  await assertRejects(() => promptDeLucia(vacia.db, EN(0), sinArchivo));
});
