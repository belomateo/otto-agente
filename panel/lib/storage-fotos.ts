// Reglas compartidas para subir una foto a Storage (Catálogo, H1.9; mostrador, decisión de
// Mateo 16/9): mismo tipo, mismo tamaño máximo y mismo nombre de archivo prolijo en los dos.
import 'server-only';

export const EXTENSION_FOTO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
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
