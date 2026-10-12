import 'server-only';
import type { Sesion } from '@/lib/api/sesion';
import { dolares, fechaEnZona, hora } from '@/lib/formato';
import { faltaLaTabla } from './bloqueos';
import type { ClienteDb } from './comun';

// Las tablas del corrector (0104) no están en los tipos generados de Supabase: se aplicaron en
// producción pero los tipos no se regeneraron. Las consultas pasan por type assertions hasta que
// se regeneren (es seguro: la RLS de 0104 exige ser admin, y los campos se validan manualmente).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SinTipar = any;

export type EstadoCorreccion = 'analizada' | 'probando' | 'aplicada' | 'rechazada' | 'descartada';

const ETIQUETA_ESTADO: Record<EstadoCorreccion, string> = {
  analizada: 'Esperando elección',
  probando: 'Probando…',
  aplicada: 'Aplicada',
  rechazada: 'Rechazada',
  descartada: 'Descartada',
};

const ETIQUETA_DESTINO: Record<string, string> = {
  instrucciones: 'Instrucciones',
  ficha: 'Ficha de conocimiento',
  herramienta: 'Herramienta',
};

export type CorreccionResumen = {
  id: string;
  pedido: string;
  estado: EstadoCorreccion;
  etiqueta_estado: string;
  destino: string | null;
  etiqueta_destino: string | null;
  resultado: string | null;
  pruebas_total: number;
  pruebas_ok: number;
  costo: string;
  pedida_por: string | null;
  creada: string;
  terminada: string | null;
};

export type OpcionAnalisis = {
  tipo: string;
  destino: string;
  descripcion: string;
  fichaId?: string;
  fichaTema?: string;
  fichaTitulo?: string;
  herramientaNombre?: string;
};

export type ContradiccionAnalisis = {
  texto: string;
  cita: string | null;
  ubicacion: string | null;
};

export type AnalisisCorrector = {
  resumen?: string;
  contradicciones?: ContradiccionAnalisis[];
  opciones?: OpcionAnalisis[];
};

export type PruebaCorrector = {
  id: string;
  orden: number;
  nombre: string;
  estado: string;
  debe: string[];
  noDebe: string[];
  motivo: string | null;
  charla: unknown[] | null;
  veredicto: unknown | null;
};

export type CorreccionDetalle = CorreccionResumen & {
  analisis: AnalisisCorrector;
  cambio: Record<string, unknown> | null;
  modelo: string | null;
  pruebas: PruebaCorrector[];
};

export type ListaCorrecciones = {
  activo: boolean;
  correcciones: CorreccionResumen[];
};

function formatearFecha(iso: string): string {
  const f = fechaEnZona(new Date(iso));
  const [, m, d] = f.split('-').map(Number);
  return `${d}/${m} ${hora(iso)}`;
}

function aResumen(f: {
  id: string;
  pedido: string;
  estado: string;
  destino: string | null;
  resultado: string | null;
  pruebas_total: number;
  pruebas_ok: number;
  costo_usd: number;
  pedida_por: string | null;
  creada_at: string;
  terminada_at: string | null;
}): CorreccionResumen {
  const estado = (f.estado as EstadoCorreccion) || 'analizada';
  return {
    id: f.id,
    pedido: f.pedido,
    estado,
    etiqueta_estado: ETIQUETA_ESTADO[estado] ?? f.estado,
    destino: f.destino,
    etiqueta_destino: f.destino ? (ETIQUETA_DESTINO[f.destino] ?? f.destino) : null,
    resultado: f.resultado,
    pruebas_total: f.pruebas_total,
    pruebas_ok: f.pruebas_ok,
    costo: dolares(Number(f.costo_usd)),
    pedida_por: f.pedida_por,
    creada: formatearFecha(f.creada_at),
    terminada: f.terminada_at ? formatearFecha(f.terminada_at) : null,
  };
}

export async function listarCorrecciones(db: ClienteDb): Promise<ListaCorrecciones> {
  const { data, error } = await (db as SinTipar)
    .from('correcciones_lucia')
    .select('id, pedido, estado, destino, resultado, pruebas_total, pruebas_ok, costo_usd, pedida_por, creada_at, terminada_at')
    .order('creada_at', { ascending: false })
    .limit(50);
  if (error) {
    if (faltaLaTabla(error)) return { activo: false, correcciones: [] };
    throw error;
  }
  return { activo: true, correcciones: (data ?? []).map(aResumen) };
}

export async function leerCorreccionConPruebas(db: ClienteDb, id: string): Promise<CorreccionDetalle | null> {
  const dbSinTipar = db as SinTipar;
  const [correccion, pruebas] = await Promise.all([
    dbSinTipar.from('correcciones_lucia')
      .select('id, pedido, estado, analisis, destino, cambio, resultado, pruebas_total, pruebas_ok, costo_usd, modelo, pedida_por, creada_at, terminada_at')
      .eq('id', id)
      .maybeSingle(),
    dbSinTipar.from('correcciones_pruebas')
      .select('id, orden, nombre, estado, debe, no_debe, motivo, charla, veredicto')
      .eq('correccion_id', id)
      .order('orden', { ascending: true }),
  ]);
  if (correccion.error) {
    if (faltaLaTabla(correccion.error)) return null;
    throw correccion.error;
  }
  if (!correccion.data) return null;
  if (pruebas.error && !faltaLaTabla(pruebas.error)) throw pruebas.error;

  const f = correccion.data;
  return {
    ...aResumen(f),
    analisis: (f.analisis ?? {}) as AnalisisCorrector,
    cambio: (f.cambio ?? null) as Record<string, unknown> | null,
    modelo: f.modelo ?? null,
    pruebas: (pruebas.data ?? []).map((p: SinTipar) => ({
      id: p.id as string,
      orden: p.orden as number,
      nombre: p.nombre as string,
      estado: p.estado as string,
      debe: Array.isArray(p.debe) ? (p.debe as string[]) : [],
      noDebe: Array.isArray(p.no_debe) ? (p.no_debe as string[]) : [],
      motivo: (p.motivo as string | null) ?? null,
      charla: Array.isArray(p.charla) ? (p.charla as unknown[]) : null,
      veredicto: p.veredicto ?? null,
    })),
  };
}

export async function descartarCorreccion(sesion: Sesion, id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (sesion.supabase as SinTipar).rpc('correccion_descartar', { p_correccion: id });
  if (error) {
    if (faltaLaTabla(error)) return { ok: false, error: 'El corrector todavía no está activado' };
    if (error.code === '55000') return { ok: false, error: 'Esa corrección ya estaba cerrada' };
    throw error;
  }
  return { ok: true };
}
