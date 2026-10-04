// El nombre del cliente que se puede usar para hablarle (saludo, lista del turno, plantillas), o
// null si no parece el nombre de una persona. La ficha arranca con el nombre del perfil de
// WhatsApp tal cual, y ahí hay de todo: en la revisión de las últimas 30 charlas (4/10) Lucía
// saludó «Buenas tardes, siempre te elijo» y salieron plantillas con «¡Hola Pichigodoy916!» y
// «¡Hola Siempre!». En la base queda el perfil como vino (el equipo lo ve en el panel); esto
// filtra al leerlo.

// Palabras que delatan una frase o un apodo de perfil, no un nombre. Sin "de", "del", "la" ni
// "los": aparecen en nombres de verdad ("María de los Ángeles").
const NO_SON_NOMBRE = new Set([
  "te", "me", "mi", "tu", "yo", "vos", "y", "que", "siempre", "nunca", "amor", "vida", "elijo", "dios",
  "feliz", "love", "bendecida", "bendecido", "familia", "tienda", "shop", "store", "oficial", "ventas",
]);

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function nombreUsable(crudo: string | null | undefined): string | null {
  // Fuera emojis y símbolos: «Solci🩷» es «Solci».
  const limpio = String(crudo ?? "").normalize("NFC").replace(/[^\p{L}\p{N}\s'.-]/gu, " ");
  const palabras = limpio.split(/\s+/)
    .map((p) => p.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((p) => p && !/^\d+$/.test(p)); // «Juan 10» es «Juan»
  if (palabras.length === 0 || palabras.length > 4) return null;
  if (palabras.some((p) => /\d/.test(p))) return null; // un usuario: «pichigodoy916»
  if (palabras.some((p) => NO_SON_NOMBRE.has(sinTildes(p)))) return null;
  const conLetras = palabras.filter((p) => (p.match(/\p{L}/gu) ?? []).length >= 2);
  if (conLetras.length === 0) return null; // «.», «C.», «🤍♥️🤍»
  return conLetras.join(" ");
}
