// De dónde saca Lucía sus instrucciones desde el corrector (worker/prompt.ts, 10/10): primero la versión
// activa de instrucciones_lucia si pasa los controles, después el prompt.md publicado y, si tampoco
// está, prompt_vigente() de la base. Puro: la base es un doble y el archivo, una función.
//   env -u OPENAI_API_KEY deno test tests/corrector --allow-all --no-lock --node-modules-dir=none

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import type { Db } from "../../supabase/functions/_shared/db.ts";
import { huellaDe } from "../../supabase/functions/_shared/instrucciones.ts";
import {
  leerVersionActiva,
  olvidarPrompt,
  promptDeLucia,
  type VersionActiva,
  VIGENCIA_MS,
} from "../../supabase/functions/worker/prompt.ts";

const ARCHIVO = Deno.readTextFileSync(new URL("../../supabase/functions/_shared/prompt.md", import.meta.url)).replace(/\r\n?/g, "\n");
// Una versión del corrector que pasa los controles: el archivo con una regla más.
const CORREGIDO = ARCHIVO.replace("Un audio llega transcripto", "Si preguntan por estacionamiento, buscalo en ubicacion-horarios.\nUn audio llega transcripto");
const DE_LA_BASE = "Sos Lucía, y atendés lo que alguien escribió en el panel.\n";

const EN = (seg: number) => new Date(Date.UTC(2026, 9, 10, 12, 0, seg));
const conArchivo = () => Promise.resolve(ARCHIVO);
const sinArchivo = () => Promise.reject(new Error("no existe"));

// La base: prompt_vigente() devuelve DE_LA_BASE y cuenta los pedidos.
function baseDoble(): { db: Db; pedidos: () => number } {
  let pedidos = 0;
  const db: Db = {
    consulta: (<T>(sql: string) => {
      if (sql.includes("prompt_vigente")) {
        pedidos++;
        return Promise.resolve([{ p: DE_LA_BASE }] as T[]);
      }
      throw new Error(`consulta inesperada: ${sql}`);
    }) as Db["consulta"],
  };
  return { db, pedidos: () => pedidos };
}

// La versión activa que «está en la base», contando cuántas veces se pidió.
function activa(v: VersionActiva | null | Error) {
  const estado = { lecturas: 0 };
  const leer = () => {
    estado.lecturas++;
    return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
  };
  return { leer, estado };
}

Deno.test("con una versión activa válida, Lucía usa esa: «corrector vN» en la bitácora, y ni el archivo ni la base mandan", async () => {
  olvidarPrompt();
  const b = baseDoble();
  const a = activa({ version: 3, texto: CORREGIDO, hashArchivo: await huellaDe(ARCHIVO) });
  const r = await promptDeLucia(b.db, EN(0), conArchivo, a.leer);
  assertEquals([r.origen, r.etiqueta, r.version, r.texto], ["corrector", "corrector v3", 3, CORREGIDO]);
  assertEquals(r.archivoCambio, undefined);
  assertEquals(b.pedidos(), 0);
});

Deno.test("sin versión activa, todo como antes: el archivo", async () => {
  olvidarPrompt();
  const b = baseDoble();
  const r = await promptDeLucia(b.db, EN(0), conArchivo, activa(null).leer);
  assertEquals([r.origen, r.etiqueta, r.texto], ["archivo", "archivo", ARCHIVO]);
  assertEquals(b.pedidos(), 0);
});

Deno.test("sin versión activa y sin archivo: la copia de la base (prompt_vigente)", async () => {
  olvidarPrompt();
  const b = baseDoble();
  const r = await promptDeLucia(b.db, EN(0), sinArchivo, activa(null).leer);
  assertEquals([r.origen, r.etiqueta, r.texto], ["base", "base", DE_LA_BASE]);
});

Deno.test("una versión activa que no pasa los controles no se usa (47 caracteres, o sin el mapa): va el archivo", async () => {
  for (const texto of ["Sos Lucía, del equipo de Mr Otto. Hola, ¿cómo va?", CORREGIDO.replace("MAPA DE LA BASE DE CONOCIMIENTO", "MAPA")]) {
    olvidarPrompt();
    const r = await promptDeLucia(baseDoble().db, EN(0), conArchivo, activa({ version: 7, texto, hashArchivo: null }).leer);
    assertEquals([r.origen, r.texto], ["archivo", ARCHIVO]);
  }
});

Deno.test("la versión activa se pregunta una vez por minuto (también cuando no hay ninguna)", async () => {
  olvidarPrompt();
  const a = activa({ version: 3, texto: CORREGIDO, hashArchivo: null });
  const b = baseDoble();
  await promptDeLucia(b.db, EN(0), conArchivo, a.leer);
  await promptDeLucia(b.db, EN(30), conArchivo, a.leer);
  assertEquals(a.estado.lecturas, 1);
  await promptDeLucia(b.db, new Date(EN(0).getTime() + VIGENCIA_MS + 1), conArchivo, a.leer);
  assertEquals(a.estado.lecturas, 2);

  olvidarPrompt();
  const ninguna = activa(null);
  await promptDeLucia(b.db, EN(0), conArchivo, ninguna.leer);
  await promptDeLucia(b.db, EN(59), conArchivo, ninguna.leer);
  assertEquals(ninguna.estado.lecturas, 1);
});

Deno.test("si leer la versión activa falla, ese turno va con el archivo y el próximo vuelve a preguntar", async () => {
  olvidarPrompt();
  const caida = activa(new Error("se cortó la conexión"));
  const b = baseDoble();
  const r = await promptDeLucia(b.db, EN(0), conArchivo, caida.leer);
  assertEquals(r.origen, "archivo");
  await promptDeLucia(b.db, EN(1), conArchivo, caida.leer);
  assertEquals(caida.estado.lecturas, 2);
});

Deno.test("si la versión activa se armó sobre otro prompt.md, se usa igual pero queda avisado (archivoCambio)", async () => {
  olvidarPrompt();
  const r = await promptDeLucia(baseDoble().db, EN(0), conArchivo, activa({ version: 4, texto: CORREGIDO, hashArchivo: "huella-de-otro-archivo" }).leer);
  assertEquals([r.etiqueta, r.archivoCambio], ["corrector v4", true]);
});

Deno.test("sin nada de nada, falla (la cola reintenta) en vez de contestar sin instrucciones", async () => {
  olvidarPrompt();
  const vacia: Db = { consulta: (() => Promise.resolve([{ p: null }])) as Db["consulta"] };
  await assertRejects(() => promptDeLucia(vacia, EN(0), sinArchivo, activa(null).leer));
});

Deno.test("leerVersionActiva: sin la migración 0104 no consulta la tabla (to_regclass), con ella trae la activa", async () => {
  const consultas: string[] = [];
  const sinTabla: Db = {
    consulta: (<T>(sql: string) => {
      consultas.push(sql);
      return Promise.resolve([{ existe: false }] as T[]);
    }) as Db["consulta"],
  };
  assertEquals(await leerVersionActiva(sinTabla), null);
  assertEquals(consultas.length, 1);
  assert(consultas[0].includes("to_regclass"));

  const conTabla: Db = {
    consulta: (<T>(sql: string) =>
      Promise.resolve((sql.includes("to_regclass") ? [{ existe: true }] : [{ version: 5, texto: CORREGIDO, hash_archivo: "h" }]) as T[])) as Db["consulta"],
  };
  assertEquals(await leerVersionActiva(conTabla), { version: 5, texto: CORREGIDO, hashArchivo: "h" });
});
