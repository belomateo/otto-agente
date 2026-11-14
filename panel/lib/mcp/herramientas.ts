// Las herramientas del conector de Sofía (ver lib/mcp/sesion.ts). Cada una llama a una ruta de /api del panel,
// con la misma validación, permisos e historial. Solo lo que pidió Mateo (13/11): ver, manejar reservas, días y
// horarios, corregir información y volver a la versión anterior. Nada de código, de instrucciones internas de
// Lucía, de borrar ni de escribirle a clientes desde acá.
import 'server-only';
import { NextRequest } from 'next/server';
import { GET as agendaDia, POST as altaTurno } from '@/app/api/turnos/route';
import { GET as agendaSemana } from '@/app/api/turnos/semana/route';
import { GET as huecos } from '@/app/api/turnos/huecos/route';
import { GET as clientesParaTurno } from '@/app/api/turnos/clientes/route';
import { PATCH as editarTurno } from '@/app/api/turnos/[id]/route';
import { POST as moverTurno } from '@/app/api/turnos/[id]/mover/route';
import { POST as bloquear } from '@/app/api/turnos/bloqueos/route';
import { DELETE as desbloquear } from '@/app/api/turnos/bloqueos/[id]/route';
import { POST as cerrarDia, GET as verCierres } from '@/app/api/configuracion/cierres/route';
import { DELETE as reabrirDia } from '@/app/api/configuracion/cierres/[fecha]/route';
import { GET as bandeja } from '@/app/api/bandeja/route';
import { GET as charla } from '@/app/api/bandeja/[id]/route';
import { POST as devolverALucia } from '@/app/api/bandeja/[id]/devolver/route';
import { GET as atencion } from '@/app/api/atencion/route';
import { GET as conocimiento } from '@/app/api/conocimiento/route';
import { GET as catalogo } from '@/app/api/catalogo/route';
import { GET as configuracion } from '@/app/api/configuracion/route';
import { GET as historial } from '@/app/api/historial/route';
import { POST as restaurar } from '@/app/api/historial/[id]/restaurar/route';
import { PATCH as editarFragmento } from '@/app/api/conocimiento/fragmentos/[id]/route';
import { PATCH as editarModelo } from '@/app/api/catalogo/modelos/[id]/route';
import { PATCH as editarAccesorio } from '@/app/api/catalogo/accesorios/[id]/route';
import { PATCH as editarTexto } from '@/app/api/configuracion/contexto/[id]/route';
import { PATCH as editarHorario } from '@/app/api/configuracion/horarios/[id]/route';
import { PATCH as editarFranja } from '@/app/api/configuracion/franjas/[id]/route';
import { PATCH as editarEnlace } from '@/app/api/configuracion/enlaces/[id]/route';
import { sesionDelConector } from './sesion';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Manejador = (request: NextRequest, ctx: { params: Promise<any> }) => Promise<Response>;
type Llamada = { manejador: Manejador; metodo: string; ruta: string; query?: Record<string, string | undefined>; cuerpo?: unknown; params?: Record<string, string> };
export type Resultado = { texto: string; error: boolean };

const MAXIMO = 60_000;

async function llamar(l: Llamada): Promise<Resultado> {
  const url = new URL(l.ruta, 'https://panel.interno');
  for (const [k, v] of Object.entries(l.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const request = new NextRequest(url, {
    method: l.metodo,
    headers: { 'content-type': 'application/json' },
    body: l.cuerpo === undefined ? undefined : JSON.stringify(l.cuerpo),
  });
  const r = await l.manejador(request, { params: Promise.resolve(l.params ?? {}) });
  let texto = await r.text();
  if (texto.length > MAXIMO) texto = texto.slice(0, MAXIMO) + '\n…(recortado: pedí algo más puntual)';
  return r.ok ? { texto, error: false } : { texto: `El sistema respondió ${r.status}: ${texto}`, error: true };
}

type Esquema = { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
type Herramienta = {
  name: string;
  title: string;
  description: string;
  inputSchema: Esquema;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  ejecutar: (a: Record<string, unknown>) => Promise<Resultado> | Resultado;
};

const s = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const n = (description: string) => ({ type: 'integer', description });
const obj = (properties: Record<string, unknown>, required: string[] = []): Esquema => ({ type: 'object', properties, required, additionalProperties: false });
const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
const LEER = { readOnlyHint: true, openWorldHint: false };
const CAMBIAR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const FECHA = s('Fecha AAAA-MM-DD (hora de Rosario).', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const VERSION = n('La versión actual de esa fila, tal como la devolvió la consulta (evita pisar un cambio de otra persona).');
const TIPOS = ['graduado', 'novio', 'invitado', 'doble', 'triple', 'prueba_final'];

const DATOS_EDITABLES: Record<string, { manejador: Manejador; ruta: string; tabla: string }> = {
  informacion_del_local: { manejador: editarFragmento as Manejador, ruta: '/api/conocimiento/fragmentos/', tabla: 'fragmentos' },
  modelo_del_catalogo: { manejador: editarModelo as Manejador, ruta: '/api/catalogo/modelos/', tabla: 'catalogo_alquiler' },
  accesorio: { manejador: editarAccesorio as Manejador, ruta: '/api/catalogo/accesorios/', tabla: 'accesorios_alquiler' },
  texto_automatico: { manejador: editarTexto as Manejador, ruta: '/api/configuracion/contexto/', tabla: 'contexto_agente' },
  horario_del_local: { manejador: editarHorario as Manejador, ruta: '/api/configuracion/horarios/', tabla: 'horarios' },
  franja_de_turnos: { manejador: editarFranja as Manejador, ruta: '/api/configuracion/franjas/', tabla: 'franjas_turnos' },
  enlace: { manejador: editarEnlace as Manejador, ruta: '/api/configuracion/enlaces/', tabla: 'enlaces' },
};

export const HERRAMIENTAS: Herramienta[] = [
  // ── Ver ──────────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'ver_agenda_del_dia', title: 'Ver la agenda de un día', annotations: LEER,
    description: 'Turnos de un día (cliente, hora, tipo, estado, probador), los bloqueos, si el día está cerrado y el horario. Usala antes de mover o cancelar un turno: trae el id y la versión de cada turno.',
    inputSchema: obj({ fecha: FECHA }, ['fecha']),
    ejecutar: (a) => llamar({ manejador: agendaDia as Manejador, metodo: 'GET', ruta: '/api/turnos', query: { fecha: str(a.fecha) } }),
  },
  {
    name: 'ver_agenda_de_la_semana', title: 'Ver la agenda de una semana', annotations: LEER,
    description: 'Los turnos de los 7 días que arrancan en la fecha dada.',
    inputSchema: obj({ desde: FECHA }, ['desde']),
    ejecutar: (a) => llamar({ manejador: agendaSemana as Manejador, metodo: 'GET', ruta: '/api/turnos/semana', query: { desde: str(a.desde) } }),
  },
  {
    name: 'buscar_horarios_libres', title: 'Buscar horarios libres', annotations: LEER,
    description: 'Horarios libres de un día para un tipo de turno, con el probador. Usala antes de crear o mover un turno. Para mover uno, pasá su id en excluir (así cuenta su propio lugar como libre).',
    inputSchema: obj({ fecha: FECHA, tipo: s('Tipo de turno.', { enum: TIPOS }), excluir: s('Id del turno que se va a mover (opcional).') }, ['fecha', 'tipo']),
    ejecutar: (a) => llamar({ manejador: huecos as Manejador, metodo: 'GET', ruta: '/api/turnos/huecos', query: { fecha: str(a.fecha), tipo: str(a.tipo), excluir: str(a.excluir) } }),
  },
  {
    name: 'buscar_cliente', title: 'Buscar un cliente', annotations: LEER,
    description: 'Busca clientes por nombre o teléfono (para crear un turno o ver sus datos). Devuelve el id del cliente.',
    inputSchema: obj({ texto: s('Nombre o teléfono, como lo escribiría alguien.') }, ['texto']),
    ejecutar: (a) => llamar({ manejador: clientesParaTurno as Manejador, metodo: 'GET', ruta: '/api/turnos/clientes', query: { q: str(a.texto) } }),
  },
  {
    name: 'ver_charlas', title: 'Ver las charlas de WhatsApp', annotations: LEER,
    description: 'Lista de charlas de WhatsApp, las más recientes primero. filtro: todas, lucia (las atiende Lucía), persona (las tiene el equipo), sin-respuesta. texto busca por nombre o teléfono.',
    inputSchema: obj({ filtro: s('Qué charlas.', { enum: ['todas', 'lucia', 'persona', 'sin-respuesta'] }), texto: s('Nombre o teléfono (opcional).') }),
    ejecutar: (a) => llamar({ manejador: bandeja as Manejador, metodo: 'GET', ruta: '/api/bandeja', query: { filtro: str(a.filtro) ?? 'todas', q: str(a.texto) } }),
  },
  {
    name: 'leer_charla', title: 'Leer una charla', annotations: LEER,
    description: 'Todos los mensajes de una charla (cliente, Lucía y equipo) y la ficha del cliente. El id sale de ver_charlas.',
    inputSchema: obj({ id: s('Id de la charla.') }, ['id']),
    ejecutar: (a) => llamar({ manejador: charla as Manejador, metodo: 'GET', ruta: `/api/bandeja/${str(a.id)}`, params: { id: String(a.id) } }),
  },
  {
    name: 'ver_charlas_que_esperan_al_equipo', title: 'Charlas que esperan al equipo', annotations: LEER,
    description: 'Charlas que Lucía pasó a una persona del equipo y todavía nadie atendió (o las ya atendidas con estado=atendida).',
    inputSchema: obj({ estado: s('pendiente (por defecto) o atendida.', { enum: ['pendiente', 'atendida'] }) }),
    ejecutar: (a) => llamar({ manejador: atencion as Manejador, metodo: 'GET', ruta: '/api/atencion', query: { estado: str(a.estado) ?? 'pendiente' } }),
  },
  {
    name: 'ver_informacion_del_local', title: 'Ver lo que sabe Lucía', annotations: LEER,
    description: 'La base de conocimiento que usa Lucía (cómo funciona el alquiler, pagos, retiro, talles, políticas…), con el id y la versión de cada parte para poder corregirla.',
    inputSchema: obj({}),
    ejecutar: () => llamar({ manejador: conocimiento as Manejador, metodo: 'GET', ruta: '/api/conocimiento' }),
  },
  {
    name: 'ver_catalogo_y_precios', title: 'Ver catálogo y precios', annotations: LEER,
    description: 'Modelos de alquiler y accesorios con sus precios, con id y versión para poder corregirlos.',
    inputSchema: obj({}),
    ejecutar: () => llamar({ manejador: catalogo as Manejador, metodo: 'GET', ruta: '/api/catalogo' }),
  },
  {
    name: 'ver_configuracion', title: 'Ver horarios y textos', annotations: LEER,
    description: 'Horarios del local, franjas de turnos por día, duraciones, textos automáticos que manda el sistema y enlaces (catálogo, mapa, reseñas), con id y versión de cada uno.',
    inputSchema: obj({}),
    ejecutar: () => llamar({ manejador: configuracion as Manejador, metodo: 'GET', ruta: '/api/configuracion' }),
  },
  {
    name: 'ver_dias_cerrados', title: 'Ver días cerrados', annotations: LEER,
    description: 'Los días en que el local está cerrado (feriados o cierres puntuales) cargados de hoy en adelante.',
    inputSchema: obj({}),
    ejecutar: () => llamar({ manejador: verCierres as Manejador, metodo: 'GET', ruta: '/api/configuracion/cierres' }),
  },
  {
    name: 'ver_historial_de_cambios', title: 'Ver el historial de un dato', annotations: LEER,
    description: 'Las versiones anteriores de un dato (quién lo cambió, cuándo y cómo era). Cada versión trae un id para volver a ella con volver_a_una_version_anterior.',
    inputSchema: obj({ que: s('Qué tipo de dato.', { enum: Object.keys(DATOS_EDITABLES).concat(['turno']) }), id: s('Id del dato.') }, ['que', 'id']),
    ejecutar: (a) => {
      const tabla = a.que === 'turno' ? 'turnos' : DATOS_EDITABLES[String(a.que)]?.tabla;
      if (!tabla) return { texto: 'Ese tipo de dato no tiene historial.', error: true };
      return llamar({ manejador: historial as Manejador, metodo: 'GET', ruta: '/api/historial', query: { tabla, id: str(a.id) } });
    },
  },
  {
    name: 'resumen_de_numeros', title: 'Números del período', annotations: LEER,
    description: 'Cuántas charlas empezaron, cuántos turnos se agendaron (por Lucía y por el equipo), cuántos se cancelaron y cuántas charlas esperan al equipo, entre dos fechas.',
    inputSchema: obj({ desde: FECHA, hasta: FECHA }, ['desde', 'hasta']),
    ejecutar: (a) => resumen(String(a.desde), String(a.hasta)),
  },
  // ── Reservas ─────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'crear_turno', title: 'Crear un turno', annotations: CAMBIAR,
    description: 'Agenda un turno nuevo. Antes: buscar_cliente (o pasá cliente_nuevo con teléfono) y buscar_horarios_libres. Al crearlo, el sistema le manda al cliente el aviso del turno por WhatsApp. Confirmá con Sofía día, hora, cliente y tipo antes de llamarla.',
    inputSchema: obj({
      cliente_id: s('Id del cliente existente.'),
      cliente_nuevo: { type: 'object', properties: { telefono: s('Teléfono con código de área.'), nombre: s('Nombre.') }, required: ['telefono'], additionalProperties: false },
      tipo: s('Tipo de turno.', { enum: TIPOS }),
      inicio: s('Fecha y hora con zona, p. ej. 2026-11-20T15:00:00-03:00.'),
      probador: n('Probador (opcional; si no, el primero libre).'),
      descripcion: s('Una línea sobre el turno (opcional).'),
    }, ['tipo', 'inicio']),
    ejecutar: (a) => llamar({ manejador: altaTurno as Manejador, metodo: 'POST', ruta: '/api/turnos', cuerpo: a }),
  },
  {
    name: 'mover_turno', title: 'Mover un turno', annotations: CAMBIAR,
    description: 'Pasa un turno a otro día u hora (y opcionalmente a otro tipo, p. ej. de invitado a doble). Antes: ver_agenda_del_dia (id y versión) y buscar_horarios_libres con excluir=id. Confirmá con Sofía.',
    inputSchema: obj({ id: s('Id del turno.'), version: VERSION, inicio: s('Nueva fecha y hora con zona.'), probador: n('Probador (opcional).'), tipo: s('Nuevo tipo (opcional).', { enum: TIPOS }) }, ['id', 'version', 'inicio']),
    ejecutar: ({ id, ...cuerpo }) => llamar({ manejador: moverTurno as Manejador, metodo: 'POST', ruta: `/api/turnos/${str(id)}/mover`, params: { id: String(id) }, cuerpo }),
  },
  {
    name: 'cancelar_turno', title: 'Cancelar un turno', annotations: { ...CAMBIAR, destructiveHint: true },
    description: 'Cancela un turno (no lo borra: queda en el historial y se puede volver atrás). Necesita un motivo. Confirmá con Sofía.',
    inputSchema: obj({ id: s('Id del turno.'), version: VERSION, motivo: s('Por qué se cancela.') }, ['id', 'version', 'motivo']),
    ejecutar: (a) => llamar({ manejador: editarTurno as Manejador, metodo: 'PATCH', ruta: `/api/turnos/${str(a.id)}`, params: { id: String(a.id) }, cuerpo: { version: a.version, estado: 'cancelado', motivo_cancelacion: a.motivo } }),
  },
  {
    name: 'marcar_turno', title: 'Marcar qué pasó con un turno', annotations: CAMBIAR,
    description: 'Marca el resultado de un turno: alquilo (alquiló), retiro (retiró el traje), devolvio (lo devolvió) o no-vino. Confirmá con Sofía.',
    inputSchema: obj({ id: s('Id del turno.'), version: VERSION, estado: s('Qué pasó.', { enum: ['alquilo', 'retiro', 'devolvio', 'no-vino'] }) }, ['id', 'version', 'estado']),
    ejecutar: (a) => llamar({ manejador: editarTurno as Manejador, metodo: 'PATCH', ruta: `/api/turnos/${str(a.id)}`, params: { id: String(a.id) }, cuerpo: { version: a.version, estado: a.estado } }),
  },
  // ── Días y horarios ──────────────────────────────────────────────────────────────────────────────
  {
    name: 'cerrar_un_dia', title: 'Cerrar un día (feriado o cierre)', annotations: CAMBIAR,
    description: 'Cierra el local un día (de hoy en adelante): ese día no se dan turnos. Si ya hay turnos, no los cancela: avisa cuáles son y hay que volver a llamarla con confirmar=true. Confirmá con Sofía.',
    inputSchema: obj({ fecha: FECHA, motivo: s('Por qué (p. ej. feriado).'), confirmar: { type: 'boolean', description: 'true para cerrar aunque haya turnos.' } }, ['fecha']),
    ejecutar: (a) => llamar({ manejador: cerrarDia as Manejador, metodo: 'POST', ruta: '/api/configuracion/cierres', cuerpo: a }),
  },
  {
    name: 'reabrir_un_dia', title: 'Volver a abrir un día cerrado', annotations: CAMBIAR,
    description: 'Saca el cierre de un día: vuelven a darse turnos. Confirmá con Sofía.',
    inputSchema: obj({ fecha: FECHA }, ['fecha']),
    ejecutar: (a) => llamar({ manejador: reabrirDia as Manejador, metodo: 'DELETE', ruta: `/api/configuracion/cierres/${str(a.fecha)}`, params: { fecha: String(a.fecha) } }),
  },
  {
    name: 'bloquear_horario', title: 'Bloquear un horario o un probador', annotations: CAMBIAR,
    description: 'Tapa un rato de un día: para todos los probadores (achicar el horario) o para uno (probador roto, etc.). Ni Lucía ni el panel dan turnos ahí. Si ya hay turnos en ese rato, no se cancelan: avisa cuáles y hay que llamarla con confirmar=true. Confirmá con Sofía.',
    inputSchema: obj({
      fecha: FECHA, desde: s('HH:MM'), hasta: s('HH:MM, o 24:00 para hasta el cierre.'),
      probador: { type: ['integer', 'null'], description: 'Número de probador, o null para todos.' },
      motivo: s('Por qué (opcional).'), confirmar: { type: 'boolean', description: 'true para bloquear aunque haya turnos.' },
    }, ['fecha', 'desde', 'hasta', 'probador']),
    ejecutar: (a) => llamar({ manejador: bloquear as Manejador, metodo: 'POST', ruta: '/api/turnos/bloqueos', cuerpo: a }),
  },
  {
    name: 'quitar_bloqueo', title: 'Quitar un bloqueo', annotations: CAMBIAR,
    description: 'Saca un bloqueo de horario (el id sale de ver_agenda_del_dia). Confirmá con Sofía.',
    inputSchema: obj({ id: s('Id del bloqueo.') }, ['id']),
    ejecutar: (a) => llamar({ manejador: desbloquear as Manejador, metodo: 'DELETE', ruta: `/api/turnos/bloqueos/${str(a.id)}`, params: { id: String(a.id) } }),
  },
  // ── Información ──────────────────────────────────────────────────────────────────────────────────
  {
    name: 'corregir_dato', title: 'Corregir un dato del sistema', annotations: CAMBIAR,
    description:
      'Corrige un dato: información del local que usa Lucía, un modelo o accesorio del catálogo (precio, nombre, activo), un texto automático, un horario del local, una franja de turnos o un enlace. ' +
      'Primero leé el dato (ver_informacion_del_local, ver_catalogo_y_precios o ver_configuracion) para tener el id, la versión y los nombres exactos de los campos; mandá solo los campos que cambian. ' +
      'Queda en el historial y se puede volver atrás. Mostrale a Sofía el antes y el después y confirmá antes de llamarla.',
    inputSchema: obj({
      que: s('Qué tipo de dato.', { enum: Object.keys(DATOS_EDITABLES) }),
      id: s('Id del dato.'), version: VERSION,
      campos: { type: 'object', description: 'Los campos que cambian, con los mismos nombres que devolvió la consulta (p. ej. {"texto": "…"} o {"precio": 190000}).', additionalProperties: true },
    }, ['que', 'id', 'version', 'campos']),
    ejecutar: (a) => {
      const d = DATOS_EDITABLES[String(a.que)];
      if (!d) return { texto: 'Ese tipo de dato no se puede corregir desde acá.', error: true };
      return llamar({ manejador: d.manejador, metodo: 'PATCH', ruta: `${d.ruta}${str(a.id)}`, params: { id: String(a.id) }, cuerpo: { version: a.version, ...(a.campos as object) } });
    },
  },
  {
    name: 'volver_a_una_version_anterior', title: 'Volver a una versión anterior', annotations: CAMBIAR,
    description: 'Deshace un cambio: deja un dato como estaba en una versión del historial (el id de esa versión sale de ver_historial_de_cambios). version es la versión ACTUAL del dato. La restauración también queda en el historial. Confirmá con Sofía.',
    inputSchema: obj({ version_del_historial_id: s('Id de la versión a la que se vuelve.'), version: VERSION }, ['version_del_historial_id', 'version']),
    ejecutar: (a) => llamar({ manejador: restaurar as Manejador, metodo: 'POST', ruta: `/api/historial/${str(a.version_del_historial_id)}/restaurar`, params: { id: String(a.version_del_historial_id) }, cuerpo: { version: a.version } }),
  },
  // ── Charlas ──────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'devolver_charla_a_lucia', title: 'Devolver una charla a Lucía', annotations: CAMBIAR,
    description: 'Una charla que tenía el equipo vuelve a Lucía: el próximo mensaje del cliente lo contesta ella. Confirmá con Sofía.',
    inputSchema: obj({ id: s('Id de la charla.') }, ['id']),
    ejecutar: (a) => llamar({ manejador: devolverALucia as Manejador, metodo: 'POST', ruta: `/api/bandeja/${str(a.id)}/devolver`, params: { id: String(a.id) } }),
  },
];

// Números de un período, con la sesión del conector (RLS de admin). Fechas en hora de Rosario.
async function resumen(desde: string, hasta: string): Promise<Resultado> {
  const ses = sesionDelConector.getStore();
  if (!ses || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { texto: 'Fechas inválidas (AAAA-MM-DD).', error: true };
  const ini = `${desde}T00:00:00-03:00`;
  const fin = new Date(Date.parse(`${hasta}T00:00:00-03:00`) + 86_400_000).toISOString();
  const db = ses.supabase;
  const contar = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  try {
    const [charlas, turnos, deLucia, cancelados, esperan] = await Promise.all([
      contar(db.from('conversaciones').select('id', { count: 'exact', head: true }).neq('canal', 'prueba').gte('iniciado_at', ini).lt('iniciado_at', fin)),
      contar(db.from('turnos').select('id', { count: 'exact', head: true }).gte('creado_at', ini).lt('creado_at', fin)),
      contar(db.from('turnos').select('id', { count: 'exact', head: true }).eq('editado_por', 'lucia').gte('creado_at', ini).lt('creado_at', fin)),
      contar(db.from('turnos').select('id', { count: 'exact', head: true }).eq('estado', 'cancelado').gte('creado_at', ini).lt('creado_at', fin)),
      contar(db.from('derivaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')),
    ]);
    return {
      texto: JSON.stringify({ desde, hasta, charlas_nuevas: charlas, turnos_agendados: turnos, agendados_por_lucia: deLucia, cargados_por_el_equipo: turnos - deLucia, de_esos_cancelados: cancelados, charlas_que_esperan_al_equipo_hoy: esperan }),
      error: false,
    };
  } catch (e) {
    return { texto: `No se pudieron contar los números: ${(e as Error).message}`, error: true };
  }
}

export async function ejecutarHerramienta(nombre: string, args: Record<string, unknown>, sesion: Parameters<typeof sesionDelConector.run>[0]): Promise<Resultado> {
  const h = HERRAMIENTAS.find((x) => x.name === nombre);
  if (!h) return { texto: `No existe la herramienta ${nombre}.`, error: true };
  return sesionDelConector.run(sesion, async () => {
    try {
      return await h.ejecutar(args ?? {});
    } catch (e) {
      console.error('[mcp] herramienta', nombre, e);
      return { texto: `Falló ${nombre}: ${(e as Error).message}`, error: true };
    }
  });
}
