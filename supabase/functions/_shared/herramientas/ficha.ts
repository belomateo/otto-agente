// La ficha del cliente (AGENTE.md § 7, columnas de clientes de logica 0023). La escriben
// guardar_datos_cliente y agendar_turno; los campos que son de código (turno, recordatorio,
// confirmado) no están acá y el modelo no los puede tocar.

import type { Db } from "../db.ts";
import { AUTOR_LUCIA } from "../enums.ts";

export const CAMPOS_FICHA = [
  "nombre",
  "evento",
  "fecha_evento",
  "rol",
  "dia_o_noche",
  "talle_aprox",
  "ciudad",
  "color_preferido",
  "presupuesto_mencionado",
  "email",
] as const;
export type CampoFicha = typeof CAMPOS_FICHA[number];
export type Ficha = Record<CampoFicha, string | null>;

// Hallazgo B1 del tester (15/9): el cliente escribe "soy denise" en minúscula, y como cada
// lugar del código usa el nombre de la ficha tal cual, un mensaje de Lucía decía «¡Listo,
// Denise!» (ella lo redactó bien) y la confirmación armada en código, dos líneas después,
// decía «¡Listo, denise!» (tomó el dato crudo). Se capitaliza acá, al guardar, una sola vez,
// para que todo lo que lea la ficha después (confirmación, panel, Lucía en el próximo turno)
// ya lo reciba consistente — parchear cada lugar que lo usa hubiera sido repetir el arreglo.
function capitalizarNombre(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .map((palabra) => palabra.charAt(0).toLocaleUpperCase("es") + palabra.slice(1).toLocaleLowerCase("es"))
    .join(" ");
}

// Mismo formato que exige la base (0029, hito 2.3): sin espacios y en minúscula. Lo usan
// extractor.ts y guardar_datos_cliente para decidir si un mail descarta o se guarda — antes de
// llegar acá, nunca después: si no pasa esto, no es un mail, es ruido (mismo principio que
// validarExtraccion con evento/rol/fecha_evento).
export const FORMATO_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function formatoDeEmailValido(valor: string): boolean {
  return FORMATO_EMAIL.test(valor.trim().toLowerCase());
}

export async function leerFicha(db: Db, clienteId: string): Promise<Ficha> {
  const filas = await db.consulta(
    `select nombre, evento, fecha_evento::text as fecha_evento, rol, dia_o_noche, talle_aprox,
            ciudad, color_preferido, presupuesto_mencionado, email
       from clientes where id = $1`,
    [clienteId],
  );
  const f = filas[0] ?? {};
  return Object.fromEntries(
    CAMPOS_FICHA.map((c) => [c, f[c] === null || f[c] === undefined ? null : String(f[c])]),
  ) as Ficha;
}

// Escribe solo los campos que vinieron con valor y solo si cambian. Devuelve los que escribió.
// Los nombres de columna salen de CAMPOS_FICHA, nunca del modelo.
export async function actualizarFicha(
  db: Db,
  clienteId: string,
  campos: Partial<Record<CampoFicha, string | null>>,
): Promise<CampoFicha[]> {
  const cambios = CAMPOS_FICHA
    .map((c) => [c, campos[c]] as const)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([c, v]) => {
      if (c === "nombre") return [c, capitalizarNombre(String(v).trim())] as const;
      if (c === "email") return [c, String(v).trim().toLowerCase()] as const;
      return [c, String(v).trim()] as const;
    });
  if (cambios.length === 0) return [];
  const sets = cambios.map(([c], i) => `${c} = $${i + 2}`).join(", ");
  const distintos = cambios.map(([c], i) => `${c} is distinct from $${i + 2}`).join(" or ");
  const autor = `$${cambios.length + 2}`;
  const filas = await db.consulta(
    `update clientes set ${sets}, editado_por = ${autor}, actualizado_at = now()
      where id = $1 and (${distintos}) returning id`,
    [clienteId, ...cambios.map(([, v]) => v), AUTOR_LUCIA],
  );
  return filas.length ? cambios.map(([c]) => c) : [];
}
