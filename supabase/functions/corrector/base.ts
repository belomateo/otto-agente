// La base del corrector de Lucía (0104): de dónde salen las instrucciones, fichas y herramientas,
// y dónde quedan las correcciones y sus pruebas. Mismo patrón que analista/base.ts: SQL directo
// contra la misma base que usa el worker, con la interfaz Db.

import type { Db } from "../_shared/db.ts";
import { huellaDe, normalizarInstrucciones } from "../_shared/instrucciones.ts";
import { promptDeLucia, type PromptEnUso } from "../worker/prompt.ts";

// --- Lectura de instrucciones, fichas y herramientas -------------------------------------------

export type InstruccionesActuales = PromptEnUso & { huella: string };

export async function instruccionesActuales(db: Db, ahora: Date): Promise<InstruccionesActuales> {
  const p = await promptDeLucia(db, ahora);
  return { ...p, huella: await huellaDe(p.texto) };
}

export type Ficha = { id: string; tema: string; titulo: string; texto: string; version: number };

export async function fichasActivas(db: Db): Promise<Ficha[]> {
  return db.consulta<Ficha>(
    `select id::text as id, tema, titulo, texto, version from fragmentos where activo order by tema, titulo`,
  );
}

export type Herramienta = { nombre: string; descripcion: string; version: number };

export async function herramientasActivas(db: Db): Promise<Herramienta[]> {
  return db.consulta<Herramienta>(
    `select nombre, descripcion, version from herramientas_agente where activo order by nombre`,
  );
}

// --- Escritura de correcciones -----------------------------------------------------------------

export type Correccion = {
  id: string;
  pedido: string;
  estado: string;
  analisis: Record<string, unknown>;
  base: Record<string, unknown>;
  opcion: string | null;
  destino: string | null;
  cambio: Record<string, unknown> | null;
  resultado: string | null;
  pruebasTotal: number;
  pruebasOk: number;
  costoUsd: number;
};

export async function crearCorreccion(
  db: Db,
  p: { pedido: string; analisis: Record<string, unknown>; base: Record<string, unknown>; modelo: string; costoUsd: number; quien: string; quienId: string | null },
): Promise<string> {
  const [f] = await db.consulta<{ id: string }>(
    `insert into correcciones_lucia (pedido, analisis, base, modelo, costo_usd, pedida_por, pedida_por_id)
     values ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7)
     returning id::text as id`,
    [p.pedido, JSON.stringify(p.analisis), JSON.stringify(p.base), p.modelo, p.costoUsd, p.quien, p.quienId],
  );
  return f.id;
}

export async function leerCorreccion(db: Db, id: string): Promise<Correccion | null> {
  const [f] = await db.consulta<{
    id: string; pedido: string; estado: string; analisis: unknown; base: unknown;
    opcion: string | null; destino: string | null; cambio: unknown; resultado: string | null;
    pruebas_total: number; pruebas_ok: number; costo_usd: string;
  }>(
    `select id::text as id, pedido, estado, analisis, base, opcion, destino, cambio, resultado,
            pruebas_total, pruebas_ok, costo_usd::text as costo_usd
       from correcciones_lucia where id = $1::uuid`,
    [id],
  );
  if (!f) return null;
  return {
    id: f.id, pedido: f.pedido, estado: f.estado,
    analisis: (f.analisis ?? {}) as Record<string, unknown>,
    base: (f.base ?? {}) as Record<string, unknown>,
    opcion: f.opcion, destino: f.destino,
    cambio: (f.cambio ?? null) as Record<string, unknown> | null,
    resultado: f.resultado,
    pruebasTotal: Number(f.pruebas_total), pruebasOk: Number(f.pruebas_ok),
    costoUsd: Number(f.costo_usd),
  };
}

export async function elegirOpcion(
  db: Db,
  correccionId: string,
  p: { opcion: string; destino: string; cambio: Record<string, unknown>; costoUsd: number },
): Promise<void> {
  await db.consulta(
    `update correcciones_lucia
        set estado = 'probando', opcion = $2, destino = $3, cambio = $4::jsonb,
            costo_usd = costo_usd + $5, actualizada_at = now()
      where id = $1::uuid and estado = 'analizada'`,
    [correccionId, p.opcion, p.destino, JSON.stringify(p.cambio), p.costoUsd],
  );
}

// --- Versiones de instrucciones ----------------------------------------------------------------

export async function crearVersionBorrador(
  db: Db,
  p: { correccionId: string; texto: string; pedido: string; resumen: string; baseOrigen: string; baseVersion: number | null; hashArchivo: string | null; creadoPor: string },
): Promise<number> {
  const [{ v }] = await db.consulta<{ v: number }>(
    `select coalesce(max(version), 0) + 1 as v from instrucciones_lucia`,
  );
  await db.consulta(
    `insert into instrucciones_lucia
       (version, texto, estado, pedido, resumen, base_origen, base_version, hash_archivo, correccion_id, creada_por)
     values ($1, $2, 'borrador', $3, $4, $5, $6, $7, $8, $9)`,
    [v, p.texto, p.pedido, p.resumen, p.baseOrigen, p.baseVersion, p.hashArchivo, p.correccionId, p.creadoPor],
  );
  return v;
}

// --- Pruebas -----------------------------------------------------------------------------------

export type PruebaPendiente = {
  id: string;
  orden: number;
  nombre: string;
  mensajes: unknown[];
  ficha: Record<string, unknown> | null;
  debe: unknown[];
  noDebe: unknown[];
};

export async function crearPruebas(
  db: Db,
  correccionId: string,
  pruebas: { nombre: string; mensajes: unknown[]; ficha?: Record<string, unknown>; debe: unknown[]; noDebe?: unknown[] }[],
): Promise<void> {
  for (let i = 0; i < pruebas.length; i++) {
    const p = pruebas[i];
    await db.consulta(
      `insert into correcciones_pruebas (correccion_id, orden, nombre, mensajes, ficha, debe, no_debe)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)`,
      [correccionId, i + 1, p.nombre, JSON.stringify(p.mensajes), p.ficha ? JSON.stringify(p.ficha) : null,
        JSON.stringify(p.debe), JSON.stringify(p.noDebe ?? [])],
    );
  }
}

export async function pruebasPendientes(db: Db, correccionId: string): Promise<PruebaPendiente[]> {
  return db.consulta<PruebaPendiente>(
    `select id::text as id, orden, nombre, mensajes, ficha, debe, no_debe as "noDebe"
       from correcciones_pruebas where correccion_id = $1::uuid and estado = 'pendiente' order by orden`,
    [correccionId],
  );
}

export async function tomarPrueba(db: Db, pruebaId: string): Promise<boolean> {
  const [f] = await db.consulta<{ ok: boolean }>(
    `update correcciones_pruebas
        set estado = 'corriendo', intentos = intentos + 1, tomada_at = now()
      where id = $1::uuid and estado = 'pendiente'
      returning true as ok`,
    [pruebaId],
  );
  return !!f?.ok;
}

export async function guardarResultadoPrueba(
  db: Db,
  pruebaId: string,
  p: { estado: "paso" | "fallo" | "error"; charla: unknown; veredicto: unknown; motivo: string | null; costoUsd: number },
): Promise<void> {
  await db.consulta(
    `update correcciones_pruebas
        set estado = $2, charla = $3::jsonb, veredicto = $4::jsonb, motivo = $5,
            costo_usd = costo_usd + $6, terminada_at = now()
      where id = $1::uuid`,
    [pruebaId, p.estado, JSON.stringify(p.charla), JSON.stringify(p.veredicto), p.motivo, p.costoUsd],
  );
}

export async function saltearPruebasRestantes(db: Db, correccionId: string, motivo: string): Promise<void> {
  await db.consulta(
    `update correcciones_pruebas
        set estado = 'salteada', motivo = $2, terminada_at = now()
      where correccion_id = $1::uuid and estado in ('pendiente', 'corriendo')`,
    [correccionId, motivo],
  );
}

export async function actualizarCorreccion(
  db: Db,
  id: string,
  p: { costoUsd: number; pruebasTotal: number; pruebasOk: number },
): Promise<void> {
  await db.consulta(
    `update correcciones_lucia
        set costo_usd = costo_usd + $2, pruebas_total = $3, pruebas_ok = $4, actualizada_at = now()
      where id = $1::uuid`,
    [id, p.costoUsd, p.pruebasTotal, p.pruebasOk],
  );
}

// Cierre final: corrector_aplicar y corrector_rechazar viven en SQL (0104) y las llama el código.
export async function aplicarCorreccion(db: Db, correccionId: string, quien: string, hashArchivo: string | null): Promise<Record<string, unknown>> {
  const [f] = await db.consulta<{ r: unknown }>(
    `select corrector_aplicar($1::uuid, $2, $3) as r`,
    [correccionId, quien, hashArchivo],
  );
  return (f?.r ?? {}) as Record<string, unknown>;
}

export async function rechazarCorreccion(db: Db, correccionId: string, motivo: string): Promise<void> {
  await db.consulta(`select corrector_rechazar($1::uuid, $2)`, [correccionId, motivo]);
}
