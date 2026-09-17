// Bajar una foto del bucket `adjuntos`, que es privado (0008). Ahí van las fotos que sube el
// equipo desde el panel para mandarle a un cliente (0048): la de un traje con un arreglo, la del
// cliente probándose. El bucket es privado a propósito y así se queda; el worker las baja con la
// clave de servicio, que ya tiene, y de ahí van a /media de WhatsApp.
//
// El tipo de archivo no se toma de lo que conteste Storage sino del que validó la base al
// encolar el trabajo (jpg o png, nada más): es el que Meta va a ver en el multipart.
export type Adjuntos = { base: string; clave: string };

export async function bajarAdjunto(
  a: Adjuntos,
  ruta: string,
  mime: string,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  if (!a.base || !a.clave) throw new Error("falta la configuración para leer los adjuntos");
  const url = a.base + ruta.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  const res = await fetcher(url, { headers: { Authorization: `Bearer ${a.clave}`, apikey: a.clave } });
  if (!res.ok) throw new Error(`no se pudo bajar la foto del bucket (${res.status})`);
  return new Blob([await res.arrayBuffer()], { type: mime });
}

// El nombre con que viaja a Meta: solo el último tramo de la ruta, que es lo único que le importa.
export const nombreDeArchivo = (ruta: string) => ruta.split("/").pop() || "foto";
