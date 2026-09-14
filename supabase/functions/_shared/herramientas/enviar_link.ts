// enviar_link(tipo) — un link de la casa (AGENTE.md § 4). Toca el mundo (le llega algo al
// cliente). tipo ∈ {mapa, resena, web}, validado contra el schema; el link sale de la tabla
// enlaces (ver enlaces.ts) y lo manda el turno. Nunca links de pago (regla 4).

import { TIPOS_LINK, type TipoLink } from "../enums.ts";
import { enlaceDeTipo } from "./enlaces.ts";
import { type Herramienta, objeto, rechazo } from "./tipos.ts";

type Args = { tipo: TipoLink };

export const enviarLink: Herramienta<Args> = {
  nombre: "enviar_link",
  tipo: "accion",
  descripcion: "Manda un link de la casa: mapa (cómo llegar al local), resena (para dejar una reseña en Google) " +
    "o web. Nunca links de pago. El link lo manda el sistema: vos no lo escribas.",
  parametros: objeto({
    tipo: { type: "string", enum: [...TIPOS_LINK], description: "mapa, resena o web." },
  }),
  async ejecutar(args, ctx) {
    const enlace = await enlaceDeTipo(ctx.db, args.tipo);
    if (!enlace) {
      return rechazo(
        "link_no_cargado",
        `El link de ${args.tipo} no está cargado. Seguí sin él; si el cliente lo necesita, derivá con motivo dato_no_encontrado.`,
      );
    }
    return {
      ok: true,
      datos: { tipo: args.tipo, nota: "El link sale solo, en un mensaje aparte." },
      efectos: { mensajesAlCliente: [enlace.url] },
    };
  },
};
