// consultar_accesorios() — accesorios para completar el look (AGENTE.md § 4). Consulta.
// Precios de alquiler y de compra salen de accesorios_alquiler; las condiciones (qué se
// alquila, que se pueden comprar con descuento) salen de la sección accesorios.

import { textosDeSeccion } from "../conocimiento/busqueda.ts";
import { type Herramienta, objeto } from "./tipos.ts";

export const consultarAccesorios: Herramienta<Record<string, never>> = {
  nombre: "consultar_accesorios",
  tipo: "consulta",
  descripcion: "Devuelve los accesorios para completar el look (camisa, corbata, cinturón, zapatos) con su " +
    "precio de alquiler y, si está cargado, el de compra, más las condiciones de la sección accesorios. " +
    "Usala cuando el cliente pregunta por accesorios o al ofrecer el look completo, que se ofrece como look y " +
    "no como una lista de precios.",
  parametros: objeto({}),
  async ejecutar(_args, ctx) {
    const filas = await ctx.db.consulta(
      `select nombre, precio::float8 as precio, precio_compra::float8 as precio_compra
         from accesorios_alquiler where activo order by nombre, id`,
    );
    const accesorios = filas.map((f) => ({
      nombre: String(f.nombre),
      precio_alquiler: Number(f.precio),
      precio_compra: f.precio_compra === null ? null : Number(f.precio_compra),
    }));
    for (const a of accesorios) {
      ctx.traza.preciosDevueltos.push(a.precio_alquiler);
      if (a.precio_compra !== null) ctx.traza.preciosDevueltos.push(a.precio_compra);
    }
    const datos: Record<string, unknown> = {
      accesorios,
      condiciones: await textosDeSeccion(ctx.db, "accesorios"),
    };
    if (accesorios.length === 0) datos.nota = "No hay accesorios cargados: no des precios de accesorios.";
    return { ok: true, datos };
  },
};
