// Reglas compartidas para subir una foto a Storage (Catálogo, H1.9; mostrador, decisión de
// Mateo 16/9): mismo tipo, mismo tamaño máximo y mismo nombre de archivo prolijo en los dos.
import 'server-only';

// Sin WebP: WhatsApp Business Cloud API solo acepta image/jpeg e image/png para
// mensajes de imagen (WebP es solo para stickers) — mostrador_enviar_foto lo rechaza
// (22023) después de subirlo, dejando un archivo huérfano en Storage. Mejor no ofrecerlo.
export const EXTENSION_FOTO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
export const TAMANO_MAXIMO_FOTO = 5 * 1024 * 1024;

export function nombreSeguroFoto(original: string, extension: string): string {
  const base = original
    .replace(/\.[^.]*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'foto'}.${extension}`;
}
