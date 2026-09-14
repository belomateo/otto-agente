// anotar(texto) — una nota libre en la libreta del cliente (AGENTE.md § 4). Toca el mundo.
// Queda en notas con autor 'lucia', al lado de las que escribe el equipo.

import { AUTOR_LUCIA } from "../enums.ts";
import { type Herramienta, objeto } from "./tipos.ts";

type Args = { texto: string };

export const anotar: Herramienta<Args> = {
  nombre: "anotar",
  tipo: "accion",
  descripcion: "Anota en la libreta del cliente algo que conviene recordar y no entra en la ficha: una " +
    "preferencia, una duda, algo que contó del evento. Anotá en el mismo turno en que te enterás.",
  parametros: objeto({
    texto: { type: "string", minLength: 3, maxLength: 500, description: "La nota, corta y concreta." },
  }),
  async ejecutar(args, ctx) {
    const filas = await ctx.db.consulta(
      "insert into notas (cliente_id, autor, texto) values ($1::uuid, $2, $3) returning id::text as id",
      [ctx.cliente.id, AUTOR_LUCIA, args.texto.trim()],
    );
    return { ok: true, datos: { nota_id: String(filas[0]?.id), nota: "Anotado." } };
  },
};
