// Control 3 del hito 1.4: cada enum es idéntico en el schema de las herramientas, en la base y
// en el documento o el prompt que lo define. Si alguien agrega un tema, un motivo o un tipo en
// un solo lugar, esto falla y dice dónde.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import {
  DIA_O_NOCHE,
  EVENTOS,
  MOTIVOS_DERIVACION,
  MOTIVOS_DERIVACION_LLM,
  MOTIVOS_SOLO_CODIGO,
  ROLES_CLIENTE,
  SECCIONES,
  TIPOS_LINK,
  TIPOS_TURNO,
} from "../../supabase/functions/_shared/enums.ts";
import { enlacesDeTipo } from "../../supabase/functions/_shared/herramientas/enlaces.ts";
import { buscarHerramienta, HERRAMIENTAS } from "../../supabase/functions/_shared/herramientas/index.ts";
import { conBase } from "./_arnes.ts";

// @deno-types="npm:@types/pg@8.11.10"
import type pg from "npm:pg@8.13.1";

const leer = (ruta: string) => Deno.readTextFileSync(new URL(ruta, import.meta.url)).replace(/\r\n?/g, "\n");
const AGENTE = leer("../../AGENTE.md");
const PROCESOS = leer("../../PROCESOS.md");
const PROMPT = leer("../../supabase/functions/_shared/prompt.md");

function seccionMd(md: string, numero: number): string {
  const m = md.match(new RegExp(`^## ${numero}\\. .*$`, "m"));
  if (!m || m.index === undefined) return "";
  const resto = md.slice(m.index + m[0].length);
  const fin = resto.search(/^## \d+\. /m);
  return fin === -1 ? resto : resto.slice(0, fin);
}

function enumDelSchema(herramienta: string, parametro: string): string[] {
  const p = buscarHerramienta(herramienta)?.parametros as { properties: Record<string, { enum?: unknown[] }> };
  return (p.properties[parametro].enum ?? []).filter((x) => x !== null).map(String);
}

async function enumDeLaBase(sql: pg.Client, restriccion: string): Promise<string[]> {
  const r = await sql.query("select pg_get_constraintdef(oid) as d from pg_constraint where conname = $1", [restriccion]);
  assert(r.rows.length === 1, `no existe la restricción ${restriccion} en la base`);
  return [...String(r.rows[0].d).matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
}

const ordenado = (xs: readonly string[]) => [...xs].sort();

Deno.test({
  name: "secciones: schema de buscar_informacion = base = índice del prompt = AGENTE.md § 8",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const schema = enumDelSchema("buscar_informacion", "seccion");
      const base = await enumDeLaBase(sql, "fragmentos_tema_check");
      const lineas = PROMPT.split("\n");
      const i = lineas.findIndex((l) => l.includes("TODAS las secciones que hay"));
      const indice: string[] = [];
      for (let j = i + 1; i >= 0 && j < lineas.length && lineas[j].trim() !== ""; j++) {
        const m = lineas[j].match(/^\s+([a-z-]+) — /);
        if (m) indice.push(m[1]);
      }
      const doc = [...seccionMd(AGENTE, 8).matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
      assertEquals(schema, [...SECCIONES]);
      assertEquals(ordenado(base), ordenado(schema), "fragmentos_tema_check");
      assertEquals(indice, schema, "índice del prompt");
      assertEquals(doc, schema, "AGENTE.md § 8");
    }),
});

Deno.test({
  name: "motivos de derivación: base = PROCESOS.md § 4 (el enum completo); schema de derivar_a_persona = ese enum SIN los que decide solo el código",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const schema = enumDelSchema("derivar_a_persona", "motivo");
      const base = await enumDeLaBase(sql, "derivaciones_motivo_check");
      const desde = PROCESOS.indexOf("Motivos (enum):");
      assert(desde >= 0, "PROCESOS.md ya no lista los motivos");
      const tramo = PROCESOS.slice(desde, PROCESOS.indexOf(".\n", desde));
      const doc = [...tramo.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
      assertEquals(doc, [...MOTIVOS_DERIVACION], "PROCESOS.md § 4 (el enum completo, no solo lo que ve el LLM)");
      assertEquals(ordenado(base), ordenado(doc), "derivaciones_motivo_check (el enum completo)");
      // Hallazgo C2 del tester (15/9): evento_inminente/barandilla_doble/sin_respuesta/timeout
      // los decide el código, nunca el LLM (AGENTE.md § 2 y § 10) — no pueden estar en lo que
      // el modelo puede elegir al llamar a la herramienta.
      assertEquals(schema, [...MOTIVOS_DERIVACION_LLM], "schema de derivar_a_persona");
      for (const m of MOTIVOS_SOLO_CODIGO) assert(!schema.includes(m), `${m} es solo de código: no puede estar en el schema del LLM`);
    }),
});

Deno.test({
  name: "tipos de turno: agendar_turno = buscar_horarios = base = duraciones_turno",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const agendar = enumDelSchema("agendar_turno", "tipo");
      const buscar = enumDelSchema("buscar_horarios", "tipo_turno");
      const base = await enumDeLaBase(sql, "turnos_tipo_check");
      const duraciones = (await sql.query("select tipo from duraciones_turno")).rows.map((r) => String(r.tipo));
      assertEquals(agendar, [...TIPOS_TURNO]);
      assertEquals(buscar, agendar);
      assertEquals(ordenado(base), ordenado(agendar), "turnos_tipo_check");
      assertEquals(ordenado(duraciones), ordenado(agendar), "cada tipo tiene su duración cargada");
    }),
});

Deno.test({
  name: "tipos de link: schema de enviar_link = AGENTE.md § 4, y ninguno pega con dos enlaces",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const schema = enumDelSchema("enviar_link", "tipo");
      const m = seccionMd(AGENTE, 4).match(/tipo ∈ \{([^}]+)\}/);
      assert(m, "AGENTE.md § 4 ya no dice los tipos de link");
      assertEquals(schema, [...TIPOS_LINK]);
      assertEquals(m[1].split(",").map((s) => s.trim()), schema, "AGENTE.md § 4");
      // enlaces no tiene columna de tipo: se reconoce por el nombre. Un tipo que pega con dos
      // enlaces es ambiguo (falla); uno que no pega con ninguno es un dato que falta cargar.
      const enlaces = (await sql.query("select nombre, url from enlaces where activo")).rows.map((r) => ({
        nombre: String(r.nombre),
        url: String(r.url),
      }));
      const faltan: string[] = [];
      for (const tipo of TIPOS_LINK) {
        const n = enlacesDeTipo(enlaces, tipo).length;
        assert(n <= 1, `el tipo ${tipo} pega con ${n} enlaces activos: renombrá uno`);
        if (n === 0) faltan.push(tipo);
      }
      if (faltan.length) console.warn(`   ⚠ falta cargar el link de: ${faltan.join(", ")} (dato del negocio, no bloquea)`);
    }),
});

Deno.test({
  name: "ficha: evento, rol y día o noche de guardar_datos_cliente = checks de clientes",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      for (const [parametro, lista, restriccion] of [
        ["evento", EVENTOS, "clientes_evento_check"],
        ["rol", ROLES_CLIENTE, "clientes_rol_check"],
        ["dia_o_noche", DIA_O_NOCHE, "clientes_dia_o_noche_check"],
      ] as const) {
        const schema = enumDelSchema("guardar_datos_cliente", parametro);
        assertEquals(schema, [...lista]);
        assertEquals(ordenado(await enumDeLaBase(sql, restriccion)), ordenado(schema), restriccion);
      }
      assertEquals(enumDelSchema("agendar_turno", "evento"), [...EVENTOS]);
    }),
});

Deno.test({
  name: "herramientas: las 13 de AGENTE.md § 4 = las del código = herramientas_agente, con el mismo tipo",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      const doc = [...seccionMd(AGENTE, 4).matchAll(/^\| `([a-z_]+)\(/gm)].map((m) => m[1]);
      const codigo = HERRAMIENTAS.map((h) => h.nombre);
      const base = (await sql.query("select nombre, tipo from herramientas_agente order by orden")).rows;
      assertEquals(codigo.length, 13);
      assertEquals(ordenado(doc), ordenado(codigo), "AGENTE.md § 4");
      assertEquals(ordenado(base.map((r) => String(r.nombre))), ordenado(codigo), "herramientas_agente");
      for (const r of base) assertEquals(buscarHerramienta(String(r.nombre))?.tipo, r.tipo, `tipo de ${r.nombre}`);
    }),
});
