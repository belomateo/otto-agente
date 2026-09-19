// Clientes (H1.8): la lista (forma de `Cliente` de lib/mock-data.ts) y la ficha de un
// cliente (la libreta que lee Lucía, forma de `DatosFicha` de ui-otto/FichaCliente) con sus
// turnos, notas y una línea de tiempo. La edición de la ficha es H1.9 (PATCH /api/clientes/[id]).
import 'server-only';
import type { Cliente } from '@/lib/mock-data';
import type { DatosFicha } from '@/components/ui-otto/FichaCliente';
import { ESTILO_ESTADO_TURNO, ETIQUETA_DIA_O_NOCHE, ETIQUETA_EVENTO, ETIQUETA_ROL, ETIQUETA_TIPO_TURNO } from '@/lib/etiquetas';
import { diaMes, diaYHora, momentoCorto, ultimoContacto } from '@/lib/formato';
import { ESTADOS_LIBERAN, nombreDe, normalizar, resumenFicha, telefonoLegible, type ClienteDb, type Fila } from './comun';

export type FilaCliente = Cliente & { id: string; evento: string | null; ultimo_at: string | null };

// Sin búsqueda, la lista trae los clientes más recientes. Con búsqueda, contra toda la tabla
// (columna `busqueda`, 0034: nombre + teléfono + evento, sin tildes ni mayúsculas) — antes
// filtraba en memoria solo sobre estos 500, así que un cliente viejo que volvía a escribir
// daba "no existe" y el equipo le duplicaba la ficha.
const LIMITE = 500;
const OCUPA = new Set(['sin-confirmar', 'confirmado', 'alquilo', 'retiro']);

// Escapa lo que ILIKE toma como comodín, para que buscar "50%" no se interprete como patrón.
const escaparIlike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listarClientes(
  db: ClienteDb,
  o: { busqueda?: string; evento?: string } = {}
): Promise<{ clientes: FilaCliente[]; total: number }> {
  const b = normalizar(o.busqueda ?? '');
  let q = db
    .from('clientes')
    .select('id, nombre, telefono, evento, fecha_evento, rol, creado_at, conversaciones(ultimo_mensaje_at), turnos(inicio, estado)')
    .order('creado_at', { ascending: false });
  if (o.evento) q = q.eq('evento', o.evento);
  q = b ? q.ilike('busqueda', `%${escaparIlike(b)}%`) : q.limit(LIMITE);
  const { data, error } = await q;
  if (error) throw error;

  const ahora = new Date();
  const ahoraIso = ahora.toISOString();
  const filas = (data ?? []).map((c) => {
    const ultimo = c.conversaciones
      .map((v) => v.ultimo_mensaje_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;
    const proximo = c.turnos
      .filter((t) => t.inicio >= ahoraIso && OCUPA.has(t.estado))
      .map((t) => t.inicio)
      .sort()[0];
    return {
      id: c.id,
      evento: c.evento,
      ultimo_at: ultimo,
      n: nombreDe(c),
      tel: telefonoLegible(c.telefono),
      ev: c.evento ? (ETIQUETA_EVENTO[c.evento] ?? c.evento) : '—',
      f: c.fecha_evento ? diaMes(c.fecha_evento) : '—',
      rol: c.rol ? (ETIQUETA_ROL[c.rol] ?? c.rol) : '—',
      ult: ultimo ? ultimoContacto(ultimo, ahora) : '—',
      turno: proximo ? diaYHora(proximo) : '—',
    };
  });
  // Último contacto primero; los que nunca escribieron, al final.
  filas.sort((a, b) => (b.ultimo_at ?? '').localeCompare(a.ultimo_at ?? ''));
  return { clientes: filas, total: filas.length };
}

export type FichaDeCliente = {
  /** La fila completa, con `version` para editarla (PATCH /api/clientes/[id]). */
  cliente: Fila<'clientes'>;
  datos: DatosFicha;
  resumen: string;
  conversacion_abierta: string | null;
  turnos: { id: string; inicio: string; tipo: string; estado: string; probador: number; cuando: string; texto: string }[];
  notas: { id: string; autor: string; texto: string; creado_at: string }[];
  /** Línea de tiempo: 'hoy 09:41 · Último mensaje', 'sáb 10:00 · Turno · Novio · Probador 1 · Confirmado'. */
  historial: { at: string; fecha: string; texto: string }[];
};

export async function obtenerCliente(db: ClienteDb, id: string): Promise<FichaDeCliente | null> {
  const { data: c, error } = await db.from('clientes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const [turnos, notas, conversaciones] = await Promise.all([
    db.from('turnos').select('id, inicio, tipo, estado, probador').eq('cliente_id', id).order('inicio', { ascending: false }).limit(50),
    db.from('notas').select('id, autor, texto, creado_at').eq('cliente_id', id).order('creado_at', { ascending: false }).limit(100),
    db.from('conversaciones').select('id, estado, iniciado_at, ultimo_mensaje_at').eq('cliente_id', id).order('iniciado_at', { ascending: true }),
  ]);
  for (const r of [turnos, notas, conversaciones]) if (r.error) throw r.error;

  const ahora = new Date();
  const ahoraIso = ahora.toISOString();
  const listaTurnos = (turnos.data ?? []).map((t) => ({
    id: t.id,
    inicio: t.inicio,
    tipo: t.tipo,
    estado: t.estado,
    probador: t.probador,
    cuando: diaYHora(t.inicio),
    texto: `Turno · ${ETIQUETA_TIPO_TURNO[t.tipo] ?? t.tipo} · Probador ${t.probador} · ${ESTILO_ESTADO_TURNO[t.estado]?.etiqueta ?? t.estado}`,
  }));
  const proximo = [...(turnos.data ?? [])]
    .filter((t) => t.inicio >= ahoraIso)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .find((t) => OCUPA.has(t.estado));

  const convs = conversaciones.data ?? [];
  const eventosDeTiempo: { at: string; texto: string }[] = [
    ...listaTurnos.map((t) => ({ at: t.inicio, texto: t.texto })),
    ...(convs[0] ? [{ at: convs[0].iniciado_at, texto: 'Primera consulta por WhatsApp' }] : []),
    ...convs
      .filter((v) => v.ultimo_mensaje_at)
      .map((v) => ({ at: v.ultimo_mensaje_at as string, texto: v.estado === 'derivada' ? 'Charla con una persona del equipo' : 'Charla con Lucía' })),
  ];
  eventosDeTiempo.sort((a, b) => b.at.localeCompare(a.at));

  return {
    cliente: c,
    datos: {
      nombre: nombreDe(c),
      evento: c.evento ? (ETIQUETA_EVENTO[c.evento] ?? c.evento) : '—',
      fecha: c.fecha_evento ? diaMes(c.fecha_evento) : '—',
      rol: c.rol ? (ETIQUETA_ROL[c.rol] ?? c.rol) : '—',
      talle: c.talle_aprox ?? '—',
      ciudad: c.ciudad ?? '—',
      color: c.color_preferido ?? '—',
    },
    resumen: resumenFicha(c, proximo?.inicio ?? null) || (c.dia_o_noche ? ETIQUETA_DIA_O_NOCHE[c.dia_o_noche] : ''),
    conversacion_abierta: convs.find((v) => v.estado !== 'cerrada')?.id ?? null,
    turnos: listaTurnos,
    notas: notas.data ?? [],
    historial: eventosDeTiempo.map((e) => ({
      at: e.at,
      fecha: e.at > ahoraIso ? diaYHora(e.at) : momentoCorto(e.at, ahora),
      texto: e.texto,
    })),
  };
}
