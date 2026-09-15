// LLM_PRINCIPAL (gpt-5.6-terra): la respuesta de Lucía, con herramientas (AGENTE.md § 3 paso 6,
// STACK.md § 3 y § 8). Chat Completions, reasoning_effort "none" (ver cliente.ts: con
// herramientas, gpt-5.6-terra lo exige) y hasta 6 iteraciones de tool calling.
//
// Cómo termina un turno acá adentro:
//  · el modelo responde sin tool_calls → esa es la respuesta final;
//  · una herramienta devuelve efectos.cortaTurno (derivar_a_persona, o una derivación dura que
//    devolvió una herramienta de consulta como buscar_horarios) → se corta ahí mismo, sin
//    pedirle más texto al modelo: lo que sale al cliente son los efectos.mensajesAlCliente que
//    juntaron las herramientas de este turno, en el orden en que se llamaron;
//  · se acaban las iteraciones o el tiempo → sin respuesta final (principio 8: el llamador
//    decide derivar).
// Los `efectos` de cada herramienta (mensajes armados en código, fotos, aviso al equipo) nunca
// se le mandan de vuelta al modelo: son para el cliente real, los junta el orquestador
// (turno.ts). Al modelo solo le vuelve `datos` (o el rechazo), que es lo que tiene que leer para
// seguir.

import type { Efectos } from "../herramientas/tipos.ts";
import { ejecutarHerramienta } from "../herramientas/index.ts";
import type { ContextoHerramienta } from "../herramientas/tipos.ts";
import type { DefinicionParaModelo } from "../herramientas/index.ts";
import { llamarChat, type Uso } from "./cliente.ts";

export type MensajeLlm =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LlamadaLlm = { modelo: string; uso: Uso; ms: number };

export type ResultadoPrincipal = {
  textoFinal: string | null;
  efectos: Efectos[]; // uno por cada herramienta que devolvió efectos, en orden de ejecución
  mensajes: MensajeLlm[]; // el historial completo con lo que se agregó, por si hace falta "rehacer"
  llamadasLlm: LlamadaLlm[];
  iteracionesUsadas: number;
  seCortoPorTiempo: boolean;
  agotoIteraciones: boolean;
};

const MAXIMO_ITERACIONES = 6;

function comoHerramientaChat(d: DefinicionParaModelo) {
  return { type: "function", function: { name: d.name, description: d.description, parameters: d.parameters, strict: d.strict } };
}

export async function correrPrincipal(p: {
  mensajes: MensajeLlm[];
  herramientas: DefinicionParaModelo[];
  ctxHerramientas: ContextoHerramienta;
  limiteMs: number; // Date.now() a partir del cual hay que cortar
  iteracionesYaUsadas?: number;
  fetcher?: typeof fetch;
}): Promise<ResultadoPrincipal> {
  const mensajes = [...p.mensajes];
  const tools = p.herramientas.map(comoHerramientaChat);
  const llamadasLlm: LlamadaLlm[] = [];
  const efectos: Efectos[] = [];
  let textoFinal: string | null = null;
  let iteracion = p.iteracionesYaUsadas ?? 0;
  const modelo = Deno.env.get("LLM_PRINCIPAL") ?? "";

  while (iteracion < MAXIMO_ITERACIONES) {
    if (Date.now() >= p.limiteMs) {
      return { textoFinal: null, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: true, agotoIteraciones: false };
    }
    iteracion++;
    const r = await llamarChat(
      { model: modelo, messages: mensajes, tools, tool_choice: "auto", reasoning_effort: "none", max_completion_tokens: 700 },
      p.fetcher,
    );
    if (!r) {
      return { textoFinal: null, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: false, agotoIteraciones: false };
    }
    llamadasLlm.push({ modelo, uso: r.uso, ms: r.ms });
    if (r.contenido) textoFinal = r.contenido;

    if (r.llamadasHerramienta.length === 0) {
      mensajes.push({ role: "assistant", content: r.contenido ?? "" });
      return { textoFinal, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: false, agotoIteraciones: false };
    }

    mensajes.push({
      role: "assistant",
      content: r.contenido,
      tool_calls: r.llamadasHerramienta.map((t) => ({ id: t.id, type: "function", function: { name: t.nombre, arguments: t.argumentos } })),
    });

    let cortoElTurno = false;
    for (const llamada of r.llamadasHerramienta) {
      const resultado = await ejecutarHerramienta(llamada.nombre, llamada.argumentos, p.ctxHerramientas);
      mensajes.push({
        role: "tool",
        tool_call_id: llamada.id,
        content: JSON.stringify(resultado.ok ? resultado.datos : { error: resultado.rechazo, mensaje: resultado.mensaje }),
      });
      if (resultado.ok && resultado.efectos) {
        efectos.push(resultado.efectos);
        if (resultado.efectos.cortaTurno) cortoElTurno = true;
      }
    }
    if (cortoElTurno) {
      return { textoFinal, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: false, agotoIteraciones: false };
    }
  }
  return { textoFinal: null, efectos, mensajes, llamadasLlm, iteracionesUsadas: iteracion, seCortoPorTiempo: false, agotoIteraciones: true };
}
