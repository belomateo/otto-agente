// Solo configuración y conocimiento del negocio: excluye clientes, conversaciones y secretos.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: new URL("../.env", import.meta.url) });
const { Client } = require("pg");
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
try {
  const consultas = {
    fragmentos: "select id, tema, titulo, texto, activo from fragmentos order by tema, titulo",
    catalogo: "select modelo, descripcion, colores, talles, precio_base, cardinality(fotos) as cantidad_fotos, activo from catalogo_alquiler order by orden, modelo",
    accesorios: "select * from accesorios_alquiler",
    reglas: "select numero, texto, activo from reglas_agente order by numero",
    contexto: "select clave, valor from contexto_agente order by clave",
    herramientas: "select nombre, activa, descripcion from herramientas_agente order by nombre",
    horarios: "select dia_semana, hora_apertura, hora_cierre, corte_desde, corte_hasta, activo from horarios order by dia_semana",
    franjas: "select dia_semana, desde, hasta, probadores from franjas_turnos order by dia_semana, desde",
    duraciones: "select tipo, duracion_min from duraciones_turno order by tipo",
    configuracion_agenda: "select * from configuracion_agenda",
    enlaces: "select nombre, url, activo from enlaces order by nombre",
    prompt: "select texto from prompt_base where unica = true",
  };
  const datos = { leido_en: new Date().toISOString() };
  await db.query("begin read only");
  for (const [clave, sql] of Object.entries(consultas)) datos[clave] = (await db.query(sql)).rows;
  await db.query("commit");
  for (const filas of Object.values(datos)) if (Array.isArray(filas)) for (const fila of filas) { delete fila.editado_por; delete fila.creado_por; }
  writeFileSync(new URL("../docs/informes/inventario-lucia-base.json", import.meta.url), JSON.stringify(datos, null, 2) + "\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(datos).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]))));
} finally { await db.end(); }
