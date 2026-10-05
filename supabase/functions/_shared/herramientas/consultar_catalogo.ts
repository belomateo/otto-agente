// consultar_catalogo(modelo?) — el precio del alquiler (AGENTE.md § 4). Consulta.
// Todo precio que diga Lucía sale de acá (regla 8) y va con lo que incluye, que también sale
// de acá: la sección que-incluye de la base de conocimiento. Sin esa sección cargada no se da
// ningún precio.
//
// Pedido de Mateo, 5/10: Lucía ya no asesora sobre modelos. Si le mostraba al cliente qué hay y
// después en el local no estaba para su talle o su fecha, el problema lo tenía el equipo. Los
// modelos se ven en el catálogo online (enviar_link, tipo web) y la disponibilidad depende del
// talle y de la fecha del alquiler. Por eso esto ya no devuelve nombres, colores, talles ni
// fotos: solo el precio (o desde cuánto, si cambia según el modelo) y lo que incluye. Color y
// talle se fueron con eso: eran filtros para recomendar. `modelo` queda para "¿cuánto sale el
// smoking?".

import { accesoriosEn } from "../barandillas/accesorio_sin_herramienta.ts";
import { textosDeSeccion } from "../conocimiento/busqueda.ts";
import type { Db } from "../db.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

type Args = { modelo: string | null };

const NOTA_MODELOS = "Solo para el precio. Los modelos no los recomendás ni los describís: se ven en el catálogo online " +
  "(enviar_link, tipo web), y la disponibilidad depende del talle y de la fecha del alquiler; en la visita el equipo le " +
  "muestra lo que hay para su fecha.";

// precio_base 0 NO es un precio: es "todavía no lo cargaron". La columna es not null con check
// >= 0, así que 0 es lo que queda cuando se carga un modelo sin precio. Devolverlo tal cual hacía
// que Lucía le dijera "$0" a un cliente (red-team del 24/9).
async function preciosCargados(db: Db, modelo: string | null): Promise<{ filas: number; precios: number[] }> {
  const valores: unknown[] = [];
  let filtro = "";
  if (modelo) {
    // Varios modelos juntos ("Livorno, Smoking"): cualquiera de ellos (revisión del 4/10).
    const partes = modelo.split(/\s*(?:,|;|\/|\by\b|\bo\b)\s*/i).map((p) => p.trim()).filter(Boolean);
    const condiciones = partes.map((p) => {
      valores.push(p);
      return `immutable_unaccent(lower(modelo)) like '%' || immutable_unaccent(lower($${valores.length})) || '%'`;
    });
    if (condiciones.length) filtro = ` and (${condiciones.join(" or ")})`;
  }
  const filas = await db.consulta(`select precio_base::float8 as precio_base from catalogo_alquiler where activo${filtro}`, valores);
  const precios = [...new Set(filas.map((f) => Number(f.precio_base)).filter((p) => p > 0))].sort((a, b) => a - b);
  return { filas: filas.length, precios };
}

export const consultarCatalogo: Herramienta<Args> = {
  nombre: "consultar_catalogo",
  tipo: "consulta",
  descripcion: "Devuelve el precio del alquiler y qué incluye. Obligatoria antes de decir cualquier precio, que va " +
    "SIEMPRE junto con lo que incluye, en el mismo mensaje, dicho con tus palabras. No es para recomendar: no " +
    "describas, compares ni recomiendes modelos, colores o talles. Para ver los modelos mandá el catálogo online " +
    "(enviar_link, tipo web) y aclarale que la disponibilidad depende del talle y de la fecha del alquiler. Si " +
    "pregunta el precio de un modelo puntual, mandá `modelo` con su nombre o como lo describió.",
  parametros: objeto({
    modelo: {
      type: ["string", "null"],
      maxLength: 80,
      description: "Modelo por el que pregunta el precio, con sus palabras (varios, separados por coma), o null para el precio del alquiler en general.",
    },
  }),
  async ejecutar(args, ctx) {
    const queIncluye = await textosDeSeccion(ctx.db, "que-incluye");
    if (!queIncluye) {
      return rechazo(
        "falta_que_incluye",
        "Falta cargar qué incluye el precio (sección que-incluye) y sin eso no se da un precio. Si el cliente pide precio, derivá con motivo dato_no_encontrado.",
      );
    }
    const todos = await preciosCargados(ctx.db, null);
    if (todos.filas === 0) {
      return {
        ok: true,
        datos: {
          que_incluye: queIncluye,
          nota: "No hay ningún precio cargado todavía. No des precios: si el cliente pide el precio, derivá con motivo dato_no_encontrado.",
        },
      };
    }
    const modeloBuscado = limpio(args.modelo);
    const puntual = modeloBuscado ? await preciosCargados(ctx.db, modeloBuscado) : null;
    const sinCoincidencia = puntual !== null && puntual.filas === 0;
    const { precios } = puntual && !sinCoincidencia ? puntual : todos;

    // Solo los precios de verdad entran en la traza: es la lista contra la que la barandilla
    // precio_sin_herramienta chequea que Lucía no diga un número que no salió de acá.
    ctx.traza.preciosDevueltos.push(...precios);
    // Lo que incluye es texto de la casa: si nombra la camisa o los zapatos, Lucía los puede
    // repetir sin que accesorio_sin_herramienta la frene.
    ctx.traza.accesoriosDevueltos.push(...accesoriosEn(queIncluye));

    const datos: Record<string, unknown> = { que_incluye: queIncluye, nota: NOTA_MODELOS };
    if (precios.length === 1) {
      datos.precio = precios[0];
    } else if (precios.length > 1) {
      datos.precio_desde = precios[0];
      datos.precio_hasta = precios[precios.length - 1];
      datos.nota_precios = "El precio cambia según el modelo: decí desde cuánto sale; el de cada modelo lo confirma el equipo en el local.";
    } else {
      datos.nota_precios = "No hay precio cargado: NO des ningún precio ni digas que sale cero. Decí lo que incluye y que el precio lo confirma el equipo del local.";
    }
    if (sinCoincidencia) {
      datos.nota_modelo = `No hay un precio cargado con el nombre «${modeloBuscado}»: no digas que no lo tenemos ni lo cambies por otro modelo. ` +
        "Dale el precio del alquiler aclarando que el de ese modelo puntual se confirma en el local, y mandale el catálogo online.";
    }
    return { ok: true, datos };
  },
};
