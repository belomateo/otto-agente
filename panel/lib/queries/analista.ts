// Bitácora › Analista (0102, pedido de Mateo del 9/10 y 10/10: «una sub-pestaña dentro de la
// Bitácora, solo ahí, con los errores y las mejoras del agente»). Lo que el analista de charlas
// (supabase/functions/analista) encontró una noche: los errores de Lucía con el mensaje textual y las
// mejoras sugeridas, más el resumen de esa noche (cuántas charlas revisó, cuántas fallaron, cuánto
// costó). Nunca se aplica nada solo: un admin marca cada punto «Hecho» o «Descartar».
//
// 0102 la aplica Mateo a mano y el panel puede salir antes: mientras las tablas no existan la
// pestaña dice que el analista no está activado (faltaLaTabla, igual que bloqueos y feriados).
import 'server-only';
import type { Sesion } from '@/lib/api/sesion';
import { diaMes, dolares, fechaEnZona, fechaLarga, hora } from '@/lib/formato';
import { faltaLaTabla } from './bloqueos';
import { nombreDe, type ClienteDb } from './comun';

export type TipoHallazgo = 'error' | 'mejora';
export type EstadoHallazgo = 'pendiente' | 'hecho' | 'descartado';
export const ESTADOS_HALLAZGO: readonly EstadoHallazgo[] = ['pendiente', 'hecho', 'descartado'];
export type Gravedad = 'alta' | 'media' | 'baja';

// Las categorías son las del check de 0102 (y de supabase/functions/analista/pedido.ts).
const ETIQUETA_CATEGORIA: Record<string, string> = {
  dato_falso: 'Dato falso',
  promesa_no_cumplida: 'Promesa no cumplida',
  derivo_sin_necesidad: 'Pasó la charla sin necesidad',
  no_contesto: 'No contestó',
  no_ofrecio_turno: 'No ofreció turno',
  tono: 'Tono',
  regla: 'Rompió una regla',
  dato_faltante: 'Dato que faltó en las fichas',
  frase: 'Frase para mejorar',
};

export type HallazgoAnalista = {
  id: string;
  tipo: TipoHallazgo;
  categoria: string;
  /** 'Dato falso', 'Dato que faltó en las fichas'… */
  etiqueta: string;
  gravedad: Gravedad | null;
  cita: string | null;
  autor_cita: 'lucia' | 'cliente' | null;
  /** Qué estuvo mal (error) o qué faltó (mejora). */
  que_paso: string;
  que_conviene: string | null;
  /** La ficha donde iría el dato que faltó (sección de Conocimiento). */
  tema: string | null;
  texto_sugerido: string | null;
  estado: EstadoHallazgo;
  /** Nombre de quien lo marcó hecho o descartado. */
  marcado_por: string | null;
  /** '10/10 09:41' */
  marcado: string | null;
  conversacion_id: string;
  /** Nombre del cliente, o su teléfono legible. */
  cliente: string;
  /** 'HH:MM' del mensaje citado, si hay. */
  hora: string | null;
};

export type ResumenNoche = {
  /** Charlas de esa noche que el analista tocó (revisadas, fallidas, salteadas o en curso). */
  charlas: number;
  analizadas: number;
  fallidas: number;
  salteadas: number;
  en_curso: number;
  costo: string;
  costo_usd: number;
  modelo: string | null;
};

export type AnalisisDeLaNoche = {
  /** false mientras 0102 no esté aplicada. */
  activo: boolean;
  /** La noche que se muestra; null si todavía no se analizó ninguna. */
  fecha: string | null;
  titulo: string;
  /** null: esa fecha no se analizó. */
  resumen: ResumenNoche | null;
  errores: HallazgoAnalista[];
  mejoras: HallazgoAnalista[];
  /** Las noches analizadas de antes y de después, para las flechas. */
  anterior: string | null;
  siguiente: string | null;
  /** El último día que se puede analizar (ayer): tope del selector de fecha. */
  ayer: string;
};

// Un solo literal (sin concatenar): así supabase-js lee el select y tipa las filas, embebidos incluidos.
const COLUMNAS =
  'id, tipo, categoria, gravedad, autor_cita, cita, que_paso, que_conviene, tema, texto_sugerido, estado, marcado_at, conversacion_id, creado_at, mensajes(enviado_at), conversaciones(clientes(nombre, telefono)), perfiles(nombre)';

type FilaHallazgo = {
  id: string;
  tipo: string;
  categoria: string;
  gravedad: string | null;
  autor_cita: string | null;
  cita: string | null;
  que_paso: string;
  que_conviene: string | null;
  tema: string | null;
  texto_sugerido: string | null;
  estado: string;
  marcado_at: string | null;
  conversacion_id: string;
  creado_at: string;
  mensajes: { enviado_at: string } | null;
  conversaciones: { clientes: { nombre: string | null; telefono: string } | null } | null;
  perfiles: { nombre: string | null } | null;
};

function aHallazgo(f: FilaHallazgo): HallazgoAnalista {
  const marcado = f.marcado_at ? `${diaMes(fechaEnZona(new Date(f.marcado_at)))} ${hora(f.marcado_at)}` : null;
  return {
    id: f.id,
    tipo: f.tipo === 'mejora' ? 'mejora' : 'error',
    categoria: f.categoria,
    etiqueta: ETIQUETA_CATEGORIA[f.categoria] ?? f.categoria,
    gravedad: f.gravedad === 'alta' || f.gravedad === 'media' || f.gravedad === 'baja' ? f.gravedad : null,
    cita: f.cita,
    autor_cita: f.autor_cita === 'cliente' ? 'cliente' : f.autor_cita === 'lucia' ? 'lucia' : null,
    que_paso: f.que_paso,
    que_conviene: f.que_conviene,
    tema: f.tema,
    texto_sugerido: f.texto_sugerido,
    estado: (ESTADOS_HALLAZGO as readonly string[]).includes(f.estado) ? (f.estado as EstadoHallazgo) : 'pendiente',
    marcado_por: f.estado !== 'pendiente' ? f.perfiles?.nombre?.trim() || (f.marcado_at ? 'un admin' : null) : null,
    marcado: f.estado !== 'pendiente' ? marcado : null,
    conversacion_id: f.conversacion_id,
    cliente: nombreDe(f.conversaciones?.clientes),
    hora: f.mensajes?.enviado_at ? hora(f.mensajes.enviado_at) : null,
  };
}

const ORDEN_GRAVEDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const ORDEN_CATEGORIA_MEJORA: Record<string, number> = { dato_faltante: 0, frase: 1 };

/** Pendientes primero; los errores por gravedad, las mejoras con los datos que faltan arriba; y por hora. */
function ordenar(lista: HallazgoAnalista[], clave: (h: HallazgoAnalista) => number): HallazgoAnalista[] {
  return [...lista].sort(
    (a, b) =>
      Number(a.estado !== 'pendiente') - Number(b.estado !== 'pendiente') ||
      clave(a) - clave(b) ||
      a.cliente.localeCompare(b.cliente, 'es') ||
      (a.hora ?? '').localeCompare(b.hora ?? ''),
  );
}

/**
 * El análisis de una noche. Sin fecha, la última noche analizada. La fecha es la de las charlas
 * (el análisis corre a las 03:00 del día siguiente).
 */
export async function analisisDeLaNoche(db: ClienteDb, fechaPedida: string | null): Promise<AnalisisDeLaNoche> {
  const ayer = fechaEnZona(new Date(Date.now() - 24 * 3600 * 1000));
  const vacio = (activo: boolean, fecha: string | null): AnalisisDeLaNoche => ({
    activo,
    fecha,
    titulo: fecha ? fechaLarga(fecha) : '',
    resumen: null,
    errores: [],
    mejoras: [],
    anterior: null,
    siguiente: null,
    ayer,
  });

  let fecha = fechaPedida;
  if (!fecha) {
    const { data, error } = await db.from('analisis_revisiones').select('fecha').order('fecha', { ascending: false }).limit(1);
    if (error) {
      if (faltaLaTabla(error)) return vacio(false, null);
      throw error;
    }
    fecha = data?.[0]?.fecha ?? null;
    if (!fecha) return vacio(true, null);
  }

  const [revisiones, hallazgos, anterior, siguiente] = await Promise.all([
    db.from('analisis_revisiones').select('estado, costo_usd, modelo').eq('fecha', fecha),
    db.from('analisis_charlas').select(COLUMNAS).eq('fecha', fecha).order('creado_at', { ascending: true }),
    db.from('analisis_revisiones').select('fecha').lt('fecha', fecha).order('fecha', { ascending: false }).limit(1),
    db.from('analisis_revisiones').select('fecha').gt('fecha', fecha).order('fecha', { ascending: true }).limit(1),
  ]);
  for (const r of [revisiones, hallazgos, anterior, siguiente]) {
    if (r.error) {
      if (faltaLaTabla(r.error)) return vacio(false, fecha);
      throw r.error;
    }
  }

  const filasRevision = revisiones.data ?? [];
  const contar = (estado: string) => filasRevision.filter((r) => r.estado === estado).length;
  const costoUsd = filasRevision.reduce((a, r) => a + Number(r.costo_usd), 0);
  const modelos = [...new Set(filasRevision.map((r) => r.modelo).filter((m): m is string => Boolean(m)))];
  const resumen: ResumenNoche | null = filasRevision.length
    ? {
        charlas: filasRevision.length,
        analizadas: contar('analizada'),
        fallidas: contar('fallo'),
        salteadas: contar('salteada'),
        en_curso: contar('analizando'),
        costo: dolares(costoUsd),
        costo_usd: costoUsd,
        modelo: modelos.join(', ') || null,
      }
    : null;

  const todos = (hallazgos.data ?? []).map(aHallazgo);
  return {
    activo: true,
    fecha,
    titulo: fechaLarga(fecha),
    resumen,
    errores: ordenar(
      todos.filter((h) => h.tipo === 'error'),
      (h) => ORDEN_GRAVEDAD[h.gravedad ?? 'media'] ?? 1,
    ),
    mejoras: ordenar(
      todos.filter((h) => h.tipo === 'mejora'),
      (h) => ORDEN_CATEGORIA_MEJORA[h.categoria] ?? 2,
    ),
    anterior: anterior.data?.[0]?.fecha ?? null,
    siguiente: siguiente.data?.[0]?.fecha ?? null,
    ayer,
  };
}

/**
 * «Hecho», «Descartar» o volver a pendiente. Con la sesión: la RLS de 0102 deja solo a un admin y
 * solo la columna estado; quién lo marcó y cuándo lo pone la base. null = no existe (o 0102 todavía
 * no está aplicada).
 */
export async function marcarHallazgo(sesion: Sesion, id: string, estado: EstadoHallazgo): Promise<HallazgoAnalista | null> {
  const { data, error } = await sesion.supabase.from('analisis_charlas').update({ estado }).eq('id', id).select(COLUMNAS).maybeSingle();
  if (error) {
    if (faltaLaTabla(error)) return null;
    throw error;
  }
  return data ? aHallazgo(data) : null;
}
