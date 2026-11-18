// Atención humana (H1.8): derivaciones pendientes o ya atendidas ("Consultas OK"). Devuelve
// la forma de `Derivacion` de lib/mock-data.ts más los ids y los últimos mensajes.
//
// `derivaciones` todavía no tiene la columna `resumen` que pide PROCESOS.md § 4 ("resumen del
// extractor"). Mientras no exista, el resumen de la tarjeta es el último mensaje del cliente.
import 'server-only';
import type { Derivacion } from '@/lib/mock-data';
import { BORDE_DERIVACION, ESTILO_MOTIVO } from '@/lib/etiquetas';
import { haceCuanto, hora, limiteArchivo, rangoDelDia } from '@/lib/formato';
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
        'id, conversacion_id, motivo, estado, creado_at, atendida_at, atendida_por, conversaciones!inner(cliente_id, clientes(nombre, telefono), mensajes(contenido, direccion, tipo, enviado_at))'
      )
      .eq('estado', estado)
      .neq('conversaciones.canal', 'prueba')
      .gt('conversaciones.ultimo_mensaje_at', estado === 'pendiente' ? limiteArchivo() : '1970-01-01')
      .order('creado_at', { ascending: false })
      .order('enviado_at', { referencedTable: 'conversaciones.mensajes', ascending: false })
      .limit(ULTIMOS, { referencedTable: 'conversaciones.mensajes' })
      .limit(200),
    db
      .from('derivaciones')
      .select('id, conversaciones!inner(canal, ultimo_mensaje_at)', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .neq('conversaciones.canal', 'prueba')
      .gt('conversaciones.ultimo_mensaje_at', limiteArchivo()),
    db
      .from('derivaciones')
      .select('id, conversaciones!inner(canal)', { count: 'exact', head: true })
      .eq('estado', 'atendida')
      .neq('conversaciones.canal', 'prueba'),
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

// Historial en «Consultas OK» (Sofía, 18/11): TODAS las conversaciones, no solo las que pasaron al equipo. Por
// secciones para no cargar miles de golpe: un día por vez (por el último mensaje de la charla), o una búsqueda por
// nombre o teléfono en todo el historial. Misma forma que una derivación, así la pantalla reusa tarjeta y visor.
export const TOPE_HISTORIAL = 200;
const SIN_DERIVAR = { etiqueta: 'Atendió Lucía', cb: '#E6EFE8', cf: '#3F6B4A', urgente: false };

export async function listarHistorial(
  db: ClienteDb,
  o: { dia: string; busqueda?: string }
): Promise<{ derivaciones: FilaDerivacion[]; pendientes: number; atendidas: number }> {
  // Solo letras, números y espacios: la búsqueda va dentro de un filtro de PostgREST.
  const texto = (o.busqueda ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const digitos = texto.replace(/\D/g, '');
  let q = db
    .from('conversaciones')
    .select(
      'id, cliente_id, ultimo_mensaje_at, iniciado_at, clientes!inner(nombre, telefono), mensajes(contenido, direccion, tipo, enviado_at), derivaciones(motivo, estado, creado_at, atendida_at, atendida_por)'
    )
    .neq('canal', 'prueba')
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .order('enviado_at', { referencedTable: 'mensajes', ascending: false })
    .limit(ULTIMOS, { referencedTable: 'mensajes' })
    .limit(TOPE_HISTORIAL);
  if (texto) {
    q = q.or(digitos.length >= 3 && digitos === texto.replace(/\s/g, '') ? `telefono.ilike.%${digitos}%` : `nombre.ilike.%${texto}%`, {
      referencedTable: 'clientes',
    });
  } else {
    const { desde, hasta } = rangoDelDia(o.dia);
    q = q.gte('ultimo_mensaje_at', desde).lt('ultimo_mensaje_at', hasta);
  }
  const [lista, pendientes] = await Promise.all([
    q,
    db
      .from('derivaciones')
      .select('id, conversaciones!inner(canal, ultimo_mensaje_at)', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .neq('conversaciones.canal', 'prueba')
      .gt('conversaciones.ultimo_mensaje_at', limiteArchivo()),
  ]);
  if (lista.error) throw lista.error;
  if (pendientes.error) throw pendientes.error;

  const ahora = new Date();
  const derivaciones = (lista.data ?? []).map((c): FilaDerivacion => {
    const recientes = c.mensajes ?? []; // del más nuevo al más viejo
    const ultimoDelCliente = recientes.find((m) => m.direccion === 'entrante');
    const deriv = [...(c.derivaciones ?? [])].sort((x, y) => y.creado_at.localeCompare(x.creado_at))[0];
    const estilo = deriv ? (ESTILO_MOTIVO[deriv.motivo] ?? { etiqueta: deriv.motivo, cb: '#EFEDE8', cf: '#5C6068', urgente: false }) : SIN_DERIVAR;
    const cuando = recientes[0]?.enviado_at ?? c.ultimo_mensaje_at ?? c.iniciado_at;
    return {
      id: c.id,
      conversacion_id: c.id,
      cliente_id: c.cliente_id,
      motivo_clave: deriv?.motivo ?? '',
      estado: deriv?.estado ?? 'sin-derivar',
      creado_at: cuando,
      atendida_at: deriv?.atendida_at ?? null,
      atendida_por: deriv?.atendida_por ?? null,
      n: nombreDe(c.clientes),
      hace: texto ? haceCuanto(cuando, ahora) : hora(cuando),
      motivo: estilo.etiqueta,
      cb: estilo.cb,
      cf: estilo.cf,
      borde: BORDE_DERIVACION.normal,
      resumen: textoDeMensaje(ultimoDelCliente ?? recientes[0]),
      ultimos_mensajes: [...recientes]
        .reverse()
        .map((m) => ({ direccion: m.direccion, texto: textoDeMensaje(m), hora: hora(m.enviado_at) })),
    };
  });
  return { derivaciones, pendientes: pendientes.count ?? 0, atendidas: derivaciones.length };
}
