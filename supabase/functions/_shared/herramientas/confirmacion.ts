// El mensaje de confirmación de un turno. Lo arma el código y lo manda aparte, después de lo
// que escriba Lucía (AGENTE.md § 4 y § 9 paso 9; el prompt le dice que no lo repita).
//
// Nada del texto del negocio está escrito acá: la fecha y la hora salen del turno; la
// dirección, el acompañante, la tolerancia y cómo se reserva salen del fragmento de
// «como-funciona» que mejor habla del turno en el local (lo edita el dueño en Conocimiento);
// el mapa sale de enlaces. Si falta una pieza, el mensaje sale igual con lo que hay y la
// herramienta lo informa para la bitácora.

import { buscarFragmentos } from "../conocimiento/busqueda.ts";
import type { Db } from "../db.ts";
import { fechaLarga, horaLocal } from "../tiempo.ts";
import { enlaceDeTipo } from "./enlaces.ts";

const CONSULTA_CONDICIONES = "turno local acompañante tolerancia";

export async function armarConfirmacion(
  db: Db,
  p: { nombre: string | null; inicio: Date; tz: string },
): Promise<{ texto: string; faltan: string[] }> {
  const primerNombre = (p.nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const cabeza = `¡Listo${primerNombre ? `, ${primerNombre}` : ""}! Tu turno quedó agendado para el ` +
    `${fechaLarga(p.inicio, p.tz)} a las ${horaLocal(p.inicio, p.tz)}.`;
  const faltan: string[] = [];

  const { encontrados } = await buscarFragmentos(db, {
    seccion: "como-funciona",
    consulta: CONSULTA_CONDICIONES,
    limite: 1,
  });
  const condiciones = encontrados[0]?.texto?.trim() || null;
  if (!condiciones) faltan.push("las condiciones del turno (un fragmento de como-funciona)");

  const mapa = await enlaceDeTipo(db, "mapa");
  if (!mapa) faltan.push("el link del mapa (enlaces)");

  const partes = [cabeza];
  if (condiciones) partes.push(condiciones);
  if (mapa) partes.push(`📍 ${mapa.url}`);
  return { texto: partes.join("\n\n"), faltan };
}
