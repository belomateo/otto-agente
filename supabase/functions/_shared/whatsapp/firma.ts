// Verifica la firma X-Hub-Signature-256 que Meta manda en cada POST del webhook:
// HMAC-SHA256 de los bytes CRUDOS del cuerpo con el App Secret. Hay que firmar los bytes tal
// cual llegaron: re-serializar el JSON cambia el texto y rompe el hash.
const codificador = new TextEncoder();

// Compara dos secretos sin cortar en el primer carácter distinto: si cortara, el tiempo que
// tarda en decir "no" filtra cuántos caracteres acertó quien lo intenta, y eso se puede usar
// para adivinarlo de a un carácter por vez. Lo usan la firma de Meta y la cabecera
// x-worker-secret del worker y de cron-envios (auditoría del 16/9).
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

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
  return igualesEnTiempoConstante(esperada, recibida);
}
