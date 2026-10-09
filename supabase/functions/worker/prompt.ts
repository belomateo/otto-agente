// De dónde saca Lucía su prompt.
//
// Pedido de Mateo (9/10): primero el prompt.md que viaja adentro de la función; la copia armada en
// la base (prompt_vigente(), 0050) queda solo de respaldo. Motivo, en sus palabras: «al ir a la base
// no funciona bien, ya me pasó varias veces». Dos casos reales: el 16/9 un arnés de pruebas dejó la
// plantilla de la base en 47 caracteres (0051), y el 7/10 entró a mano en reglas_agente una regla 16
// que no pasó por el repo y le hacía contestar «de nada» a quien no había agradecido. El archivo es
// lo que se revisó, se probó y se publicó: no cambia por un error de otro lado.
//
// Consecuencia, aceptada por Mateo: lo que se edite en el panel como prompt, reglas, tono o
// presentación ya NO le llega a Lucía; esos cambios van al archivo y se publican. Lo demás que se
// carga en el panel (horarios, cierres, catálogo, fragmentos de información, los textos fijos de
// contexto_agente) sigue llegando al instante: eso lo leen las herramientas y el turno, no el prompt.
//
// Antes (16/9 a 9/10) era al revés: la base primero, para que lo que la dueña editaba en el panel
// estuviera en boca de Lucía en un minuto (PROCESOS.md § 5), y el archivo de respaldo.
import type { Db } from "../_shared/db.ts";

// El respaldo de la base se cachea un minuto: si el archivo falta, no tiene sentido pedirle 17 kB a
// la base en cada turno.
export const VIGENCIA_MS = 60_000;

export type OrigenDelPrompt = "archivo" | "base";
export type PromptEnUso = { texto: string; origen: OrigenDelPrompt };

let delArchivo: string | null = null;
let deLaBase: { texto: string; hasta: number } | null = null;

// Para las pruebas: hace que el próximo pedido vuelva a leer todo.
export function olvidarPrompt() {
  delArchivo = null;
  deLaBase = null;
}

async function leerArchivoDeLaFuncion(): Promise<string> {
  return await Deno.readTextFile(new URL("../_shared/prompt.md", import.meta.url));
}

// `leerArchivo` solo lo cambian las pruebas (para simular que el archivo no está).
export async function promptDeLucia(
  db: Db,
  ahora: Date,
  leerArchivo: () => Promise<string> = leerArchivoDeLaFuncion,
): Promise<PromptEnUso> {
  if (delArchivo === null) {
    try {
      const texto = await leerArchivo();
      if (texto.trim() !== "") delArchivo = texto;
    } catch (e) {
      console.error("worker: no se pudo leer prompt.md, se usa la copia de la base", String((e as Error)?.message ?? e));
    }
  }
  if (delArchivo !== null) return { texto: delArchivo, origen: "archivo" };

  if (deLaBase && ahora.getTime() < deLaBase.hasta) return { texto: deLaBase.texto, origen: "base" };
  let texto: string | null = null;
  try {
    const [f] = await db.consulta<{ p: string | null }>("select prompt_vigente() as p");
    texto = f?.p ?? null;
  } catch (e) {
    console.error("worker: tampoco se pudo leer el prompt de la base", String((e as Error)?.message ?? e));
  }
  // Sin archivo y sin base no hay con qué contestar: el trabajo falla y la cola lo reintenta.
  if (!texto) throw new Error("no hay prompt: ni prompt.md ni prompt_vigente()");
  deLaBase = { texto, hasta: ahora.getTime() + VIGENCIA_MS };
  return { texto, origen: "base" };
}
