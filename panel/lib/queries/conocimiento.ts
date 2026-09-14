// Conocimiento (H1.8): los fragmentos agrupados por tema (los 16 de AGENTE.md § 8, también
// los que todavía no tienen ninguno, para que se vea qué falta cargar) y el buscador
// "Probá cómo lo encontraría un cliente". Cada fragmento trae la forma de los mocks
// (`fragmentos` de lib/mock-data.ts: t, txt, v, on) más id y versión para editarlo.
//
// El buscador es PROVISORIO: tiene que usar la misma consulta que buscar_informacion de
// Lucía (agente, H1.4/H1.6), que todavía no existe. Hasta Fase 2 hace una búsqueda de texto
// completo en español sin tildes (como el índice de 0005) con cualquiera de las palabras, y
// ordena por cuántas palabras de la consulta aparecen.
import 'server-only';
import { ETIQUETA_TEMA } from '@/lib/etiquetas';
import { etiquetaVersion } from '@/lib/formato';
import { normalizar, type ClienteDb } from './comun';

export type FilaFragmento = {
  t: string;
  txt: string;
  v: string;
  on: boolean;
  id: string;
  tema: string;
  version: number;
  editado_por: string | null;
  editado_at: string;
};
export type SeccionConocimiento = { tema: string; titulo: string; n: number; fragmentos: FilaFragmento[] };

export async function listarFragmentos(db: ClienteDb): Promise<{ secciones: SeccionConocimiento[]; total: number }> {
  const { data, error } = await db
    .from('fragmentos')
    .select('id, tema, titulo, texto, activo, version, editado_por, editado_at')
    .order('tema', { ascending: true })
    .order('titulo', { ascending: true });
  if (error) throw error;

  const porTema = new Map<string, FilaFragmento[]>(Object.keys(ETIQUETA_TEMA).map((t) => [t, []]));
  for (const f of data ?? []) {
    const fila: FilaFragmento = {
      t: f.titulo,
      txt: f.texto,
      v: etiquetaVersion(f.version, f.editado_at),
      on: f.activo,
      id: f.id,
      tema: f.tema,
      version: f.version,
      editado_por: f.editado_por,
      editado_at: f.editado_at,
    };
    if (!porTema.has(f.tema)) porTema.set(f.tema, []);
    porTema.get(f.tema)!.push(fila);
  }
  const secciones = [...porTema].map(([tema, fragmentos]) => ({
    tema,
    titulo: ETIQUETA_TEMA[tema] ?? tema,
    n: fragmentos.length,
    fragmentos,
  }));
  return { secciones, total: data?.length ?? 0 };
}

export type ResultadoBusqueda = { id: string; tema: string; titulo: string; extracto: string; activo: boolean; coincidencias: number };

// Palabras de menos de 3 letras ("q", "de", "la") no aportan: el diccionario español del
// índice ya las descarta.
const MINIMO_LETRAS = 3;

export async function probarBusqueda(
  db: ClienteDb,
  consulta: string
): Promise<{ consulta: string; resultados: ResultadoBusqueda[]; provisoria: true }> {
  const palabras = [...new Set(normalizar(consulta).split(/[^a-z0-9]+/).filter((p) => p.length >= MINIMO_LETRAS))];
  if (palabras.length === 0) return { consulta, resultados: [], provisoria: true };

  const { data, error } = await db
    .from('fragmentos')
    .select('id, tema, titulo, texto, activo')
    .textSearch('busqueda', palabras.join(' or '), { config: 'spanish', type: 'websearch' })
    .limit(50);
  if (error) throw error;

  // Raíz aproximada (las primeras 4 letras) para contar "sena" en "seña", "pagar" en "paga".
  const raices = palabras.map((p) => p.slice(0, 4));
  const resultados = (data ?? [])
    .map((f) => {
      const cuerpo = normalizar(`${f.titulo} ${f.texto}`);
      return {
        id: f.id,
        tema: f.tema,
        titulo: f.titulo,
        extracto: f.texto.length > 160 ? `${f.texto.slice(0, 160)}…` : f.texto,
        activo: f.activo,
        coincidencias: raices.filter((r) => cuerpo.includes(r)).length,
      };
    })
    .sort((a, b) => Number(b.activo) - Number(a.activo) || b.coincidencias - a.coincidencias);
  return { consulta, resultados, provisoria: true };
}
