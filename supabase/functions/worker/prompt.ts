// De dónde saca Lucía su prompt.
//
// Desde el 10/10 (corrector de Lucía, decisión de Mateo: «las instrucciones se guardan en la base
// para que el corrector las pueda editar»), en este orden:
//  1. La versión ACTIVA de instrucciones_lucia (0104), la que dejó el corrector de la Bitácora. Solo
//     llega a activa una versión que pasó su prueba al 100%, y además acá se le pasan los controles de
//     cordura (_shared/instrucciones.ts): si no los pasa, no se usa. Caché de un minuto, como el
//     respaldo de la base: aplicar o volver atrás en el corrector le llega a Lucía en menos de un
//     minuto, sin pedirle 17 kB a la base en cada turno.
//  2. El prompt.md que viaja adentro de la función (lo que se revisó y se publicó).
//  3. La copia armada en la base (prompt_vigente(), 0050), solo si el archivo no se puede leer.
// Sin ninguna versión activa (o sin la migración 0104), todo queda exactamente como el 9/10.
//
// El 9/10 Mateo había pedido el archivo primero: «al ir a la base no funciona bien, ya me pasó
// varias veces». Dos casos reales: el 16/9 un arnés de pruebas dejó la plantilla de la base en 47
// caracteres (0051), y el 7/10 entró a mano en reglas_agente una regla 16 que no pasó por el repo y
// le hacía contestar «de nada» a quien no había agradecido. Por eso la base de ahora no es la de
// antes: la del 7/10 la podía cambiar cualquiera sin probar nada (0104 no deja escribir desde el panel
// y el corrector no activa nada sin su prueba), y la del 16/9 no pasaría los controles de abajo.
//
// Lo que se edita en Configuración como prompt base, reglas, tono o presentación sigue sin llegarle a
// Lucía: sus instrucciones se cambian con el corrector (Bitácora › Corrector). Lo demás que se carga en
// el panel (horarios, cierres, catálogo, fichas, los textos fijos de contexto_agente) llega al instante:
// eso lo leen las herramientas y el turno, no el prompt.
import type { Db } from "../_shared/db.ts";
import { controlarInstrucciones, huellaDe } from "../_shared/instrucciones.ts";

// La versión activa y el respaldo de la base se cachean un minuto.
export const VIGENCIA_MS = 60_000;

export type OrigenDelPrompt = "corrector" | "archivo" | "base";
export type PromptEnUso = {
  texto: string;
  origen: OrigenDelPrompt;
  // Lo que queda en la bitácora del turno (evento worker-lucia, campo prompt): «corrector v3»,
  // «archivo» o «base».
  etiqueta: string;
  // La versión del corrector, si salió de ahí.
  version?: number;
  // La versión activa se armó sobre otro prompt.md que el que viaja hoy con la función: lo que un
  // programador cambió en el archivo después no le llega a Lucía mientras esa versión siga activa.
  archivoCambio?: boolean;
};

export type VersionActiva = { version: number; texto: string; hashArchivo: string | null };

let delArchivo: string | null = null;
let huellaDelArchivo: string | null = null;
let deLaBase: { texto: string; hasta: number } | null = null;
let activa: { valor: VersionActiva | null; hasta: number } | null = null;

// Para las pruebas: hace que el próximo pedido vuelva a leer todo.
export function olvidarPrompt() {
  delArchivo = null;
  huellaDelArchivo = null;
  deLaBase = null;
  activa = null;
}

async function leerArchivoDeLaFuncion(): Promise<string> {
  return await Deno.readTextFile(new URL("../_shared/prompt.md", import.meta.url));
}

// La versión activa del corrector, o null si no hay. Sin la migración 0104 la tabla no existe:
// to_regclass lo pregunta sin fallar (una consulta a una tabla que no existe, adentro de una
// transacción, la rompería entera; así corren las pruebas del worker).
export async function leerVersionActiva(db: Db): Promise<VersionActiva | null> {
  const [hay] = await db.consulta<{ existe: boolean }>("select to_regclass('public.instrucciones_lucia') is not null as existe");
  if (hay?.existe !== true) return null;
  const [f] = await db.consulta<{ version: number; texto: string; hash_archivo: string | null }>(
    "select version, texto, hash_archivo from instrucciones_lucia where estado = 'activa' limit 1",
  );
  return f ? { version: Number(f.version), texto: String(f.texto), hashArchivo: f.hash_archivo ?? null } : null;
}

async function versionActiva(db: Db, ahora: Date, leerActiva: (db: Db) => Promise<VersionActiva | null>): Promise<VersionActiva | null> {
  if (activa && ahora.getTime() < activa.hasta) return activa.valor;
  let valor: VersionActiva | null;
  try {
    valor = await leerActiva(db);
  } catch (e) {
    // No se cachea: el próximo turno vuelve a preguntar. Mientras tanto, el archivo.
    console.error("worker: no se pudo leer la versión activa del corrector, se usa el archivo", String((e as Error)?.message ?? e));
    return null;
  }
  if (valor) {
    const problemas = controlarInstrucciones(valor.texto);
    if (problemas.length) {
      console.error(`worker: la versión ${valor.version} del corrector no pasa los controles y no se usa (${problemas.join("; ")})`);
      valor = null;
    }
  }
  activa = { valor, hasta: ahora.getTime() + VIGENCIA_MS };
  return valor;
}

async function textoDelArchivo(leerArchivo: () => Promise<string>): Promise<string | null> {
  if (delArchivo !== null) return delArchivo;
  try {
    const texto = await leerArchivo();
    if (texto.trim() !== "") delArchivo = texto;
  } catch (e) {
    console.error("worker: no se pudo leer prompt.md", String((e as Error)?.message ?? e));
  }
  return delArchivo;
}

// `leerArchivo` y `leerActiva` solo los cambian las pruebas (para simular que el archivo no está, o
// qué versión activa hay en la base).
export async function promptDeLucia(
  db: Db,
  ahora: Date,
  leerArchivo: () => Promise<string> = leerArchivoDeLaFuncion,
  leerActiva: (db: Db) => Promise<VersionActiva | null> = leerVersionActiva,
): Promise<PromptEnUso> {
  const v = await versionActiva(db, ahora, leerActiva);
  if (v) {
    const archivo = await textoDelArchivo(leerArchivo);
    if (archivo !== null && huellaDelArchivo === null) huellaDelArchivo = await huellaDe(archivo);
    const archivoCambio = archivo !== null && v.hashArchivo !== null && v.hashArchivo !== huellaDelArchivo;
    return { texto: v.texto, origen: "corrector", etiqueta: `corrector v${v.version}`, version: v.version, ...(archivoCambio ? { archivoCambio } : {}) };
  }

  const archivo = await textoDelArchivo(leerArchivo);
  if (archivo !== null) return { texto: archivo, origen: "archivo", etiqueta: "archivo" };

  if (deLaBase && ahora.getTime() < deLaBase.hasta) return { texto: deLaBase.texto, origen: "base", etiqueta: "base" };
  let texto: string | null = null;
  try {
    const [f] = await db.consulta<{ p: string | null }>("select prompt_vigente() as p");
    texto = f?.p ?? null;
  } catch (e) {
    console.error("worker: tampoco se pudo leer el prompt de la base", String((e as Error)?.message ?? e));
  }
  // Sin archivo y sin base no hay con qué contestar: el trabajo falla y la cola lo reintenta.
  if (!texto) throw new Error("no hay prompt: ni versión activa, ni prompt.md, ni prompt_vigente()");
  deLaBase = { texto, hasta: ahora.getTime() + VIGENCIA_MS };
  return { texto, origen: "base", etiqueta: "base" };
}
