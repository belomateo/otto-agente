// Análisis de un pedido del admin (paso 1 del corrector de Lucía): leer las instrucciones, las
// fichas y las herramientas, y decir qué contradice el pedido y qué opciones hay. El modelo
// recibe el texto completo de las instrucciones y un resumen de las fichas y herramientas; lo que
// devuelve se valida en código antes de guardarlo, como en el analista (respuesta.ts).

import type { PeticionRespuestas, Uso } from "../_shared/llm/cliente.ts";
import { llamarRespuestas } from "../_shared/llm/cliente.ts";
import { costoUsd } from "../_shared/llm/precios.ts";
import type { Ficha, Herramienta, InstruccionesActuales } from "./base.ts";

const TIMEOUT_MS = 90_000;
const MAXIMO_SALIDA = 4_000;
const CLAVE_CACHE = "corrector-analisis";

export type Contradiccion = {
  fuente: "instrucciones" | "ficha" | "herramienta";
  cita: string;
  nombre: string | null; // el título de la ficha o el nombre de la herramienta
  porQue: string;
};

export type Opcion = {
  tipo: "editar" | "agregar";
  destino: "instrucciones" | "ficha" | "herramienta";
  descripcion: string;
  fichaId?: string;
  fichaTema?: string;
  fichaTitulo?: string;
  herramientaNombre?: string;
};

export type AnalisisCompleto = {
  entendido: string; // qué entendió el modelo del pedido, en una oración
  contradicciones: Contradiccion[];
  opciones: Opcion[];
};

export type ConsumoModelo = { modelo: string; uso: Uso; costoUsd: number };

const INSTRUCCIONES_SISTEMA = `Sos el asistente de control de calidad de un bot de WhatsApp llamado Lucía, que atiende para un local de alquiler de trajes (Otto Su Misura, Rosario, Argentina). El admin te va a pedir un cambio en cómo atiende Lucía.

Tu trabajo:
1. Explicar en UNA oración qué quiere el admin.
2. Buscar en las instrucciones de Lucía, en las fichas de información y en las herramientas qué texto contradice o no contempla lo que pide.
3. Proponer hasta 2 opciones de cómo hacer el cambio:
   - "editar": modificar una parte de las instrucciones (o una ficha o herramienta), citando la parte vieja y la nueva.
   - "agregar": cargar información nueva en una ficha de la base de conocimiento.

Respondé en JSON con esta forma:
{
  "entendido": "Una oración con lo que pide el admin",
  "contradicciones": [
    {"fuente": "instrucciones"|"ficha"|"herramienta", "cita": "texto exacto que contradice", "nombre": null|"título de la ficha"|"nombre de la herramienta", "por_que": "por qué contradice"}
  ],
  "opciones": [
    {"tipo": "editar"|"agregar", "destino": "instrucciones"|"ficha"|"herramienta", "descripcion": "qué se haría", "ficha_id": "uuid si aplica", "ficha_tema": "tema si aplica", "ficha_titulo": "título si aplica", "herramienta_nombre": "nombre si aplica"}
  ]
}

Si el pedido no tiene sentido o no se puede hacer (por ejemplo, algo que necesita un cambio de código), poné opciones vacías y explicalo en "entendido". Las contradicciones pueden estar vacías si es algo nuevo que no contradice nada.`;

function armarContexto(instrucciones: InstruccionesActuales, fichas: Ficha[], herramientas: Herramienta[]): string {
  const partes: string[] = [
    "# INSTRUCCIONES ACTUALES DE LUCÍA",
    instrucciones.texto,
    "",
    "# FICHAS DE INFORMACIÓN (base de conocimiento)",
  ];
  for (const f of fichas) {
    partes.push(`## [${f.tema}] ${f.titulo} (id: ${f.id})`, f.texto, "");
  }
  partes.push("# HERRAMIENTAS");
  for (const h of herramientas) {
    partes.push(`## ${h.nombre}`, h.descripcion, "");
  }
  return partes.join("\n");
}

export async function analizarPedido(
  p: { pedido: string; instrucciones: InstruccionesActuales; fichas: Ficha[]; herramientas: Herramienta[] },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ analisis: AnalisisCompleto; consumo: ConsumoModelo } | { error: string }> {
  const contexto = armarContexto(p.instrucciones, p.fichas, p.herramientas);
  const peticion: PeticionRespuestas = {
    model: modelo,
    input: [
      { role: "developer", content: INSTRUCCIONES_SISTEMA },
      { role: "user", content: `${contexto}\n\n---\n\nPEDIDO DEL ADMIN:\n${p.pedido}` },
    ],
    reasoning: { effort: razonamiento },
    store: false,
    prompt_cache_key: CLAVE_CACHE,
    max_output_tokens: MAXIMO_SALIDA,
  };
  const r = await llamarRespuestas(peticion, { hastaMs: Date.now() + TIMEOUT_MS });
  if (!r) return { error: "el modelo no contestó" };

  const consumo: ConsumoModelo = { modelo: r.modelo, uso: r.uso, costoUsd: costoUsd(r.modelo, r.uso) };

  let crudo: Record<string, unknown>;
  try {
    crudo = JSON.parse(r.contenido ?? "");
  } catch {
    return { error: "la respuesta del modelo no es JSON válido" };
  }
  if (typeof crudo !== "object" || !crudo) return { error: "la respuesta del modelo no es un objeto" };

  const entendido = String(crudo.entendido ?? "").trim();
  if (!entendido) return { error: "falta el campo 'entendido'" };

  const contradicciones: Contradiccion[] = [];
  for (const c of Array.isArray(crudo.contradicciones) ? crudo.contradicciones : []) {
    if (!c || typeof c !== "object") continue;
    const fuente = String(c.fuente ?? "");
    if (!["instrucciones", "ficha", "herramienta"].includes(fuente)) continue;
    contradicciones.push({
      fuente: fuente as Contradiccion["fuente"],
      cita: String(c.cita ?? "").slice(0, 500),
      nombre: c.nombre ? String(c.nombre).slice(0, 200) : null,
      porQue: String(c.por_que ?? c.porQue ?? "").slice(0, 500),
    });
  }

  const opciones: Opcion[] = [];
  for (const o of Array.isArray(crudo.opciones) ? crudo.opciones : []) {
    if (!o || typeof o !== "object") continue;
    const tipo = String(o.tipo ?? "");
    const destino = String(o.destino ?? "");
    if (!["editar", "agregar"].includes(tipo) || !["instrucciones", "ficha", "herramienta"].includes(destino)) continue;
    opciones.push({
      tipo: tipo as Opcion["tipo"],
      destino: destino as Opcion["destino"],
      descripcion: String(o.descripcion ?? "").slice(0, 1000),
      ...(o.ficha_id ? { fichaId: String(o.ficha_id) } : {}),
      ...(o.ficha_tema ? { fichaTema: String(o.ficha_tema) } : {}),
      ...(o.ficha_titulo ? { fichaTitulo: String(o.ficha_titulo) } : {}),
      ...(o.herramienta_nombre ? { herramientaNombre: String(o.herramienta_nombre) } : {}),
    });
  }

  return { analisis: { entendido, contradicciones, opciones }, consumo };
}
