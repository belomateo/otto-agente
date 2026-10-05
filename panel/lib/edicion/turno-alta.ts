// Alta de turno desde el panel: dos caminos que conviven en el mismo endpoint (POST
// /api/turnos) para no tener dos lugares donde se valida la agenda.
//   1. Decisión de Mateo, 16/9: el cliente que saca turno por teléfono. cliente_id ya existe,
//      probador explícito — el estado siempre arranca en 'sin-confirmar' (0011).
//   2. Decisión de Mateo, 19/9: alta desde la pestaña Turnos ("Nuevo turno"), para el cliente
//      que cae al mostrador sin turno. Acá el probador es opcional (si no viene, lo elige la
//      agenda) y se valida contra la MISMA lógica de huecos que usa Lucía: calcularHuecos(),
//      importado tal cual de supabase/functions/_shared/agenda/huecos.ts (spike confirmado:
//      es TypeScript puro, sin Deno; Turbopack lo bundlea sin problema con
//      allowImportingTsExtensions en tsconfig.json — cero duplicación de la lógica de agenda).
//      cliente_nuevo da de alta al cliente en el mismo paso (mismo normalizado de teléfono que
//      /api/clientes). pisar_urgencia (explícito, nunca implícito) anula la reserva de urgencia
//      pasando diasReservaUrgencia: null a calcularHuecos — no un parámetro nuevo en la función
//      que usa producción. El margen de confección (huecos.ts:79-85) NO se pisa nunca: es una
//      promesa al cliente sobre cuándo llega el traje, no una política de agenda.
//      La excepción es el evento hoy o mañana (aceptar_evento_inminente, más abajo).
// Y moverTurno (pedido de Mateo, 5/10: cualquiera del equipo da, edita y reagenda turnos): otro
// horario, otro día u otro tipo para un turno que ya existe, validado igual, con los huecos del día
// nuevo sin contar el turno que se mueve. Actualiza la misma fila, como reprogramar_turno de Lucía.
import 'server-only';
import { z } from 'zod';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid, leerCuerpo, validar } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';
import { telefonoAlta } from './entidades';
import {
  type BloqueoAgenda,
  calcularHuecos,
  DIAS_CONFECCION_POR_DEFECTO,
  type Ocupado,
  type ReglasAgenda,
} from '../../../supabase/functions/_shared/agenda/huecos.ts';
import type { Hueco } from '../../../supabase/functions/_shared/herramientas/tipos.ts';

export const TIPOS_TURNO = ['graduado', 'novio', 'invitado', 'doble', 'triple', 'prueba_final'] as const;

export const ESQUEMA_ALTA_TURNO = z
  .strictObject({
    cliente_id: z.string().refine(esUuid, 'Identificador de cliente inválido').optional(),
    cliente_nuevo: z.strictObject({ telefono: telefonoAlta, nombre: z.string().trim().min(1).max(120).optional() }).optional(),
    tipo: z.enum(TIPOS_TURNO),
    // Modo A — Lucía / por teléfono: inicio ISO explícito, probador opcional
    probador: z.number().int('Tiene que ser un número entero').min(1, 'Mínimo 1').optional(),
    /** ISO, con zona (p. ej. 2026-09-20T13:00:00-03:00 o …Z). */
    inicio: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora inválidas').optional(),
    /** Explícito: el cliente ya está parado en el local (decisión de Mateo, 19/9). */
    pisar_urgencia: z.boolean().optional(),
    /** Explícito: el evento es hoy o mañana y lo resuelve quien agenda (ver huecosPara). */
    aceptar_evento_inminente: z.boolean().optional(),
    // Modo B — panel con hora libre (admin agenda sin pasar por la lista de huecos):
    // el admin elige la hora directamente y cuántos probadores quiere ocupar. No valida
    // contra calcularHuecos; la constraint GiST de la base impide solapamientos reales.
    /** Fecha del turno en formato AAAA-MM-DD. */
    fecha_libre: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD').optional(),
    /** Hora en formato HH:MM (hora local del negocio). */
    hora_libre: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM').optional(),
    /** Cuántos probadores reservar en paralelo (1, 2 o 3). */
    cantidad_probadores: z.number().int().min(1).max(3).optional(),
  })
  .refine((d) => Boolean(d.cliente_id) !== Boolean(d.cliente_nuevo), 'Mandá cliente_id o cliente_nuevo, uno de los dos')
  .refine(
    (d) => Boolean(d.inicio) || (Boolean(d.fecha_libre) && Boolean(d.hora_libre) && Boolean(d.cantidad_probadores)),
    'Modo A: mandá inicio. Modo B (hora libre): mandá fecha_libre + hora_libre + cantidad_probadores',
  );

const ZONA_NEGOCIO = process.env.NEGOCIO_TZ || 'America/Argentina/Cordoba';
// Argentina no usa horario de verano desde 2009: el offset es -03:00 todo el año. Si
// NEGOCIO_TZ cambiara a una zona con DST, este valor fijo dejaría de alcanzar.
const OFFSET_NEGOCIO = '-03:00';

const aMinutos = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fechaEnZonaDe = (d: Date, tz: string) => {
  const p = new Intl.DateTimeFormat('es-AR', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const partes = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
};

export async function altaTurno(sesion: Sesion, request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return error(400, 'El cuerpo no es JSON válido');
  }
  const datos = validar(cuerpo, ESQUEMA_ALTA_TURNO);
  if (datos instanceof Response) return datos;

  // Modo B: el admin eligió hora libre + cantidad de probadores (sin pasar por la lista de huecos).
  // No se valida contra calcularHuecos: el admin sabe lo que hace. La constraint GiST de la base
  // (0011) impide solapamientos reales; si hay choque, se devuelve el error de agenda_ocupada.
  const modoLibre = Boolean(datos.fecha_libre && datos.hora_libre && datos.cantidad_probadores);
  if (modoLibre) return altaTurnoLibre(sesion, datos);

  // Modo A: inicio ISO explícito (Lucía / alta por teléfono desde el panel).
  // Paso 1: el cliente. Existente, o de alta en el mismo paso (decisión de Mateo, 19/9).
  let clienteId: string;
  let fechaEvento: string | null;
  if (datos.cliente_nuevo) {
    const { data, error: eCliente } = await sesion.supabase
      .from('clientes')
      .insert({ telefono: datos.cliente_nuevo.telefono, nombre: datos.cliente_nuevo.nombre ?? null })
      .select('id, fecha_evento')
      .single();
    if (eCliente) return desdeErrorDeBase(eCliente);
    clienteId = data.id;
    fechaEvento = data.fecha_evento;
  } else {
    const { data, error: eCliente } = await sesion.supabase.from('clientes').select('fecha_evento').eq('id', datos.cliente_id!).maybeSingle();
    if (eCliente) return desdeErrorDeBase(eCliente);
    if (!data) return error(409, 'Ese cliente no existe', { motivo: 'cliente_no_existe' });
    clienteId = datos.cliente_id!;
    fechaEvento = data.fecha_evento;
  }

  // Paso 2: la duración del tipo (necesaria para el fin, y como regla de calcularHuecos).
  const { data: duracion, error: e1 } = await sesion.supabase.from('duraciones_turno').select('duracion_min').eq('tipo', datos.tipo).maybeSingle();
  if (e1) return desdeErrorDeBase(e1);
  if (!duracion) return error(400, `No hay una duración cargada para "${datos.tipo}" en Configuración › Agenda`);

  const inicio = new Date(datos.inicio!);
  const fin = new Date(inicio.getTime() + duracion.duracion_min * 60_000);
  const fecha = fechaEnZonaDe(inicio, ZONA_NEGOCIO);
  const opciones = { pisarUrgencia: Boolean(datos.pisar_urgencia), aceptarInminente: Boolean(datos.aceptar_evento_inminente) };

  // Paso 3: la agenda real — las mismas reglas que calculan los huecos que Lucía ofrece. Un
  // solo día alcanza: ya sabemos el inicio pedido.
  const primero = await huecosPara(sesion, datos.tipo, duracion.duracion_min, fecha, fechaEvento, opciones);
  if (primero instanceof Response) return primero;
  const probador = elegirProbador(primero.huecos, inicio, datos.probador);
  if (!probador) return error(409, 'Ese horario ya no está disponible', { motivo: 'sin_hueco', alternativas: primero.huecos.slice(0, 5) });

  // Paso 4: el insert. La agenda puede cambiar entre el cálculo de arriba y este commit —dos
  // altas a la vez, o Lucía agendando por WhatsApp en el mismo segundo— y ahí decide el motor,
  // no el código: turnos_sin_solapamiento (0011) es una exclusion constraint por GiST. Si
  // choca, no reintentamos el insert (sería books un horario distinto del que pidieron sin
  // avisar): recalculamos los huecos una vez más y devolvemos la alternativa ya lista, en vez
  // de que el operador tenga que arrancar el formulario de cero con la persona esperando.
  const intento = await insertarTurno(sesion, clienteId, datos.tipo, duracion.duracion_min, probador, inicio, fin);
  if (intento.ok) {
    dispararConfirmacion(intento.fila.id as string);
    return json({ fila: intento.fila }, 201);
  }
  if (!intento.chocoConOtroTurno) return intento.respuesta;

  const reintento = await huecosPara(sesion, datos.tipo, duracion.duracion_min, fecha, fechaEvento, opciones);
  const alternativas = reintento instanceof Response ? [] : reintento.huecos.slice(0, 5);
  return error(409, 'Ese horario se ocupó justo ahora', { motivo: 'agenda_ocupada', alternativas });
}

// Mover un turno (pedido de Mateo, 5/10): POST /api/turnos/<id>/mover con { version, inicio,
// probador?, tipo?, pisar_urgencia?, aceptar_evento_inminente? }. Lo puede hacer cualquiera del
// equipo, como marcar los estados. Solo un turno sin-confirmar o confirmado: los demás ya pasaron
// por el local o se cancelaron. Como reprogramar_turno de Lucía (_shared/herramientas/turnos.ts),
// es la misma fila y el ciclo arranca de nuevo: vuelve a sin-confirmar y el recordatorio se
// manda para el horario nuevo. El historial lo deja la base (0004), con quién lo movió (0017).
const ESQUEMA_MOVER = z.strictObject({
  version: z.number().int().min(1),
  /** ISO, con zona: uno de los huecos de GET /api/turnos/huecos?excluir=<id>. */
  inicio: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora inválidas'),
  probador: z.number().int('Tiene que ser un número entero').min(1, 'Mínimo 1').optional(),
  /** Otro tipo de turno (p. ej. invitado → doble): cambia la duración. Sin esto, el mismo. */
  tipo: z.enum(TIPOS_TURNO).optional(),
  pisar_urgencia: z.boolean().optional(),
  aceptar_evento_inminente: z.boolean().optional(),
});

const SE_MUEVEN = ['sin-confirmar', 'confirmado'];

export async function moverTurno(sesion: Sesion, id: string, request: Request) {
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const datos = await leerCuerpo(request, ESQUEMA_MOVER);
  if (datos instanceof Response) return datos;

  const { data: turno, error: e1 } = await sesion.supabase
    .from('turnos')
    .select('id, version, cliente_id, tipo, estado, clientes(fecha_evento)')
    .eq('id', id)
    .maybeSingle();
  if (e1) return desdeErrorDeBase(e1);
  if (!turno) return error(404, 'Ese turno no existe');
  if (turno.version !== datos.version) {
    return error(409, 'Alguien lo editó mientras tanto: recargá y volvé a intentar', { version_actual: turno.version });
  }
  if (!SE_MUEVEN.includes(turno.estado)) {
    return error(409, `Un turno en estado "${turno.estado}" ya no se mueve: si quiere venir otra vez, dale un turno nuevo`);
  }

  const tipo = datos.tipo ?? turno.tipo;
  const { data: duracion, error: e2 } = await sesion.supabase.from('duraciones_turno').select('duracion_min').eq('tipo', tipo).maybeSingle();
  if (e2) return desdeErrorDeBase(e2);
  if (!duracion) return error(400, `No hay una duración cargada para "${tipo}" en Configuración › Agenda`);

  const inicio = new Date(datos.inicio);
  const fin = new Date(inicio.getTime() + duracion.duracion_min * 60_000);
  const fecha = fechaEnZonaDe(inicio, ZONA_NEGOCIO);
  const fechaEvento = (turno.clientes as { fecha_evento: string | null } | null)?.fecha_evento ?? null;
  const opciones = {
    pisarUrgencia: Boolean(datos.pisar_urgencia),
    aceptarInminente: Boolean(datos.aceptar_evento_inminente),
    excluirTurno: id,
  };

  const agenda = await huecosPara(sesion, tipo, duracion.duracion_min, fecha, fechaEvento, opciones);
  if (agenda instanceof Response) return agenda;
  const probador = elegirProbador(agenda.huecos, inicio, datos.probador);
  if (!probador) return error(409, 'Ese horario ya no está disponible', { motivo: 'sin_hueco', alternativas: agenda.huecos.slice(0, 5) });

  const { data: movido, error: e3 } = await sesion.supabase
    .from('turnos')
    .update({
      tipo,
      duracion_min: duracion.duracion_min,
      probador,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      estado: 'sin-confirmar',
      confirmado: false,
      confirmado_at: null,
      confirmado_por: null,
      recordatorio_enviado_at: null,
      aviso_ok_at: null,
      aviso_ok_por: null,
    })
    .eq('id', id)
    .eq('version', datos.version)
    .select()
    .maybeSingle();
  if (e3) {
    // Un bloqueo o un cierre que apareció recién lo explica la base (0067); otro 23P01 es que
    // alguien tomó ese horario entre el cálculo y el update: se ofrecen los que quedan.
    if (e3.code !== '23P01' || /turno_en_/.test(e3.message)) return desdeErrorDeBase(e3);
    const reintento = await huecosPara(sesion, tipo, duracion.duracion_min, fecha, fechaEvento, opciones);
    const alternativas = reintento instanceof Response ? [] : reintento.huecos.slice(0, 5);
    return error(409, 'Ese horario se ocupó justo ahora', { motivo: 'agenda_ocupada', alternativas });
  }
  if (!movido) return error(409, 'Alguien lo editó mientras tanto: recargá y volvé a intentar');

  // El recordatorio sale una sola vez por turno (envios_programados es único por tipo y
  // referencia, 0021). Si ya le había llegado el del horario anterior, el nuevo no le llega solo:
  // el panel le pide a quien lo movió que le avise.
  const { data: yaLeLlego, error: e4 } = await sesion.supabase
    .from('envios_programados')
    .select('id')
    .eq('tipo', 'recordatorio_18h')
    .eq('referencia', id)
    .eq('estado', 'enviado')
    .limit(1);
  if (e4) console.error('[turnos] mover: no se pudo ver si ya salió el recordatorio:', e4.message);
  const avisarAlCliente = Boolean(yaLeLlego?.length);
  if (!avisarAlCliente) dispararConfirmacion(id);
  return json({ fila: movido, avisar_al_cliente: avisarAlCliente });
}

// Modo libre: el admin eligió tipo + fecha + hora + cantidad de probadores sin ver la lista de
// huecos. Se buscan los primeros N probadores libres en ese rango y se insertan N turnos. Si
// ninguno queda libre, se devuelve error. Siempre dispara la confirmación para cada turno creado.
async function altaTurnoLibre(
  sesion: Sesion,
  datos: z.infer<typeof ESQUEMA_ALTA_TURNO>,
): Promise<Response> {
  // Cliente
  let clienteId: string;
  if (datos.cliente_nuevo) {
    const { data, error: eC } = await sesion.supabase
      .from('clientes')
      .insert({ telefono: datos.cliente_nuevo.telefono, nombre: datos.cliente_nuevo.nombre ?? null })
      .select('id')
      .single();
    if (eC) return desdeErrorDeBase(eC);
    clienteId = data.id;
  } else {
    const { data, error: eC } = await sesion.supabase.from('clientes').select('id').eq('id', datos.cliente_id!).maybeSingle();
    if (eC) return desdeErrorDeBase(eC);
    if (!data) return error(409, 'Ese cliente no existe', { motivo: 'cliente_no_existe' });
    clienteId = datos.cliente_id!;
  }

  // Duración
  const { data: duracion, error: e1 } = await sesion.supabase.from('duraciones_turno').select('duracion_min').eq('tipo', datos.tipo).maybeSingle();
  if (e1) return desdeErrorDeBase(e1);
  if (!duracion) return error(400, `No hay una duración cargada para "${datos.tipo}" en Configuración › Agenda`);

  const inicio = new Date(`${datos.fecha_libre}T${datos.hora_libre}:00${OFFSET_NEGOCIO}`);
  if (Number.isNaN(inicio.getTime())) return error(400, 'La fecha y hora no son válidas');
  const fin = new Date(inicio.getTime() + duracion.duracion_min * 60_000);

  // Probadores libres en ese rango (máximo 3, en orden)
  const MAX_PROBADORES = 3;
  const { data: ocupados, error: eO } = await sesion.supabase
    .from('turnos')
    .select('probador')
    .not('estado', 'in', '(cancelado,no-vino)')
    .lt('inicio', fin.toISOString())
    .gt('fin', inicio.toISOString());
  if (eO) return desdeErrorDeBase(eO);
  const probadoresOcupados = new Set((ocupados ?? []).map((t) => t.probador as number));

  const cantidadPedida = datos.cantidad_probadores!;
  const probadoresLibres: number[] = [];
  for (let p = 1; p <= MAX_PROBADORES && probadoresLibres.length < cantidadPedida; p++) {
    if (!probadoresOcupados.has(p)) probadoresLibres.push(p);
  }
  if (probadoresLibres.length === 0) {
    return error(409, 'No hay probadores libres en ese horario', { motivo: 'agenda_ocupada' });
  }

  // Insertar un turno por probador libre
  const filas: Record<string, unknown>[] = [];
  for (const probador of probadoresLibres) {
    const { data, error: eI } = await sesion.supabase
      .from('turnos')
      .insert({ cliente_id: clienteId, tipo: datos.tipo, duracion_min: duracion.duracion_min, probador, inicio: inicio.toISOString(), fin: fin.toISOString() })
      .select()
      .single();
    if (eI) {
      if (eI.code === '23P01') continue; // se ocupó justo ahora, seguir con el siguiente
      return desdeErrorDeBase(eI);
    }
    filas.push(data);
    dispararConfirmacion(data.id as string);
  }

  if (filas.length === 0) return error(409, 'Ese horario se ocupó justo ahora', { motivo: 'agenda_ocupada' });
  return json({ filas, creados: filas.length }, 201);
}

// Fire-and-forget: después de crear el turno, pide al worker que mande la plantilla
// recordatorio_turno como confirmación inmediata. Si el worker no está disponible o falta
// WORKER_SECRET, el turno ya quedó en la base y no se pierde nada —el cron de recordatorio
// de 18h lo manda igual antes del turno.
function dispararConfirmacion(turnoId: string): void {
  const supabaseUrl = process.env.SUPABASE_URL;
  const workerSecret = process.env.WORKER_SECRET;
  if (!supabaseUrl || !workerSecret) return;
  fetch(`${supabaseUrl}/functions/v1/cron-envios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': workerSecret },
    body: JSON.stringify({ tipo: 'confirmacion_turno', turno_id: turnoId }),
  }).catch(() => {}); // best-effort: no bloquea la respuesta al operador
}

export type HuecoConUrgencia = Hueco & { dentro_urgencia: boolean };

// GET /api/turnos/huecos: la lista de horarios reservables, para "Nuevo turno" (front,
// decisión de Mateo 19/9) — así el mostrador no le promete a nadie un horario que el POST
// después rechaza. cliente_id es opcional: sin cliente elegido todavía (walk-in que ni
// siquiera tiene ficha), no hay fecha_evento que aplique el margen de confección — el POST
// vuelve a validar con el cliente real al confirmar, esto es una vista previa.
// excluirTurno: el turno que se está moviendo (moverTurno) no ocupa su propio lugar, así se puede
// correr un rato dentro del mismo día.
export async function huecosDelDia(
  sesion: Sesion,
  tipo: string,
  fecha: string,
  clienteId?: string,
  o: { excluirTurno?: string; aceptarInminente?: boolean } = {}
): Promise<{ huecos: HuecoConUrgencia[] } | Response> {
  const { data: duracion, error: e1 } = await sesion.supabase.from('duraciones_turno').select('duracion_min').eq('tipo', tipo).maybeSingle();
  if (e1) return desdeErrorDeBase(e1);
  if (!duracion) return error(400, `No hay una duración cargada para "${tipo}" en Configuración › Agenda`);

  let fechaEvento: string | null = null;
  if (clienteId) {
    const { data, error: e2 } = await sesion.supabase.from('clientes').select('fecha_evento').eq('id', clienteId).maybeSingle();
    if (e2) return desdeErrorDeBase(e2);
    if (!data) return error(409, 'Ese cliente no existe', { motivo: 'cliente_no_existe' });
    fechaEvento = data.fecha_evento;
  }

  const base = { aceptarInminente: Boolean(o.aceptarInminente), excluirTurno: o.excluirTurno };
  const [sinPisar, conPisar] = await Promise.all([
    huecosPara(sesion, tipo, duracion.duracion_min, fecha, fechaEvento, { ...base, pisarUrgencia: false }),
    huecosPara(sesion, tipo, duracion.duracion_min, fecha, fechaEvento, { ...base, pisarUrgencia: true }),
  ]);
  if (sinPisar instanceof Response) return sinPisar;
  if (conPisar instanceof Response) return conPisar;

  const clave = (h: Hueco) => `${h.inicio}|${h.probador}`;
  const libres = new Set(sinPisar.huecos.map(clave));
  return { huecos: conPisar.huecos.map((h) => ({ ...h, dentro_urgencia: !libres.has(clave(h)) })) };
}

type OpcionesAgenda = { pisarUrgencia: boolean; aceptarInminente: boolean; excluirTurno?: string };

// Evento hoy o mañana (decisión #8): Lucía no da turno, lo resuelve una persona del equipo. Desde
// el 5/10 Lucía además le pasa al cliente el teléfono del local, y quien lo atiende tiene que poder
// anotarlo en la agenda. Se puede, pero explícito (aceptar_evento_inminente, mismo criterio que
// pisar_urgencia): sin la fecha del evento, que es lo que frenaba, y pisando la reserva de
// urgencia, que existe justamente para estos casos. Sin aceptarlo, el 409 de siempre.
async function huecosPara(
  sesion: Sesion,
  tipo: string,
  duracionMin: number,
  fecha: string,
  fechaEvento: string | null,
  o: OpcionesAgenda
): Promise<{ huecos: Hueco[] } | Response> {
  const r = await validarHueco(sesion, tipo, duracionMin, fecha, fechaEvento, o.pisarUrgencia, o.excluirTurno);
  if (r instanceof Response || !r.inminente) return r;
  if (!o.aceptarInminente) {
    return error(409, 'El evento de este cliente es hoy o mañana: Lucía no le da turno, lo resuelve el equipo. Si se lo das vos, confirmalo', {
      motivo: 'evento_inminente',
    });
  }
  return validarHueco(sesion, tipo, duracionMin, fecha, null, true, o.excluirTurno);
}

async function validarHueco(
  sesion: Sesion,
  tipo: string,
  duracionMin: number,
  fecha: string,
  fechaEvento: string | null,
  pisarUrgencia: boolean,
  excluirTurno?: string
): Promise<{ huecos: Hueco[]; inminente: boolean } | Response> {
  const [config, franjasFilas, ocupadosFilas, cierreFila, bloqueosFilas, diasSimultaneosFilas] = await Promise.all([
    sesion.supabase.from('configuracion_agenda').select('escalonado_min, dias_reserva_urgencia').maybeSingle(),
    sesion.supabase.from('franjas_turnos').select('dia_semana, desde, hasta, probadores'),
    sesion.supabase
      .from('turnos')
      .select('id, probador, inicio, fin')
      .not('estado', 'in', '(cancelado,no-vino)')
      .gte('inicio', `${fecha}T00:00:00${OFFSET_NEGOCIO}`)
      .lt('inicio', `${fecha}T23:59:59.999${OFFSET_NEGOCIO}`),
    // Solo esta fecha exacta, contra el string que ya se tiene (no contra lo que devuelva la
    // consulta): así no hay conversión de la columna date a Date de por medio que pueda correr
    // el día por huso (el bug que avisó logica, una vez al año, el día del feriado). Alcanza
    // con esto porque acá desde y hasta son siempre el mismo día (ver más abajo); si esta
    // función pasara a validar un rango de días, esto tendría que volverse una consulta por
    // rango como leerCierres() de _shared/agenda/huecos.ts.
    sesion.supabase.from('cierres_agenda').select('fecha').eq('fecha', fecha).maybeSingle(),
    // Los horarios bloqueados de esta fecha (bloqueos_agenda, 0067; pedido de la dueña, 26/9).
    // Mismo criterio que el cierre: se filtra por el string de la fecha, y las horas se pasan a
    // instante acá abajo contra ese mismo string, sin que la columna date pase por un Date.
    sesion.supabase.from('bloqueos_agenda').select('desde, hasta, probador').eq('fecha', fecha),
    // dias_simultaneos: columna de la migración 0068. Si no existe todavía (PGRST205), se usa
    // el default [6] (sábado). Mismo patrón que bloqueos_agenda arriba.
    sesion.supabase.from('configuracion_agenda').select('dias_simultaneos').maybeSingle(),
  ]);
  for (const r of [config, franjasFilas, ocupadosFilas, cierreFila]) if (r.error) return desdeErrorDeBase(r.error);
  let diasSimultaneos: number[] = [6];
  if (diasSimultaneosFilas.error) {
    if (!['PGRST205', '42703'].includes(diasSimultaneosFilas.error.code ?? '')) return desdeErrorDeBase(diasSimultaneosFilas.error);
  } else if (diasSimultaneosFilas.data?.dias_simultaneos) {
    diasSimultaneos = diasSimultaneosFilas.data.dias_simultaneos as number[];
  }
  if (!config.data) return error(503, 'configuracion_agenda está vacía: la agenda no puede calcular huecos');
  // La migración 0067 la aplica Mateo a mano y puede llegar después de este deploy. Mientras la
  // tabla no exista no hay bloqueos que respetar, y dar de alta un turno no puede romperse por
  // eso: se sigue sin bloqueos (la guarda de la base igual existe desde el mismo momento que la
  // tabla). PostgREST avisa la tabla que no conoce con PGRST205 (o 42P01 si llega a la base).
  let bloqueos: BloqueoAgenda[] = [];
  if (bloqueosFilas.error) {
    if (!['PGRST205', '42P01'].includes(bloqueosFilas.error.code)) return desdeErrorDeBase(bloqueosFilas.error);
    console.error('turno-alta: bloqueos_agenda no existe todavía (falta la migración 0067); los huecos salen sin horarios bloqueados');
  } else {
    // Hora del local → instante con el offset fijo, sumando minutos desde la medianoche de la
    // fecha y no armando "T24:00": un bloqueo que va hasta el final del día se guarda con
    // hasta = 24:00:00, y eso tiene que dar las 00:00 del día siguiente.
    const medianoche = new Date(`${fecha}T00:00:00${OFFSET_NEGOCIO}`).getTime();
    const aInstante = (hora: string) => new Date(medianoche + aMinutos(hora) * 60_000);
    bloqueos = (bloqueosFilas.data ?? []).map((b) => ({ inicio: aInstante(b.desde), fin: aInstante(b.hasta), probador: b.probador }));
  }

  const reglas: ReglasAgenda = {
    franjas: (franjasFilas.data ?? []).map((f) => ({
      diaSemana: f.dia_semana,
      desde: aMinutos(f.desde),
      hasta: aMinutos(f.hasta),
      probadores: f.probadores,
    })),
    escalonadoMin: config.data.escalonado_min,
    diasReservaUrgencia: pisarUrgencia ? null : config.data.dias_reserva_urgencia,
    duracionMin,
    diasConfeccion: tipo === 'prueba_final' ? 1 : DIAS_CONFECCION_POR_DEFECTO,
    diasSimultaneos,
  };
  const ocupados: Ocupado[] = (ocupadosFilas.data ?? [])
    .filter((t) => t.id !== excluirTurno)
    .map((t) => ({
      probador: t.probador,
      inicio: new Date(t.inicio),
      fin: new Date(t.fin),
    }));

  const cerrados = new Set<string>(cierreFila.data ? [fecha] : []);
  const r = calcularHuecos(reglas, ocupados, { desde: fecha, hasta: fecha, ahora: new Date(), fechaEvento, tz: ZONA_NEGOCIO, cerrados, bloqueos });
  return { huecos: r.huecos, inminente: r.derivar === 'evento_inminente' };
}

function elegirProbador(huecos: Hueco[], inicio: Date, probadorPedido?: number): number | null {
  const iso = inicio.toISOString();
  const candidatos = huecos.filter((h) => h.inicio === iso);
  if (probadorPedido) return candidatos.some((h) => h.probador === probadorPedido) ? probadorPedido : null;
  return candidatos[0]?.probador ?? null;
}

type ResultadoInsert = { ok: true; fila: Record<string, unknown> } | { ok: false; respuesta: Response; chocoConOtroTurno: boolean };

async function insertarTurno(
  sesion: Sesion,
  clienteId: string,
  tipo: string,
  duracionMin: number,
  probador: number,
  inicio: Date,
  fin: Date
): Promise<ResultadoInsert> {
  const { data, error: e } = await sesion.supabase
    .from('turnos')
    .insert({ cliente_id: clienteId, tipo, duracion_min: duracionMin, probador, inicio: inicio.toISOString(), fin: fin.toISOString() })
    .select()
    .single();
  if (e) {
    if (e.code === '23P01') {
      return { ok: false, chocoConOtroTurno: true, respuesta: error(409, 'Ese horario ya no está disponible', { motivo: 'agenda_ocupada' }) };
    }
    return { ok: false, chocoConOtroTurno: false, respuesta: desdeErrorDeBase(e) };
  }
  return { ok: true, fila: data };
}
