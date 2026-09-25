// consultar_catalogo(modelo?, color?, talle?) — modelos de alquiler (AGENTE.md § 4). Consulta.
// Todo precio que diga Lucía sale de acá (regla 8) y va con lo que incluye, que también sale
// de acá: la sección que-incluye de la base de conocimiento. Sin esa sección cargada no se da
// ningún precio. El catálogo no tiene evento (paneles 0016): se filtra por modelo, color y talle.
//
// Decisión de Mateo, 16/9 (pedido b): antes siempre traía hasta 10 modelos, aunque el cliente
// preguntara por uno solo. Ahora, si el cliente pregunta por un modelo puntual (lo nombra, o
// pide "el que vimos recién"), mandá `modelo` con esas palabras: filtra a esa prenda sola, no al
// catálogo entero. Sin `modelo` (recomendando sin que pidan algo puntual) sigue trayendo varios,
// ordenados por `orden` (columna de paneles: 1 pesa más que 2, y así — pedido c), para que Lucía
// respete esa prioridad al recomendar. La prioridad se rompe justamente cuando hay `modelo`: ahí
// importa la coincidencia, no el orden.

import { accesoriosEn } from "../barandillas/accesorio_sin_herramienta.ts";
import { textosDeSeccion } from "../conocimiento/busqueda.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

type Args = { modelo: string | null; color: string | null; talle: string | null };

const MAXIMO_MODELOS = 10;

function nombresDeColores(colores: unknown): string[] {
  if (!Array.isArray(colores)) return [];
  return colores.map((c) => String((c as { nombre?: unknown })?.nombre ?? "").trim()).filter(Boolean);
}

export const consultarCatalogo: Herramienta<Args> = {
  nombre: "consultar_catalogo",
  tipo: "consulta",
  descripcion: "Devuelve los modelos de alquiler cargados: nombre, descripción, colores, talles, precio base y " +
    "si tienen fotos. Obligatoria antes de decir cualquier precio o describir un modelo. Devuelve también qué " +
    "incluye el precio: eso va SIEMPRE junto con el precio, en el mismo mensaje, dicho con tus palabras. Si el " +
    "cliente pregunta por un modelo puntual, mandá `modelo` con su nombre o como lo describió: te trae solo esa " +
    "prenda, no el catálogo entero. Filtrá por color o talle solo si el cliente lo dijo. Si lo que busca no " +
    "aparece, no está cargado: no lo aproximes.",
  parametros: objeto({
    modelo: { type: ["string", "null"], maxLength: 60, description: "Modelo puntual que preguntó el cliente, con sus palabras, o null si está mirando opciones en general." },
    color: { type: ["string", "null"], maxLength: 40, description: "Color que pidió el cliente, o null." },
    talle: { type: ["string", "null"], maxLength: 10, description: "Talle que dijo el cliente, o null." },
  }),
  async ejecutar(args, ctx) {
    const queIncluye = await textosDeSeccion(ctx.db, "que-incluye");
    if (!queIncluye) {
      return rechazo(
        "falta_que_incluye",
        "Falta cargar qué incluye el precio (sección que-incluye) y sin eso no se da un precio. Si el cliente pide precio, derivá con motivo dato_no_encontrado.",
      );
    }
    const filtros = ["activo"];
    const valores: unknown[] = [];
    const modeloBuscado = limpio(args.modelo);
    const color = limpio(args.color);
    const talle = limpio(args.talle);
    if (modeloBuscado) {
      valores.push(modeloBuscado);
      filtros.push(`immutable_unaccent(lower(modelo)) like '%' || immutable_unaccent(lower($${valores.length})) || '%'`);
    }
    if (color) {
      valores.push(color);
      filtros.push(
        `exists (select 1 from jsonb_array_elements(colores) c
                  where immutable_unaccent(lower(c->>'nombre')) like '%' || immutable_unaccent(lower($${valores.length})) || '%')`,
      );
    }
    if (talle) {
      valores.push(talle);
      filtros.push(`exists (select 1 from unnest(talles) t where lower(t) = lower($${valores.length}))`);
    }
    const filas = await ctx.db.consulta(
      `select id::text as id, modelo, descripcion, colores, talles, precio_base::float8 as precio_base,
              coalesce(cardinality(fotos), 0) as fotos
         from catalogo_alquiler where ${filtros.join(" and ")}
        order by orden, precio_base, modelo limit ${MAXIMO_MODELOS}`,
      valores,
    );
    const total = Number((await ctx.db.consulta("select count(*)::int as n from catalogo_alquiler where activo"))[0]?.n ?? 0);
    const modelos = filas.map((f) => ({
      id: String(f.id),
      modelo: String(f.modelo),
      descripcion: f.descripcion === null ? null : String(f.descripcion),
      colores: nombresDeColores(f.colores),
      talles: Array.isArray(f.talles) ? f.talles.map(String) : [],
      // precio_base 0 NO es un precio: es "todavía no lo cargaron". La columna es not null con
      // check >= 0, así que no hay forma de dejarla vacía y 0 es lo que queda cuando se carga un
      // modelo sin precio. Devolverlo tal cual hacía que Lucía le dijera "$0" a un cliente — pasó
      // en el red-team del 24/9, y el propio seed lo había advertido por escrito
      // (seeds/catalogo_alquiler.sql:9-12) antes de que alguien activara los cinco modelos en 0.
      precio_base: Number(f.precio_base) > 0 ? Number(f.precio_base) : null,
      tiene_fotos: Number(f.fotos) > 0,
    }));
    // Solo los precios de verdad entran en la traza: es la lista contra la que la barandilla
    // precio_sin_herramienta chequea que Lucía no diga un número que no salió de acá. Meter el 0
    // sería autorizarla a decirlo.
    ctx.traza.preciosDevueltos.push(...modelos.map((m) => m.precio_base).filter((p): p is number => p !== null));
    // Lo que incluye (y las descripciones) son textos de la casa: si nombran la camisa o los
    // zapatos, Lucía los puede repetir sin que accesorio_sin_herramienta la frene.
    ctx.traza.accesoriosDevueltos.push(...accesoriosEn([queIncluye, ...modelos.map((m) => m.descripcion ?? "")].join("\n")));
    const sinPrecio = modelos.filter((m) => m.precio_base === null).length;
    const datos: Record<string, unknown> = { modelos, que_incluye: queIncluye, modelos_cargados_en_total: total };
    if (sinPrecio > 0) {
      datos.nota_precios = sinPrecio === modelos.length
        ? "Ningún modelo tiene el precio cargado (precio_base en null). NO des ningún precio ni digas que sale cero: contá el modelo y lo que incluye, y decí que el precio lo confirma el equipo del local."
        : "Algunos modelos vienen con precio_base en null: de esos NO des precio ni digas que salen cero, decí que lo confirma el equipo del local.";
    }
    if (modelos.length === 0) {
      datos.nota = total === 0
        ? "No hay ningún modelo cargado todavía. No des precios ni describas modelos: si el cliente los pide, derivá con motivo dato_no_encontrado."
        : "Con ese modelo, color o talle no hay nada cargado. Decilo sin un «no» a secas y ofrecé lo que sí hay (consultá sin filtros).";
    }
    return { ok: true, datos };
  },
};
