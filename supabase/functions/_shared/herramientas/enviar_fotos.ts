// enviar_fotos(modelo_ids[]) — fotos de hasta tres modelos (AGENTE.md § 4). Toca el mundo
// (le llega algo al cliente). Precondiciones en código: como mucho tres, y cada id existe en
// el catálogo, está activo y tiene fotos cargadas. Las imágenes las manda el turno (H1.7)
// desde los links de la ficha del modelo; el modelo nunca pega un link.

import { type Herramienta, objeto, rechazo } from "./tipos.ts";

type Args = { modelo_ids: string[] };

const MAXIMO_MODELOS = 3;

export const enviarFotos: Herramienta<Args> = {
  nombre: "enviar_fotos",
  tipo: "accion",
  descripcion: "Manda al cliente las fotos de hasta tres modelos del catálogo, con los id que devolvió " +
    "consultar_catalogo. Para recomendar, dos looks, no quince. Las fotos las manda el sistema: vos no pegues links.",
  parametros: objeto({
    modelo_ids: {
      type: "array",
      minItems: 1,
      maxItems: MAXIMO_MODELOS,
      items: { type: "string", format: "uuid" },
      description: "Los id de consultar_catalogo, hasta tres.",
    },
  }),
  async ejecutar(args, ctx) {
    const ids = [...new Set(args.modelo_ids.map((x) => x.toLowerCase()))];
    if (ids.length > MAXIMO_MODELOS) {
      return rechazo("mas_de_tres", `Como máximo ${MAXIMO_MODELOS} modelos por vez. Elegí los dos que mejor le van.`);
    }
    const filas = await ctx.db.consulta(
      "select id::text as id, modelo, fotos from catalogo_alquiler where activo and id = any($1::uuid[])",
      [ids],
    );
    const porId = new Map(filas.map((f) => [String(f.id), f]));
    const faltan = ids.filter((id) => !porId.has(id));
    if (faltan.length) {
      return rechazo("modelo_inexistente", `Estos id no están en el catálogo: ${faltan.join(", ")}. Usá los que devolvió consultar_catalogo.`);
    }
    const sinFotos = ids.filter((id) => !(Array.isArray(porId.get(id)?.fotos) && (porId.get(id)?.fotos as unknown[]).length));
    if (sinFotos.length) {
      const nombres = sinFotos.map((id) => String(porId.get(id)?.modelo)).join(", ");
      return rechazo("modelo_sin_fotos", `${nombres}: no tiene fotos cargadas. Describilo con tus palabras o elegí otro.`);
    }
    const imagenes = ids.map((id) => String((porId.get(id)?.fotos as unknown[])[0]));
    return {
      ok: true,
      datos: { enviadas: ids.map((id) => String(porId.get(id)?.modelo)), nota: "Las fotos salen solas, en mensajes aparte." },
      efectos: { imagenes },
    };
  },
};
