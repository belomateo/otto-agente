// Valida en código lo que mandó el modelo contra el schema de la herramienta, antes de que la
// herramienta corra (principio 6). El modo estricto del proveedor ayuda, pero no es una
// garantía: acá se vuelve a chequear todo, y el mensaje de error lo lee el modelo.

import { esFechaHoraValida, esFechaValida } from "../tiempo.ts";
import type { EsquemaJson } from "./tipos.ts";

type Esquema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, Esquema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Esquema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function tipos(e: Esquema): string[] {
  if (e.type === undefined) return [];
  return Array.isArray(e.type) ? e.type : [e.type];
}

const aceptaNulo = (e: Esquema | undefined) => !!e && tipos(e).includes("null");
const nombreDe = (ruta: string) => ruta || "los argumentos";

export function validarContraEsquema(valor: unknown, esquema: EsquemaJson, ruta = ""): string[] {
  const e = esquema as Esquema;
  const errores: string[] = [];
  const real = tipoDe(valor);
  const esperados = tipos(e);
  if (esperados.length && !esperados.some((t) => t === real || (t === "number" && real === "integer"))) {
    errores.push(`${nombreDe(ruta)}: tiene que ser ${esperados.join(" o ")} y llegó ${real}`);
    return errores;
  }
  if (valor === null) return errores;

  if (e.enum && !e.enum.includes(valor)) {
    const validos = e.enum.filter((x) => x !== null).join(", ");
    errores.push(`${nombreDe(ruta)}: "${String(valor)}" no es uno de estos: ${validos}`);
  }

  if (real === "string") {
    const s = valor as string;
    if (e.minLength !== undefined && s.trim().length < e.minLength) errores.push(`${nombreDe(ruta)}: está vacío`);
    if (e.maxLength !== undefined && s.length > e.maxLength) errores.push(`${nombreDe(ruta)}: pasa los ${e.maxLength} caracteres`);
    if (e.pattern && !new RegExp(e.pattern).test(s)) errores.push(`${nombreDe(ruta)}: no tiene el formato esperado`);
    if (e.format === "date" && !esFechaValida(s)) errores.push(`${nombreDe(ruta)}: tiene que ser una fecha AAAA-MM-DD`);
    if (e.format === "date-time" && !esFechaHoraValida(s)) {
      errores.push(`${nombreDe(ruta)}: tiene que ser fecha y hora con zona, tal cual la devolvió buscar_horarios`);
    }
    if (e.format === "uuid" && !UUID.test(s)) errores.push(`${nombreDe(ruta)}: no es un id válido`);
  }

  if (real === "array") {
    const a = valor as unknown[];
    if (e.minItems !== undefined && a.length < e.minItems) errores.push(`${nombreDe(ruta)}: tiene que tener al menos ${e.minItems}`);
    if (e.maxItems !== undefined && a.length > e.maxItems) errores.push(`${nombreDe(ruta)}: como máximo ${e.maxItems}, llegaron ${a.length}`);
    if (e.items) a.forEach((x, i) => errores.push(...validarContraEsquema(x, e.items as EsquemaJson, `${ruta}[${i}]`)));
  }

  if (real === "object") {
    const o = valor as Record<string, unknown>;
    const prefijo = ruta ? `${ruta}.` : "";
    for (const r of e.required ?? []) {
      if (!(r in o) && !aceptaNulo(e.properties?.[r])) errores.push(`${prefijo}${r}: falta`);
    }
    for (const [k, v] of Object.entries(o)) {
      const sub = e.properties?.[k];
      if (!sub) {
        if (e.additionalProperties === false) errores.push(`${prefijo}${k}: no existe ese parámetro`);
        continue;
      }
      errores.push(...validarContraEsquema(v, sub as EsquemaJson, `${prefijo}${k}`));
    }
  }
  return errores;
}

// Completa con null lo que acepta null y no vino, así cada herramienta recibe siempre todos sus
// parámetros, venga el modelo en modo estricto o no.
export function completarNulos(valor: unknown, esquema: EsquemaJson): Record<string, unknown> {
  const e = esquema as Esquema;
  const o = { ...((valor ?? {}) as Record<string, unknown>) };
  for (const [k, sub] of Object.entries(e.properties ?? {})) {
    if (!(k in o) && aceptaNulo(sub)) o[k] = null;
  }
  return o;
}
