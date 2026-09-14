// Derivar a una persona, en código. Lo usan derivar_a_persona (cuando decide el modelo) y las
// derivaciones duras que decide el código sin preguntarle al modelo (AGENTE.md § 2 y § 10).
//
// Evento hoy o mañana (decisión #8 de Mateo, 14/9): un alquiler con el evento hoy o mañana lo
// resuelve una persona. Se cuenta con la fecha de Argentina (NEGOCIO_TZ, supuesto #23): hoy o
// el día siguiente derivan siempre; desde pasado mañana sigue el camino normal. Se deriva con
// motivo evento_inminente y un texto fijo que nunca dice que no, guardado en contexto_agente
// (clave texto_evento_inminente) para que el dueño lo edite en Configuración › Lucía.

import type { Db } from "../db.ts";
import type { MotivoDerivacion } from "../enums.ts";
import { fechaLocal, sumarDias } from "../tiempo.ts";
import type { ContextoHerramienta, Efectos } from "./tipos.ts";

export const CLAVE_TEXTO_EVENTO_INMINENTE = "texto_evento_inminente";

// Crea la fila en derivaciones (o reusa la pendiente de esta charla) y deja la conversación
// derivada: Lucía no contesta hasta que alguien la devuelva desde el panel.
export async function registrarDerivacion(
  ctx: ContextoHerramienta,
  motivo: MotivoDerivacion,
): Promise<{ id: string; yaEstaba: boolean }> {
  const previa = await ctx.db.consulta(
    `select id::text as id from derivaciones
      where conversacion_id = $1::uuid and estado = 'pendiente' order by creado_at limit 1`,
    [ctx.conversacionId],
  );
  let id = previa[0] ? String(previa[0].id) : null;
  if (!id) {
    const filas = await ctx.db.consulta(
      "insert into derivaciones (conversacion_id, motivo, destino_tel) values ($1::uuid, $2, $3) returning id::text as id",
      [ctx.conversacionId, motivo, ctx.derivacionTel ?? null],
    );
    id = String(filas[0].id);
  }
  await ctx.db.consulta(
    "update conversaciones set estado = 'derivada' where id = $1::uuid and estado <> 'derivada'",
    [ctx.conversacionId],
  );
  return { id, yaEstaba: previa.length > 0 };
}

export function esEventoInminente(fechaEvento: string | null, ahora: Date, tz: string): boolean {
  if (!fechaEvento) return false;
  const hoy = fechaLocal(ahora, tz);
  return fechaEvento >= hoy && fechaEvento <= sumarDias(hoy, 1);
}

export async function textoDeContexto(db: Db, clave: string): Promise<string | null> {
  const filas = await db.consulta("select valor from contexto_agente where clave = $1", [clave]);
  const valor = filas[0] ? String(filas[0].valor).trim() : "";
  return valor === "" ? null : valor;
}

// La derivación dura por evento inminente, lista para devolver desde una herramienta. El
// modelo ve que ya se derivó; el texto fijo y el aviso al equipo los manda el turno.
export async function derivarPorEventoInminente(
  ctx: ContextoHerramienta,
): Promise<{ ok: true; datos: Record<string, unknown>; efectos: Efectos }> {
  const { id, yaEstaba } = await registrarDerivacion(ctx, "evento_inminente");
  const texto = await textoDeContexto(ctx.db, CLAVE_TEXTO_EVENTO_INMINENTE);
  const datos: Record<string, unknown> = {
    derivar: "evento_inminente",
    derivacion_id: id,
    nota: "El evento es hoy o mañana: lo resuelve una persona del equipo y el aviso al cliente sale solo. No ofrezcas turnos ni escribas nada más.",
  };
  if (yaEstaba) datos.ya_estaba_derivada = true;
  if (!texto) datos.falta = `el texto fijo de esta derivación (${CLAVE_TEXTO_EVENTO_INMINENTE} en contexto_agente)`;
  return {
    ok: true,
    datos,
    efectos: {
      cortaTurno: true,
      mensajesAlCliente: texto ? [texto] : [],
      avisoEquipo: { motivo: "evento_inminente", derivacionId: id },
    },
  };
}
