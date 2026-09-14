// ver_turnos_cliente() — los turnos que vienen del cliente (AGENTE.md § 4). Consulta.
// Los turnos ya llegan en el contexto del turno; esta herramienta es para después de crear,
// mover o cancelar uno en este mismo turno.

import { ESTADOS_QUE_LIBERAN } from "../enums.ts";
import { fechaLarga, horaLocal } from "../tiempo.ts";
import { type Herramienta, objeto } from "./tipos.ts";

export const verTurnosCliente: Herramienta<Record<string, never>> = {
  nombre: "ver_turnos_cliente",
  tipo: "consulta",
  descripcion: "Devuelve los turnos que vienen de este cliente, con su turno_id. Sus turnos ya te llegan en el " +
    "contexto: llamala solo si acabás de crear, mover o cancelar uno en este mismo turno.",
  parametros: objeto({}),
  async ejecutar(_args, ctx) {
    const filas = await ctx.db.consulta(
      `select id::text as id, tipo, inicio, estado, confirmado from turnos
        where cliente_id = $1::uuid and fin > $2::timestamptz and not (estado = any($3::text[]))
        order by inicio`,
      [ctx.cliente.id, ctx.ahora.toISOString(), [...ESTADOS_QUE_LIBERAN]],
    );
    const turnos = filas.map((f) => {
      const inicio = new Date(f.inicio as string);
      return {
        turno_id: String(f.id),
        tipo: String(f.tipo),
        dia: fechaLarga(inicio, ctx.tz),
        hora: horaLocal(inicio, ctx.tz),
        estado: String(f.estado),
        confirmado: Boolean(f.confirmado),
      };
    });
    ctx.traza.horasDevueltas.push(...turnos.map((t) => t.hora));
    return { ok: true, datos: { turnos } };
  },
};
