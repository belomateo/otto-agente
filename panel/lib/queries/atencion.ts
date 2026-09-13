// Atención humana (H1.8): derivaciones pendientes o ya atendidas ("Consultas OK"). Devuelve
// la forma de `Derivacion` de lib/mock-data.ts más los ids y los últimos mensajes.
//
// `derivaciones` todavía no tiene la columna `resumen` que pide PROCESOS.md § 4 ("resumen del
// extractor"). Mientras no exista, el resumen de la tarjeta es el último mensaje del cliente.
import 'server-only';
import type { Derivacion } from '@/lib/mock-data';
import { BORDE_DERIVACION, ESTILO_MOTIVO } from '@/lib/etiquetas';
import { haceCuanto, hora } from '@/lib/formato';
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
  const [lista, pendientes, atendidas] = await Promise.all([
    db
      .from('derivaciones')
      .select(
        'id, conversacion_id, motivo, estado, creado_at, atendida_at, atendida_por, conversaciones(cliente_id, clientes(nombre, telefono), mensajes(contenido, direccion, tipo, enviado_at))'
      )
      .eq('estado', estado)
      .order('creado_at', { ascending: false })
      .order('enviado_at', { referencedTable: 'conversaciones.mensajes', ascending: false })
      .limit(ULTIMOS, { referencedTable: 'conversaciones.mensajes' })
      .limit(200),
    db.from('derivaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    db.from('derivaciones').select('id', { count: 'exact', head: true }).eq('estado', 'atendida'),
  ]);
  if (lista.error) throw lista.error;
  if (pendientes.error) throw pendientes.error;
  if (atendidas.error) throw atendidas.error;

  const ahora = new Date();
  const derivaciones = (lista.data ?? []).map((d) => {
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
  return { derivaciones, pendientes: pendientes.count ?? 0, atendidas: atendidas.count ?? 0 };
}
