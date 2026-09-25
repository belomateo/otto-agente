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
export const CLAVE_TEXTO_DERIVACION_DURA_GENERICA = "texto_derivacion_dura_generica";
export const CLAVE_TEXTO_DERIVACION_RECLAMO = "texto_derivacion_reclamo";
export const CLAVE_TEXTO_DERIVACION_FALLO = "texto_derivacion_fallo";
// corporativo: la regla 12 pide juntar cinco datos (cuántas personas, rubro, prendas actuales,
// logo, proveedor) ANTES de que el equipo llame. Pero corporativo/uniforme son derivación dura
// por palabra clave, que corre ANTES del modelo y corta el turno: Lucía nunca llegaba a preguntar
// nada y el equipo recibía el contacto en blanco (red-team del 24/9, reproducido 2/2).
// La salida no es sacar el freno —perderíamos la garantía de que el contacto llegue— sino que el
// mensaje del traspaso haga ya la primera pregunta. De ahí en adelante la charla queda 'derivada'
// pero Lucía SIGUE contestando (corporativo no está en MOTIVOS_DE_SILENCIO_DERIVADA), así que
// junta los otros cuatro datos en los turnos siguientes y el equipo los lee en la charla.
export const CLAVE_TEXTO_DERIVACION_CORPORATIVO = "texto_derivacion_corporativo";

// Respaldos en código (hallazgo de logica, 19/9, auditando la entrega de "ninguna derivación
// queda muda"): los 4 textos de arriba salen de contexto_agente, editables desde el panel sin
// redeploy — pero si el dueño deja una fila en blanco (por error, o mientras la edita), no puede
// volver el silencio que se acaba de cerrar. Un texto viejo, aunque quede desactualizado
// respecto de lo que se esté editando, es infinitamente mejor que nada. Solo para textos de
// DERIVACIÓN: texto_mensaje_no_soportado y el resto de contexto_agente no lo necesitan (ahí un
// texto vacío no deja a nadie mudo del todo — como mucho, sin ese aviso puntual).
const RESPALDOS = {
  [CLAVE_TEXTO_EVENTO_INMINENTE]:
    "Te paso con un asesor del local para que te ayude con tu evento, y vamos a hacer lo posible por encontrarte un lugar en la agenda.",
  [CLAVE_TEXTO_DERIVACION_DURA_GENERICA]: "Te paso con alguien del equipo para que te ayude con esto. En un rato te escriben.",
  [CLAVE_TEXTO_DERIVACION_RECLAMO]: "Te leo. Esto lo sigue alguien del local: en un rato te escriben.",
  [CLAVE_TEXTO_DERIVACION_FALLO]: "Se me complicó de este lado. Ya avisé a alguien del local y en un rato te escriben.",
  [CLAVE_TEXTO_DERIVACION_CORPORATIVO]:
    "Los pedidos para empresas y uniformes los sigue un equipo aparte de Mr Otto, y ya les avisé. Para que te contacten con todo listo, ¿para cuántas personas sería?",
} as const;

export type ClaveDerivacion = keyof typeof RESPALDOS;

// Como textoDeContexto, pero nunca null: si la fila está vacía o no existe, cae al respaldo de
// código. usoRespaldo queda para que quien llama pueda dejar rastro (datos.falta) de que hay una
// fila de contexto_agente para revisar, sin que eso le impida al cliente recibir algo.
export async function textoDeDerivacion(db: Db, clave: ClaveDerivacion): Promise<{ texto: string; usoRespaldo: boolean }> {
  const real = await textoDeContexto(db, clave);
  return real ? { texto: real, usoRespaldo: false } : { texto: RESPALDOS[clave], usoRespaldo: true };
}

// Lo mínimo que hace falta para derivar: una herramienta ya tiene todo esto en su
// ContextoHerramienta (lo satisface sin cast, por estructura); el turno (turno.ts), que deriva
// desde afuera de cualquier herramienta, arma este objeto más chico a mano.
export type ContextoDerivacion = { db: Db; conversacionId: string; derivacionTel?: string | null };

// Crea la fila en derivaciones (o reusa la pendiente de esta charla) y deja la conversación
// derivada: Lucía no contesta hasta que alguien la devuelva desde el panel.
export async function registrarDerivacion(
  ctx: ContextoDerivacion,
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
  const { texto, usoRespaldo } = await textoDeDerivacion(ctx.db, CLAVE_TEXTO_EVENTO_INMINENTE);
  const datos: Record<string, unknown> = {
    derivar: "evento_inminente",
    derivacion_id: id,
    nota: "El evento es hoy o mañana: lo resuelve una persona del equipo y el aviso al cliente sale solo. No ofrezcas turnos ni escribas nada más.",
  };
  if (yaEstaba) datos.ya_estaba_derivada = true;
  if (usoRespaldo) datos.falta = `la fila de contexto_agente de esta derivación (${CLAVE_TEXTO_EVENTO_INMINENTE}) está vacía: se usó el respaldo de código`;
  return {
    ok: true,
    datos,
    efectos: {
      cortaTurno: true,
      mensajesAlCliente: [texto],
      avisoEquipo: { motivo: "evento_inminente", derivacionId: id },
    },
  };
}
