// consultar_catalogo(modelo?, accesorios) — el precio del alquiler y, si se pide, los accesorios
// (AGENTE.md § 4). Consulta. Desde el 9/10 absorbe a consultar_accesorios (pedido de Mateo: menos
// herramientas, cada una con más información): con accesorios=true devuelve también camisa,
// corbata, cinturón y zapatos con su precio de alquiler y de compra, y las condiciones.
// Todo precio que diga Lucía sale de acá (regla 8) y va con lo que incluye, que también sale
// de acá: la sección que-incluye de la base de conocimiento. Sin esa sección cargada no se da
// ningún precio.
//
// Pedido de Mateo, 5/10: Lucía ya no asesora sobre modelos. Si le mostraba al cliente qué hay y
// después en el local no estaba para su talle o su fecha, el problema lo tenía el equipo. Los
// modelos se ven en el catálogo online (enviar_link, tipo web) y la disponibilidad depende del
// talle y de la fecha del alquiler. Por eso esto ya no devuelve nombres, colores, talles ni
// fotos: solo desde cuánto arranca el alquiler ("a partir de", siempre) y lo que incluye. Color
// y talle se fueron con eso: eran filtros para recomendar. `modelo` queda para "¿cuánto sale el
// smoking?".

import { accesoriosEn } from "../barandillas/chequeos/accesorio_sin_herramienta.ts";
import { textosDeSeccion } from "../conocimiento/busqueda.ts";
import type { Db } from "../db.ts";
import { type ContextoHerramienta, type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

type Args = { modelo: string | null; accesorios: boolean | null };

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

// Lo que era consultar_accesorios: precios de alquiler y de compra de accesorios_alquiler, y las
// condiciones (qué se alquila, que se pueden comprar con descuento) de la sección accesorios.
async function datosDeAccesorios(ctx: ContextoHerramienta): Promise<Record<string, unknown>> {
  const filas = await ctx.db.consulta(
    `select nombre, precio::float8 as precio, precio_compra::float8 as precio_compra
       from accesorios_alquiler where activo order by nombre, id`,
  );
  const accesorios = filas.map((f) => ({
    nombre: String(f.nombre),
    precio_alquiler: Number(f.precio),
    precio_compra: f.precio_compra === null ? null : Number(f.precio_compra),
  }));
  const condiciones = await textosDeSeccion(ctx.db, "accesorios");
  for (const a of accesorios) {
    ctx.traza.preciosDevueltos.push(a.precio_alquiler);
    if (a.precio_compra !== null) ctx.traza.preciosDevueltos.push(a.precio_compra);
  }
  // Los accesorios que salieron de acá los puede nombrar (accesorio_sin_herramienta mira esto).
  ctx.traza.accesoriosDevueltos.push(...accesoriosEn([...accesorios.map((a) => a.nombre), condiciones ?? ""].join("\n")));
  const datos: Record<string, unknown> = { accesorios, condiciones_accesorios: condiciones };
  if (accesorios.length === 0) datos.nota_accesorios = "No hay accesorios cargados: no des precios de accesorios.";
  return datos;
}

export const consultarCatalogo: Herramienta<Args> = {
  nombre: "consultar_catalogo",
  tipo: "consulta",
  descripcion: "Devuelve desde cuánto arranca el alquiler y qué incluye. Obligatoria antes de decir cualquier precio, " +
    "que se dice siempre «a partir de» y va SIEMPRE junto con lo que incluye, en el mismo mensaje, dicho con tus " +
    "palabras. No es para recomendar: no " +
    "describas, compares ni recomiendes modelos, colores o talles. Para ver los modelos mandá el catálogo online " +
    "(enviar_link, tipo web) y aclarale que la disponibilidad depende del talle y de la fecha del alquiler. Si " +
    "pregunta el precio de un modelo puntual, mandá `modelo` con su nombre o como lo describió. Con accesorios=true " +
    "devuelve también los accesorios (camisa, corbata, cinturón, zapatos) con su precio de alquiler y de compra y sus " +
    "condiciones: pedilos cuando el cliente pregunta por accesorios o al ofrecer el look completo, que se ofrece como " +
    "look y no como una lista de precios. Si solo pregunta por accesorios, contestá solo eso.",
  parametros: objeto({
    modelo: {
      type: ["string", "null"],
      maxLength: 80,
      description: "Modelo por el que pregunta el precio, con sus palabras (varios, separados por coma), o null para el precio del alquiler en general.",
    },
    accesorios: {
      type: ["boolean", "null"],
      description: "true si pregunta por camisa, corbata, cinturón o zapatos, o si estás ofreciendo el look completo; si no, null.",
    },
  }),
  async ejecutar(args, ctx) {
    const acc = args.accesorios ? await datosDeAccesorios(ctx) : {};
    const queIncluye = await textosDeSeccion(ctx.db, "que-incluye");
    if (!queIncluye) {
      if (args.accesorios) {
        return { ok: true, datos: { ...acc, nota_alquiler: "Falta cargar qué incluye el precio del alquiler: no des el precio del traje. Si lo pide, derivá con motivo dato_no_encontrado." } };
      }
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
          ...acc,
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

    // Mateo, 5/10: el precio se dice siempre "a partir de". El equipo le habló a un cliente de
    // precios más altos que los cargados y no hay respuesta todavía: el piso es lo único seguro.
    const datos: Record<string, unknown> = { que_incluye: queIncluye, nota: NOTA_MODELOS, ...acc };
    if (precios.length) {
      datos.precio_desde = precios[0];
      datos.nota_precios = "Decí que el alquiler es a partir de ese precio («a partir de» o «desde»), nunca como un precio " +
        "cerrado: el de cada modelo se ve en la visita, según el que elija.";
    } else {
      datos.nota_precios = "No hay precio cargado: NO des ningún precio ni digas que sale cero. Decí lo que incluye y que el precio depende del modelo y se ve en la visita.";
    }
    if (sinCoincidencia) {
      datos.nota_modelo = `No hay un precio cargado con el nombre «${modeloBuscado}»: no digas que no lo tenemos ni lo cambies por otro modelo. ` +
        "Decile desde cuánto arranca el alquiler, aclarando que el de ese modelo puntual se confirma en el local, y mandale el catálogo online.";
    }
    return { ok: true, datos };
  },
};
