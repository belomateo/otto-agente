// Verifica la firma X-Hub-Signature-256 que Meta manda en cada POST del webhook:
// HMAC-SHA256 de los bytes CRUDOS del cuerpo con el App Secret. Hay que firmar los bytes tal
// cual llegaron: re-serializar el JSON cambia el texto y rompe el hash.
const codificador = new TextEncoder();

export async function firmaValida(
  cuerpo: Uint8Array<ArrayBuffer>,
  cabecera: string | null,
  secreto: string,
): Promise<boolean> {
  if (!secreto || !cabecera?.startsWith("sha256=")) return false;
  const clave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", clave, cuerpo));
  const esperada = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const recibida = cabecera.slice("sha256=".length).toLowerCase();
  if (recibida.length !== esperada.length) return false;
  // Comparación en tiempo constante: no cortar en el primer carácter distinto.
  let diferencia = 0;
  for (let i = 0; i < esperada.length; i++) {
    diferencia |= esperada.charCodeAt(i) ^ recibida.charCodeAt(i);
  }
  return diferencia === 0;
}
