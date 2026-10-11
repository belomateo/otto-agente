// Pruebas del corrector (paso 3): generar charlas de prueba para el cambio propuesto, correr cada
// una con el código real de Lucía (correrCharlaDePrueba), y juzgar si la prueba pasó o no. Usa
// la misma infraestructura que scripts/charla-de-prueba.ts: una transacción con rollback que no
// deja nada en el CRM ni manda nada por WhatsApp.
//
// Las pruebas las genera el modelo a partir del pedido del admin: "preguntá si hay descuento por
// dos" → una charla donde el cliente pregunta por descuento por dos y Lucía tiene que decir que se
// ve en el local.
//
// El juez es otro modelo: recibe lo que contestó Lucía y lo que tenía que hacer, y da un veredicto.
// Si el juez no puede decidir, la prueba queda como "error" (no se cuenta como fallo).

import type { PeticionRespuestas, Uso } from "../_shared/llm/cliente.ts";
import { llamarRespuestas } from "../_shared/llm/cliente.ts";
import { costoUsd } from "../_shared/llm/precios.ts";
import type { ConsumoModelo } from "./analisis.ts";

const TIMEOUT_GENERAR_MS = 60_000;
const TIMEOUT_JUEZ_MS = 60_000;
const MAXIMO_SALIDA_GENERAR = 4_000;
const MAXIMO_SALIDA_JUEZ = 2_000;
export const MINIMO_PRUEBAS = 3;
export const MAXIMO_PRUEBAS = 5;

export type PruebaGenerada = {
  nombre: string;
  mensajes: (string | string[])[];
  ficha?: Record<string, unknown>;
  debe: string[];
  noDebe?: string[];
};

const INSTRUCCIONES_GENERAR = `Sos el QA de un bot de WhatsApp llamado Lucía, que atiende para un local de alquiler de trajes (Otto Su Misura, Rosario). Te doy un cambio que se hizo en las instrucciones de Lucía y necesito que generes entre ${MINIMO_PRUEBAS} y ${MAXIMO_PRUEBAS} charlas de prueba que verifiquen que el cambio funciona.

Cada prueba es una charla de un cliente nuevo, de 1 a 4 mensajes. Incluí:
- Al menos una prueba directa (el cliente pregunta exactamente lo que cambió).
- Al menos una prueba indirecta (el cliente llega al tema por otro lado).
- Al menos una prueba de que lo viejo sigue andando (algo que NO debería cambiar).

Respondé en JSON:
{
  "pruebas": [
    {
      "nombre": "nombre corto de la prueba",
      "mensajes": ["primer mensaje del cliente", "segundo mensaje"],
      "ficha": {"evento": "casamiento", "fecha_evento": "2026-11-15"},
      "debe": ["Lucía tiene que decir/hacer X", "Lucía tiene que ofrecer Y"],
      "no_debe": ["Lucía NO debe decir Z"]
    }
  ]
}

La ficha es opcional: datos que el cliente ya tiene en el sistema (evento, fecha_evento, etc.).
Los mensajes son lo que escribe el cliente, en orden. Cada "debe" y "no_debe" es una condición que el juez va a verificar contra lo que conteste Lucía.`;

export async function generarPruebas(
  p: { pedido: string; resumen: string; cambioDescripcion: string },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ pruebas: PruebaGenerada[]; consumo: ConsumoModelo } | { error: string }> {
  const peticion: PeticionRespuestas = {
    model: modelo,
    input: [
      { role: "developer", content: INSTRUCCIONES_GENERAR },
      { role: "user", content: `PEDIDO DEL ADMIN: ${p.pedido}\n\nRESUMEN DEL CAMBIO: ${p.resumen}\n\nDESCRIPCIÓN: ${p.cambioDescripcion}` },
    ],
    reasoning: { effort: razonamiento },
    store: false,
    max_output_tokens: MAXIMO_SALIDA_GENERAR,
  };
  const r = await llamarRespuestas(peticion, { hastaMs: Date.now() + TIMEOUT_GENERAR_MS });
  if (!r?.contenido) return { error: "el modelo no generó pruebas" };

  const consumo: ConsumoModelo = { modelo: r.modelo ?? modelo, uso: r.uso, costoUsd: costoUsd(r.modelo ?? modelo, r.uso) };

  let crudo: Record<string, unknown>;
  try { crudo = JSON.parse(r.contenido); } catch { return { error: "las pruebas no son JSON válido" }; }
  const lista = Array.isArray(crudo.pruebas) ? crudo.pruebas : [];
  if (lista.length < MINIMO_PRUEBAS) return { error: `solo generó ${lista.length} pruebas (mínimo ${MINIMO_PRUEBAS})` };

  const pruebas: PruebaGenerada[] = [];
  for (const item of lista.slice(0, MAXIMO_PRUEBAS)) {
    if (!item || typeof item !== "object") continue;
    const nombre = String(item.nombre ?? `prueba ${pruebas.length + 1}`).slice(0, 200);
    const mensajes = Array.isArray(item.mensajes) ? item.mensajes.filter((m: unknown) => typeof m === "string" || Array.isArray(m)) : [];
    if (!mensajes.length) continue;
    const debe = Array.isArray(item.debe) ? item.debe.filter((d: unknown) => typeof d === "string").map((d: unknown) => String(d)) : [];
    if (!debe.length) continue;
    const noDebe = Array.isArray(item.no_debe) ? item.no_debe.filter((d: unknown) => typeof d === "string").map((d: unknown) => String(d)) : [];
    const ficha = item.ficha && typeof item.ficha === "object" ? item.ficha as Record<string, unknown> : undefined;
    pruebas.push({ nombre, mensajes, ficha, debe, noDebe });
  }
  if (pruebas.length < MINIMO_PRUEBAS) return { error: `solo quedaron ${pruebas.length} pruebas válidas (mínimo ${MINIMO_PRUEBAS})` };
  return { pruebas, consumo };
}

// --- Juez: verifica que Lucía hizo lo que tenía que hacer ---

export type Punto = { condicion: string; paso: boolean; motivo: string };
export type Veredicto = { puntos: Punto[]; paso: boolean; motivo: string | null };

const INSTRUCCIONES_JUEZ = `Sos el juez de calidad de un bot de WhatsApp llamado Lucía. Te doy una charla de prueba (lo que dijo el cliente y lo que contestó Lucía) y las condiciones que tenía que cumplir.

Tu trabajo es verificar cada condición, una por una:
- "paso": true si Lucía la cumplió, false si no.
- "motivo": por qué sí o por qué no, en una oración.

Respondé en JSON:
{
  "puntos": [
    {"condicion": "la condición textual", "paso": true|false, "motivo": "explicación"}
  ]
}

Sé estricto: si la condición dice "tiene que decir X" y Lucía no lo dijo o dijo algo distinto, no pasó. Si dice "NO debe decir Y" y Lucía lo dijo, no pasó.`;

export async function juzgarPrueba(
  p: { charla: string; debe: string[]; noDebe: string[] },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ veredicto: Veredicto; consumo: ConsumoModelo } | { error: string }> {
  const condiciones = [
    ...p.debe.map((d) => `DEBE: ${d}`),
    ...p.noDebe.map((d) => `NO DEBE: ${d}`),
  ];
  const peticion: PeticionRespuestas = {
    model: modelo,
    input: [
      { role: "developer", content: INSTRUCCIONES_JUEZ },
      { role: "user", content: `CHARLA:\n${p.charla}\n\n---\n\nCONDICIONES:\n${condiciones.map((c, i) => `${i + 1}. ${c}`).join("\n")}` },
    ],
    reasoning: { effort: razonamiento },
    store: false,
    max_output_tokens: MAXIMO_SALIDA_JUEZ,
  };
  const r = await llamarRespuestas(peticion, { hastaMs: Date.now() + TIMEOUT_JUEZ_MS });
  if (!r?.contenido) return { error: "el juez no contestó" };

  const consumo: ConsumoModelo = { modelo: r.modelo ?? modelo, uso: r.uso, costoUsd: costoUsd(r.modelo ?? modelo, r.uso) };

  let crudo: Record<string, unknown>;
  try { crudo = JSON.parse(r.contenido); } catch { return { error: "el veredicto no es JSON válido" }; }

  const puntos: Punto[] = [];
  for (const item of Array.isArray(crudo.puntos) ? crudo.puntos : []) {
    if (!item || typeof item !== "object") continue;
    puntos.push({
      condicion: String(item.condicion ?? "").slice(0, 500),
      paso: item.paso === true,
      motivo: String(item.motivo ?? "").slice(0, 500),
    });
  }
  if (!puntos.length) return { error: "el juez no devolvió puntos" };

  const paso = puntos.every((pt) => pt.paso);
  const fallidos = puntos.filter((pt) => !pt.paso);
  return {
    veredicto: {
      puntos,
      paso,
      motivo: paso ? null : fallidos.map((f) => f.motivo).join("; "),
    },
    consumo,
  };
}
