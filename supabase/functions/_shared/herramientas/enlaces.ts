// Links de la casa (tabla enlaces, que el dueño edita en Configuración › Enlaces).
//
// enlaces no tiene columna de tipo (0003, 0014): cada link se reconoce por su nombre, con la
// convención de abajo. Si el dueño renombra uno y deja de pegar, enviar_link lo devuelve como
// "no cargado" y tests/herramientas/enums.test.ts lo marca. Lo prolijo es una columna `tipo`
// con check: queda pedida a paneles.

import type { Db } from "../db.ts";
import type { TipoLink } from "../enums.ts";

export const NOMBRE_DEL_LINK: Record<TipoLink, RegExp> = {
  mapa: /^mapa\b/i,
  resena: /^rese(ñ|n)a\b/i,
  web: /^web\b.*\balquiler\b/i,
  "web-venta": /^web\b.*\bventa\b/i,
};

export type Enlace = { nombre: string; url: string };

export async function enlacesActivos(db: Db): Promise<Enlace[]> {
  const filas = await db.consulta<{ nombre: string; url: string }>(
    "select nombre, url from enlaces where activo order by nombre, id",
  );
  return filas.map((f) => ({ nombre: String(f.nombre), url: String(f.url) }));
}

export function enlacesDeTipo(enlaces: Enlace[], tipo: TipoLink): Enlace[] {
  return enlaces.filter((e) => NOMBRE_DEL_LINK[tipo].test(e.nombre.trim()));
}

export async function enlaceDeTipo(db: Db, tipo: TipoLink): Promise<Enlace | null> {
  return enlacesDeTipo(await enlacesActivos(db), tipo)[0] ?? null;
}
