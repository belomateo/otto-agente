// Catálogo (H1.8): modelos (forma de `ModeloCatalogo` de lib/mock-data.ts) y accesorios
// (forma de `accesorios`), más los datos crudos para editarlos (H1.9).
import 'server-only';
import type { ModeloCatalogo } from '@/lib/mock-data';
import type { Json } from '@/lib/tipos-db';
import { plata } from '@/lib/formato';
import type { ClienteDb } from './comun';

export type Color = { nombre: string; hex: string | null };
export type FilaModelo = ModeloCatalogo & {
  id: string;
  version: number;
  modelo: string;
  precio_base: number;
  descripcion: string | null;
  colores: Color[];
  talles_lista: string[];
  fotos: string[];
  editado_por: string | null;
  editado_at: string;
  /** Prioridad con la que Lucía recomienda: 1 pesa más (0044, decisión de Mateo). */
  orden: number;
};
export type FilaAccesorio = {
  n: string;
  alq: string;
  compra: string;
  id: string;
  version: number;
  precio: number;
  precio_compra: number | null;
  activo: boolean;
};

// Color neutro para un color cargado sin hex (el punto se dibuja igual).
const SIN_HEX = '#C9C4B9';

function leerColores(v: Json): Color[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) =>
    c && typeof c === 'object' && !Array.isArray(c) && typeof c.nombre === 'string'
      ? [{ nombre: c.nombre, hex: typeof c.hex === 'string' ? c.hex : null }]
      : []
  );
}

/** '44–60' si los talles son números; si no, el primero y el último cargados. */
function rangoTalles(t: string[]): string {
  if (t.length === 0) return '';
  const numeros = t.map(Number);
  if (numeros.every((n) => Number.isFinite(n))) {
    const [min, max] = [Math.min(...numeros), Math.max(...numeros)];
    return min === max ? String(min) : `${min}–${max}`;
  }
  return t.length === 1 ? t[0] : `${t[0]}–${t[t.length - 1]}`;
}

export async function obtenerCatalogo(db: ClienteDb): Promise<{ modelos: FilaModelo[]; accesorios: FilaAccesorio[] }> {
  const [modelos, accesorios] = await Promise.all([
    db
      .from('catalogo_alquiler')
      .select('id, modelo, precio_base, descripcion, colores, talles, fotos, activo, version, editado_por, editado_at, orden')
      .order('orden', { ascending: true }),
    db
      .from('accesorios_alquiler')
      .select('id, nombre, precio, precio_compra, activo, version')
      .order('nombre', { ascending: true }),
  ]);
  if (modelos.error) throw modelos.error;
  if (accesorios.error) throw accesorios.error;

  return {
    modelos: (modelos.data ?? []).map((m) => {
      const colores = leerColores(m.colores);
      return {
        id: m.id,
        version: m.version,
        modelo: m.modelo,
        precio_base: m.precio_base,
        descripcion: m.descripcion,
        colores,
        talles_lista: m.talles,
        fotos: m.fotos,
        editado_por: m.editado_por,
        editado_at: m.editado_at,
        orden: m.orden,
        n: m.modelo,
        p: plata(m.precio_base),
        talles: rangoTalles(m.talles),
        foto: m.fotos[0] ?? '',
        dots: colores.map((c) => c.hex ?? SIN_HEX),
        on: m.activo,
        off: !m.activo,
      };
    }),
    accesorios: (accesorios.data ?? []).map((a) => ({
      id: a.id,
      version: a.version,
      precio: a.precio,
      precio_compra: a.precio_compra,
      activo: a.activo,
      n: a.nombre,
      alq: plata(a.precio),
      compra: plata(a.precio_compra),
    })),
  };
}
