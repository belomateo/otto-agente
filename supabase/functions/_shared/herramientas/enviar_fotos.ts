// enviar_fotos(modelo_ids[]) — fotos de hasta tres modelos (AGENTE.md § 4). Toca el mundo
// (le llega algo al cliente). Precondiciones en código: como mucho tres, y cada id existe en
// el catálogo, está activo y tiene fotos cargadas. Las imágenes las manda el turno (H1.7)
// desde los links de la ficha del modelo; el modelo nunca pega un link.

import { type Herramienta, objeto, rechazo } from "./tipos.ts";

type Args = { modelo_ids: string[]; color?: string | null };

const MAXIMO_MODELOS = 3;

const comparable = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// La foto del color pedido (revisión del 4/10: a un cliente que pidió gris le recomendó el Ambo
// Tech gris medio y le mandó la foto del azul oscuro, porque siempre salía la primera). Primero
// por el nombre del archivo ("..._gris-medio_..."); si no, por posición: las fotos se cargan en el
// mismo orden que los colores. Sin color o sin coincidencia, la primera.
export function fotoDelColor(fotos: string[], colores: string[], color: string | null | undefined): string {
  const buscado = comparable(color ?? "");
  if (!buscado || fotos.length < 2) return fotos[0];
  const porArchivo = fotos.find((f) => comparable(f.split("/").pop() ?? "").includes(buscado));
  if (porArchivo) return porArchivo;
  const i = colores.findIndex((c) => comparable(c).includes(buscado) || buscado.includes(comparable(c)));
  return i >= 0 && i < fotos.length ? fotos[i] : fotos[0];
}

export const enviarFotos: Herramienta<Args> = {
  nombre: "enviar_fotos",
  tipo: "accion",
  descripcion: "Manda al cliente las fotos de hasta tres modelos del catálogo, con los id que devolvió " +
    "consultar_catalogo. Para recomendar, dos looks, no quince. Si el cliente pidió un color, mandalo en color: " +
    "sale la foto de ese color. Las fotos las manda el sistema: vos no pegues links.",
  parametros: objeto({
    modelo_ids: {
      type: "array",
      minItems: 1,
      maxItems: MAXIMO_MODELOS,
      items: { type: "string", format: "uuid" },
      description: "Los id de consultar_catalogo, hasta tres.",
    },
    color: { type: ["string", "null"], maxLength: 40, description: "El color que pidió o que le recomendaste, o null." },
  }),
  async ejecutar(args, ctx) {
    const ids = [...new Set(args.modelo_ids.map((x) => x.toLowerCase()))];
    if (ids.length > MAXIMO_MODELOS) {
      return rechazo("mas_de_tres", `Como máximo ${MAXIMO_MODELOS} modelos por vez. Elegí los dos que mejor le van.`);
    }
    const filas = await ctx.db.consulta(
      "select id::text as id, modelo, fotos, colores from catalogo_alquiler where activo and id = any($1::uuid[])",
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
    const imagenes = ids.map((id) => {
      const fila = porId.get(id);
      const colores = Array.isArray(fila?.colores) ? (fila.colores as { nombre?: unknown }[]).map((c) => String(c?.nombre ?? "")) : [];
      return fotoDelColor((fila?.fotos as unknown[]).map(String), colores, args.color);
    });
    return {
      ok: true,
      datos: { enviadas: ids.map((id) => String(porId.get(id)?.modelo)), nota: "Las fotos salen solas, en mensajes aparte." },
      efectos: { imagenes },
    };
  },
};
