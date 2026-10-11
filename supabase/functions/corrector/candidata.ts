// Armar el cambio concreto (paso 2 del corrector): según la opción elegida, pedirle al modelo que
// reescriba la parte de las instrucciones, o que arme una ficha nueva/editada, o una herramienta.
// Lo que devuelve queda en correcciones_lucia.cambio y es exactamente lo que se prueba.

import type { PeticionRespuestas, Uso } from "../_shared/llm/cliente.ts";
import { llamarRespuestas } from "../_shared/llm/cliente.ts";
import { costoUsd } from "../_shared/llm/precios.ts";
import { controlarContraLaBase, controlarInstrucciones, normalizarInstrucciones } from "../_shared/instrucciones.ts";
import type { Ficha, Herramienta, InstruccionesActuales } from "./base.ts";
import type { AnalisisCompleto, ConsumoModelo, Opcion } from "./analisis.ts";

const TIMEOUT_MS = 90_000;
const MAXIMO_SALIDA = 8_000;
const CLAVE_CACHE = "corrector-candidata";

export type Cambio = {
  tipo: "editar" | "agregar";
  destino: "instrucciones" | "ficha" | "herramienta";
  // Para instrucciones:
  textoAntes?: string;
  textoDespues?: string;
  textoCompleto?: string;
  resumen?: string;
  // Para ficha:
  ficha?: { id?: string; tema: string; titulo: string; texto_viejo?: string; texto_nuevo: string; version?: number };
  // Para herramienta:
  herramienta?: { nombre: string; texto_viejo: string; texto_nuevo: string; version: number };
};

const INSTRUCCIONES_EDITAR = `Sos el editor de instrucciones de un bot de WhatsApp llamado Lucía. Te doy las instrucciones actuales, el pedido del admin y lo que hay que cambiar. Tu trabajo es devolver el texto COMPLETO de las instrucciones con el cambio incorporado.

REGLAS:
- Hacé SOLO el cambio pedido: no reescribas ni reorganices lo demás.
- Mantené el estilo, el tono y la estructura (secciones numeradas, la lista de fórmulas, el mapa).
- El cambio tiene que ser mínimo pero claro: que Lucía lo lea y sepa qué hacer distinto.
- Si tenés que agregar algo nuevo, ponelo en la sección que más corresponda.

Respondé SOLO con el texto completo de las instrucciones (sin JSON, sin comillas, sin explicación).`;

const INSTRUCCIONES_AGREGAR_FICHA = `Sos el editor de la base de conocimiento de un bot de WhatsApp llamado Lucía. Te doy el pedido del admin y, si aplica, la ficha existente. Tu trabajo es devolver una ficha nueva o editada en JSON:

{
  "tema": "el-tema",
  "titulo": "Título de la ficha",
  "texto": "El texto de la ficha, con toda la información que Lucía necesita"
}

Escribí la ficha como si le hablaras a Lucía: concreta, con datos, sin rodeos. Si la ficha ya existe, mantené lo que tenía y sumale lo nuevo.`;

const INSTRUCCIONES_EDITAR_HERRAMIENTA = `Sos el editor de herramientas de un bot de WhatsApp llamado Lucía. Te doy la descripción actual de una herramienta y lo que hay que cambiar. Tu trabajo es devolver la descripción nueva.

Respondé SOLO con el texto nuevo de la descripción (sin JSON, sin comillas).`;

export async function armarCambio(
  opcion: Opcion,
  p: { pedido: string; analisis: AnalisisCompleto; instrucciones: InstruccionesActuales; fichas: Ficha[]; herramientas: Herramienta[] },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ cambio: Cambio; consumo: ConsumoModelo } | { error: string }> {

  if (opcion.tipo === "editar" && opcion.destino === "instrucciones") {
    return await editarInstrucciones(p, modelo, razonamiento);
  }
  if (opcion.tipo === "agregar" && opcion.destino === "ficha") {
    return await agregarFicha(opcion, p, modelo, razonamiento);
  }
  if (opcion.tipo === "editar" && opcion.destino === "ficha") {
    return await editarFicha(opcion, p, modelo, razonamiento);
  }
  if (opcion.destino === "herramienta") {
    return await editarHerramienta(opcion, p, modelo, razonamiento);
  }
  return { error: `combinación no soportada: ${opcion.tipo} ${opcion.destino}` };
}

async function editarInstrucciones(
  p: { pedido: string; analisis: AnalisisCompleto; instrucciones: InstruccionesActuales },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ cambio: Cambio; consumo: ConsumoModelo } | { error: string }> {
  const peticion: PeticionRespuestas = {
    model: modelo,
    input: [
      { role: "developer", content: INSTRUCCIONES_EDITAR },
      { role: "user", content: `INSTRUCCIONES ACTUALES:\n${p.instrucciones.texto}\n\n---\n\nPEDIDO: ${p.pedido}\n\nANÁLISIS: ${p.analisis.entendido}\nCONTRADICCIONES: ${JSON.stringify(p.analisis.contradicciones)}` },
    ],
    reasoning: { effort: razonamiento },
    store: false,
    prompt_cache_key: CLAVE_CACHE,
    max_output_tokens: MAXIMO_SALIDA,
  };
  const r = await llamarRespuestas(peticion, { hastaMs: Date.now() + TIMEOUT_MS });
  if (!r?.contenido) return { error: "el modelo no devolvió las instrucciones editadas" };

  const nuevo = normalizarInstrucciones(r.contenido);
  const problemas = controlarInstrucciones(nuevo);
  if (problemas.length) return { error: `las instrucciones editadas no pasan los controles: ${problemas.join("; ")}` };
  const contraBase = controlarContraLaBase(nuevo, p.instrucciones.texto);
  if (contraBase.length) return { error: `el cambio es demasiado grande: ${contraBase.join("; ")}` };

  const consumo: ConsumoModelo = { modelo: r.modelo ?? modelo, uso: r.uso, costoUsd: costoUsd(r.modelo ?? modelo, r.uso) };
  return {
    cambio: {
      tipo: "editar", destino: "instrucciones",
      textoAntes: p.instrucciones.texto, textoDespues: nuevo, textoCompleto: nuevo,
      resumen: p.analisis.entendido,
    },
    consumo,
  };
}

async function agregarFicha(
  opcion: Opcion,
  p: { pedido: string; analisis: AnalisisCompleto },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ cambio: Cambio; consumo: ConsumoModelo } | { error: string }> {
  const peticion: PeticionRespuestas = {
    model: modelo,
    input: [
      { role: "developer", content: INSTRUCCIONES_AGREGAR_FICHA },
      { role: "user", content: `PEDIDO: ${p.pedido}\n\nANÁLISIS: ${p.analisis.entendido}${opcion.fichaTema ? `\nTEMA SUGERIDO: ${opcion.fichaTema}` : ""}${opcion.fichaTitulo ? `\nTÍTULO SUGERIDO: ${opcion.fichaTitulo}` : ""}` },
    ],
    reasoning: { effort: razonamiento },
    store: false,
    max_output_tokens: MAXIMO_SALIDA,
  };
  const r = await llamarRespuestas(peticion, { hastaMs: Date.now() + TIMEOUT_MS });
  if (!r?.contenido) return { error: "el modelo no devolvió la ficha" };

  let crudo: Record<string, unknown>;
  try { crudo = JSON.parse(r.contenido); } catch { return { error: "la ficha no es JSON válido" }; }
  const tema = String(crudo.tema ?? opcion.fichaTema ?? "general").slice(0, 100);
  const titulo = String(crudo.titulo ?? opcion.fichaTitulo ?? "").slice(0, 200);
  const texto = String(crudo.texto ?? "").trim();
  if (!titulo || !texto) return { error: "la ficha no tiene título o texto" };

  const consumo: ConsumoModelo = { modelo: r.modelo ?? modelo, uso: r.uso, costoUsd: costoUsd(r.modelo ?? modelo, r.uso) };
  return {
    cambio: { tipo: "agregar", destino: "ficha", ficha: { tema, titulo, texto_nuevo: texto }, resumen: p.analisis.entendido },
    consumo,
  };
}

async function editarFicha(
  opcion: Opcion,
  p: { pedido: string; analisis: AnalisisCompleto; fichas: Ficha[] },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ cambio: Cambio; consumo: ConsumoModelo } | { error: string }> {
  const ficha = p.fichas.find((f) => f.id === opcion.fichaId);
  if (!ficha) return { error: `no se encontró la ficha ${opcion.fichaId}` };

  const peticion: PeticionRespuestas = {
    model: modelo,
    input: [
      { role: "developer", content: INSTRUCCIONES_AGREGAR_FICHA },
      { role: "user", content: `FICHA EXISTENTE [${ficha.tema}] ${ficha.titulo}:\n${ficha.texto}\n\n---\n\nPEDIDO: ${p.pedido}\n\nANÁLISIS: ${p.analisis.entendido}` },
    ],
    reasoning: { effort: razonamiento },
    store: false,
    max_output_tokens: MAXIMO_SALIDA,
  };
  const r = await llamarRespuestas(peticion, { hastaMs: Date.now() + TIMEOUT_MS });
  if (!r?.contenido) return { error: "el modelo no devolvió la ficha editada" };

  let crudo: Record<string, unknown>;
  try { crudo = JSON.parse(r.contenido); } catch { return { error: "la ficha editada no es JSON válido" }; }
  const texto = String(crudo.texto ?? "").trim();
  if (!texto) return { error: "la ficha editada no tiene texto" };

  const consumo: ConsumoModelo = { modelo: r.modelo ?? modelo, uso: r.uso, costoUsd: costoUsd(r.modelo ?? modelo, r.uso) };
  return {
    cambio: {
      tipo: "editar", destino: "ficha",
      ficha: { id: ficha.id, tema: ficha.tema, titulo: ficha.titulo, texto_viejo: ficha.texto, texto_nuevo: texto, version: ficha.version },
      resumen: p.analisis.entendido,
    },
    consumo,
  };
}

async function editarHerramienta(
  opcion: Opcion,
  p: { pedido: string; analisis: AnalisisCompleto; herramientas: Herramienta[] },
  modelo: string,
  razonamiento: "low" | "medium" | "high",
): Promise<{ cambio: Cambio; consumo: ConsumoModelo } | { error: string }> {
  const herr = p.herramientas.find((h) => h.nombre === opcion.herramientaNombre);
  if (!herr) return { error: `no se encontró la herramienta ${opcion.herramientaNombre}` };

  const peticion: PeticionRespuestas = {
    model: modelo,
    input: [
      { role: "developer", content: INSTRUCCIONES_EDITAR_HERRAMIENTA },
      { role: "user", content: `HERRAMIENTA: ${herr.nombre}\nDESCRIPCIÓN ACTUAL:\n${herr.descripcion}\n\n---\n\nPEDIDO: ${p.pedido}\n\nANÁLISIS: ${p.analisis.entendido}` },
    ],
    reasoning: { effort: razonamiento },
    store: false,
    max_output_tokens: MAXIMO_SALIDA,
  };
  const r = await llamarRespuestas(peticion, { hastaMs: Date.now() + TIMEOUT_MS });
  if (!r?.contenido) return { error: "el modelo no devolvió la descripción editada" };

  const consumo: ConsumoModelo = { modelo: r.modelo ?? modelo, uso: r.uso, costoUsd: costoUsd(r.modelo ?? modelo, r.uso) };
  return {
    cambio: {
      tipo: "editar", destino: "herramienta",
      herramienta: { nombre: herr.nombre, texto_viejo: herr.descripcion, texto_nuevo: r.contenido.trim(), version: herr.version },
      resumen: p.analisis.entendido,
    },
    consumo,
  };
}
