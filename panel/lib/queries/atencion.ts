// Atención humana (H1.8): derivaciones pendientes o ya atendidas ("Consultas OK"). Devuelve
// la forma de `Derivacion` de lib/mock-data.ts más los ids y los últimos mensajes.
//
// `derivaciones` todavía no tiene la columna `resumen` que pide PROCESOS.md § 4 ("resumen del
// extractor"). Mientras no exista, el resumen de la tarjeta es el último mensaje del cliente.
import 'server-only';
import type { Derivacion } from '@/lib/mock-data';
import { BORDE_DERIVACION, ESTILO_MOTIVO } from '@/lib/etiquetas';
import { haceCuanto, hora, limiteArchivo } from '@/lib/formato';
import { nombreDe, textoDeMensaje, type ClienteDb } from './comun';

export const ESTADOS_DERIVACION = ['pendiente', 'atendida'] as const;
export type EstadoDerivacion = (typeof ESTADOS_DERIVACION)[number];

export type FilaDerivacion = Derivacion & {
  id: string;
  conversacion_id: string;
  cliente_id: string | null;
  motivo_clave: string;
  estado: string;
  creado_at: string;
  atendida_at: string | null;
  atendida_por: string | null;
  /** Últimos mensajes de la charla, del más viejo al más nuevo. */
  ultimos_mensajes: { direccion: string; texto: string; hora: string }[];
};

// Mensajes que se traen por derivación: los "últimos 5" de PROCESOS.md § 4.
const ULTIMOS = 5;

export async function listarDerivaciones(
  db: ClienteDb,
  estado: EstadoDerivacion = 'pendiente'
): Promise<{ derivaciones: FilaDerivacion[]; pendientes: number; atendidas: number }> {
  const limite = limiteArchivo();
  // Pendientes: las de las últimas 48 hs (archivo, 27/10). Consultas OK (Sofía, 18/11): las marcadas OK y
  // también las de días anteriores que nadie marcó, que si no, no se veían en ningún lado.
  const consultar = (estadoFila: EstadoDerivacion, operador: 'gt' | 'lte' | null) => {
    let q = db
      .from('derivaciones')
      .select(
        'id, conversacion_id, motivo, estado, creado_at, atendida_at, atendida_por, conversaciones!inner(cliente_id, clientes(nombre, telefono), mensajes(contenido, direccion, tipo, enviado_at))'
      )
      .eq('estado', estadoFila)
      .neq('conversaciones.canal', 'prueba');
    if (operador) q = q.filter('conversaciones.ultimo_mensaje_at', operador, limite);
    return q
      .order('creado_at', { ascending: false })
      .order('enviado_at', { referencedTable: 'conversaciones.mensajes', ascending: false })
      .limit(ULTIMOS, { referencedTable: 'conversaciones.mensajes' })
      .limit(200);
  };
  const contar = (estadoFila: EstadoDerivacion, operador: 'gt' | 'lte' | null) => {
    let q = db
      .from('derivaciones')
      .select('id, conversaciones!inner(canal, ultimo_mensaje_at)', { count: 'exact', head: true })
      .eq('estado', estadoFila)
      .neq('conversaciones.canal', 'prueba');
    if (operador) q = q.filter('conversaciones.ultimo_mensaje_at', operador, limite);
    return q;
  };
  const [listas, pendientes, atendidas, anteriores] = await Promise.all([
    Promise.all(estado === 'pendiente' ? [consultar('pendiente', 'gt')] : [consultar('atendida', null), consultar('pendiente', 'lte')]),
    contar('pendiente', 'gt'),
    contar('atendida', null),
    contar('pendiente', 'lte'),
  ]);
  for (const r of [...listas, pendientes, atendidas, anteriores]) if (r.error) throw r.error;
  const filas = listas.flatMap((l) => l.data ?? []).sort((x, y) => y.creado_at.localeCompare(x.creado_at));

  const ahora = new Date();
  const derivaciones = filas.map((d) => {
    const conv = d.conversaciones;
    const recientes = conv?.mensajes ?? []; // del más nuevo al más viejo
    const ultimoDelCliente = recientes.find((m) => m.direccion === 'entrante');
    const estilo = ESTILO_MOTIVO[d.motivo] ?? { etiqueta: d.motivo, cb: '#EFEDE8', cf: '#5C6068', urgente: false };
    return {
      id: d.id,
      conversacion_id: d.conversacion_id,
      cliente_id: conv?.cliente_id ?? null,
      motivo_clave: d.motivo,
      estado: d.estado,
      creado_at: d.creado_at,
      atendida_at: d.atendida_at,
      atendida_por: d.atendida_por,
      n: nombreDe(conv?.clientes),
      hace: haceCuanto(d.creado_at, ahora),
      motivo: estilo.etiqueta,
      cb: estilo.cb,
      cf: estilo.cf,
      borde: estilo.urgente ? BORDE_DERIVACION.urgente : BORDE_DERIVACION.normal,
      resumen: textoDeMensaje(ultimoDelCliente ?? recientes[0]),
      ultimos_mensajes: [...recientes]
        .reverse()
        .map((m) => ({ direccion: m.direccion, texto: textoDeMensaje(m), hora: hora(m.enviado_at) })),
    };
  });
  return { derivaciones, pendientes: pendientes.count ?? 0, atendidas: (atendidas.count ?? 0) + (anteriores.count ?? 0) };
}
