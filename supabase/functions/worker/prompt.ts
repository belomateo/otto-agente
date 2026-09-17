// De dónde saca Lucía su prompt (0050; pedido de Mateo, 16/9).
//
// Antes: el prompt viajaba horneado adentro de la función (_shared/prompt.md, generado al
// publicar) y _shared/turno lo leía una vez y lo cacheaba para siempre. La dueña podía editar el
// prompt, las reglas y el contexto en el panel y Lucía seguía hablando igual hasta la próxima
// publicación. PROCESOS.md § 5 promete que un cambio se ve en 60 segundos, y era falso.
//
// Ahora: se le pide a la base el prompt armado con lo que hay cargado AHORA (prompt_vigente()),
// con una caché corta para no traer 17 kB en cada turno. La dueña guarda, y como mucho un minuto
// después Lucía ya habla distinto.
//
// Si la base no puede armar uno bueno —la plantilla todavía no está cargada, quedó un marcador sin
// resolver, alguien borró las reglas, se cortó la conexión— se usa el prompt.md que viene adentro
// de la función, que es el último que pasó todas las validaciones. Lucía nunca se queda muda ni
// habla con un prompt a medias. Eso también se cachea un minuto: si la base está caída, no tiene
// sentido preguntarle en cada turno.
import type { Db } from "../_shared/db.ts";

// PROCESOS.md § 5: un cambio de la dueña se tiene que ver en 60 segundos.
export const VIGENCIA_MS = 60_000;

export type OrigenDelPrompt = "base" | "archivo";
export type PromptEnUso = { texto: string; origen: OrigenDelPrompt };

let cacheado: (PromptEnUso & { hasta: number }) | null = null;
let delArchivo: string | null = null;

// Para las pruebas: hace que el próximo pedido vuelva a preguntarle a la base.
export function olvidarPrompt() {
  cacheado = null;
}

async function leerArchivo(): Promise<string> {
  if (delArchivo === null) {
    delArchivo = await Deno.readTextFile(new URL("../_shared/prompt.md", import.meta.url));
  }
  return delArchivo;
}

export async function promptDeLucia(db: Db, ahora: Date): Promise<PromptEnUso> {
  if (cacheado && ahora.getTime() < cacheado.hasta) {
    return { texto: cacheado.texto, origen: cacheado.origen };
  }

  let texto: string | null = null;
  let origen: OrigenDelPrompt = "base";
  try {
    const [f] = await db.consulta<{ p: string | null }>("select prompt_vigente() as p");
    texto = f?.p ?? null;
  } catch (e) {
    console.error("worker: no se pudo leer el prompt de la base", String((e as Error)?.message ?? e));
    texto = null;
  }
  if (texto === null || texto === "") {
    texto = await leerArchivo();
    origen = "archivo";
  }

  cacheado = { texto, origen, hasta: ahora.getTime() + VIGENCIA_MS };
  return { texto, origen };
}
