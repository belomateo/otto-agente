// Qué edita el dueño desde el panel (PROCESOS.md § 5), tabla por tabla: qué columnas se
// pueden tocar, con qué reglas y quién. Es la lista blanca de los handlers de edición y de
// "volver a la versión anterior": una tabla o una columna que no esté acá no se escribe desde
// el panel. Las columnas de sistema (id, version, editado_por, editado_at, busqueda,
// telefono, creado_at…) no están nunca: las pone la base (triggers de 0003 y 0017).
//
// Quién: Configuración y Catálogo, solo un admin (0007 dejó "solo admin en precios" para
// los route handlers de paneles). Clientes, Conocimiento y los estados de Turnos, cualquier
// perfil aprobado (el asesor de mostrador es rol 'equipo'). Es un supuesto de H1.9: se cambia
// con `soloAdmin` en cada entidad.
//
// Los límites de largo son de cordura, no datos del negocio: los datos del negocio (precios,
// horarios, duraciones, cantidad de probadores) viven en las tablas y acá solo se validan.
import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DIAS_LARGOS } from '@/lib/formato';
import { validarPromptBase } from './prompt';

export const TEMAS_FRAGMENTO = [
  'que-incluye', 'como-funciona', 'reserva-y-garantia', 'ubicacion-horarios', 'talles', 'a-medida',
  'anticipacion', 'accesorios', 'objecion-precio', 'objecion-turno', 'objecion-competencia',
  'que-no-hacemos', 'descuentos', 'novio', 'graduado', 'invitado',
] as const;
export const EVENTOS = ['casamiento', 'graduacion', 'fiesta', 'laboral', 'otro'] as const;
export const ROLES_CLIENTE = ['novio', 'invitado', 'graduado', 'padre', 'otro'] as const;

const texto = (max: number) =>
  z.string().trim().min(1, 'No puede quedar vacío').max(max, `Máximo ${max} caracteres`);
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullable()
    .transform((v) => (v === '' ? null : v));
const enlace = z
  .string()
  .trim()
  .max(500, 'Máximo 500 caracteres')
  .regex(/^https?:\/\/\S+$/i, 'Tiene que ser un link que empiece con http:// o https://');
const monto = z.number().nonnegative('No puede ser negativo').max(100_000_000, 'Monto fuera de rango');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Hora en formato HH:MM');
const entero = (min: number, max: number) =>
  z.number().int('Tiene que ser un número entero').min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`);

type Fila = Record<string, unknown>;
type Rechazo = { status: number; mensaje: string };

export type Entidad = {
  tabla: string;
  /** Solo un admin la crea, la edita o la restaura. */
  soloAdmin: boolean;
  /** Columnas que el panel puede escribir (y restaurar desde el historial). */
  columnas: string[];
  /** Esquema del alta; null = no se crea desde el panel. */
  crear: z.ZodType<Fila> | null;
  /** Esquema de una edición: cualquier subconjunto de `columnas`, nada más. */
  editar: z.ZodType<Fila>;
  /** Completa el alta con lo que se calcula (p. ej. el número de la próxima regla). */
  completarAlta?: (db: SupabaseClient, datos: Fila) => Promise<Fila>;
  /** Reglas sobre la fila completa ya combinada (p. ej. la apertura antes del cierre). */
  coherencia?: (fila: Fila) => string | null;
  /** Chequeos contra el mundo real antes de escribir (principio 6). `actual` es null en un alta. */
  verificar?: (db: SupabaseClient, actual: Fila | null, final: Fila) => Promise<Rechazo | null>;
  /** Se borra desde el panel. La base guarda la versión borrada en el historial (0030). */
  borrable: boolean;
};

function definir(
  tabla: string,
  campos: Record<string, z.ZodType>,
  o: {
    obligatorios: string[] | null;
    soloAdmin?: boolean;
    soloAlCrear?: Record<string, z.ZodType>;
    completarAlta?: Entidad['completarAlta'];
    coherencia?: Entidad['coherencia'];
    verificar?: Entidad['verificar'];
    borrable?: boolean;
  }
): Entidad {
  const opcionales = Object.fromEntries(Object.entries(campos).map(([k, s]) => [k, s.optional()]));
  const obligatorios = o.obligatorios;
  const alta =
    obligatorios === null
      ? null
      : z.strictObject({
          ...Object.fromEntries(
            Object.entries(campos).map(([k, s]) => [k, obligatorios.includes(k) ? s : s.optional()])
          ),
          ...(o.soloAlCrear ?? {}),
        });
  return {
    tabla,
    soloAdmin: o.soloAdmin ?? true,
    columnas: Object.keys(campos),
    crear: alta as unknown as z.ZodType<Fila> | null,
    editar: z.strictObject(opcionales) as unknown as z.ZodType<Fila>,
    completarAlta: o.completarAlta,
    coherencia: o.coherencia,
    verificar: o.verificar,
    borrable: o.borrable ?? false,
  };
}

// 'HH:MM' o 'HH:MM:SS' → 'HH:MM:SS', para comparar horas como texto.
const hms = (v: unknown) => (typeof v === 'string' && v.length === 5 ? `${v}:00` : ((v ?? null) as string | null));

// 'del sábado de 13:30 a 18:30', para los mensajes de franjas que se pisan.
const describirFranja = (f: { dia_semana: number; desde: string; hasta: string }) =>
  `del ${DIAS_LARGOS[f.dia_semana].toLowerCase()} de ${f.desde.slice(0, 5)} a ${f.hasta.slice(0, 5)}`;

export const ENTIDADES = {
  // Catálogo › modelos: precios, colores, talles, fotos (0016).
  modelos: definir(
    'catalogo_alquiler',
    {
      modelo: texto(120),
      precio_base: monto,
      descripcion: textoOpcional(600),
      colores: z
        .array(
          z.strictObject({
            nombre: texto(40),
            hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color en formato #RRGGBB').nullable(),
          })
        )
        .max(12, 'Máximo 12 colores'),
      talles: z.array(z.string().trim().min(1).max(8)).max(60, 'Máximo 60 talles'),
      fotos: z.array(enlace).max(12, 'Máximo 12 fotos'),
      activo: z.boolean(),
    },
    { obligatorios: ['modelo', 'precio_base'] }
  ),

  // Catálogo › accesorios.
  accesorios: definir(
    'accesorios_alquiler',
    { nombre: texto(80), precio: monto, precio_compra: monto.nullable(), activo: z.boolean() },
    { obligatorios: ['nombre', 'precio'] }
  ),

  // Configuración › Agenda: horario de cada día. dia_semana solo al abrir un día nuevo.
  horarios: definir(
    'horarios',
    {
      hora_apertura: hora,
      hora_cierre: hora,
      corte_desde: hora.nullable(),
      corte_hasta: hora.nullable(),
      activo: z.boolean(),
    },
    {
      obligatorios: ['hora_apertura', 'hora_cierre'],
      soloAlCrear: { dia_semana: entero(0, 6) },
      coherencia: (f) => {
        const [ap, ci, cd, ch] = [hms(f.hora_apertura), hms(f.hora_cierre), hms(f.corte_desde), hms(f.corte_hasta)];
        if (!ap || !ci || ap >= ci) return 'La apertura tiene que ser antes del cierre';
        if ((cd === null) !== (ch === null)) return 'El corte necesita hora de inicio y de fin (o ninguna de las dos)';
        if (cd && ch && !(ap < cd && cd < ch && ch < ci)) {
          return 'El corte tiene que quedar adentro del horario y terminar después de empezar';
        }
        return null;
      },
    }
  ),

  // Configuración › Agenda: duración de cada tipo de turno (0012).
  duraciones: definir('duraciones_turno', { duracion_min: entero(5, 600) }, { obligatorios: null }),

  // Configuración › Agenda: franjas en las que se dan turnos (0030, decisión #7 del 14/9).
  // Varias por día, cada una con cuántos probadores toman turnos (los probadores 1 a P,
  // supuesto #22). Un día sin franjas no da turnos. El horario del local es `horarios`.
  // Se borran (partir un día en dos, dejar de dar turnos una tarde) y el borrado queda en el
  // historial (0030), así que se puede volver a crear.
  franjas: definir(
    'franjas_turnos',
    { dia_semana: entero(0, 6), desde: hora, hasta: hora, probadores: entero(1, 20) },
    {
      obligatorios: ['dia_semana', 'desde', 'hasta', 'probadores'],
      borrable: true,
      coherencia: (f) => {
        const [de, ha] = [hms(f.desde), hms(f.hasta)];
        return de && ha && de < ha ? null : 'La franja tiene que terminar después de empezar';
      },
      // Lo mismo que frena la base (0030), dicho en castellano antes de escribir.
      verificar: async (db, actual, final) => {
        const [cfg, otras] = await Promise.all([
          db.from('configuracion_agenda').select('cantidad_probadores').maybeSingle(),
          db
            .from('franjas_turnos')
            .select('id, dia_semana, desde, hasta')
            .eq('dia_semana', final.dia_semana as number)
            .lt('desde', hms(final.hasta) as string)
            .gt('hasta', hms(final.desde) as string),
        ]);
        if (cfg.error) throw cfg.error;
        if (otras.error) throw otras.error;
        const max = cfg.data?.cantidad_probadores as number | undefined;
        if (max !== undefined && (final.probadores as number) > max) {
          return { status: 400, mensaje: `La agenda tiene ${max} probador(es): una franja no puede pedir ${final.probadores}` };
        }
        const pisa = (otras.data ?? []).find((o) => o.id !== actual?.id);
        return pisa ? { status: 409, mensaje: `Se pisa con la franja ${describirFranja(pisa)}` } : null;
      },
    }
  ),

  // Configuración › Agenda: probadores, escalonado, reserva de urgencia y aviso de turno (0012,
  // 0030 y 0031, una sola fila). dias_reserva_urgencia null = sin reserva (decisión #9,
  // supuesto #21). aviso_turno_min: cuántos minutos antes de cada turno sale el cartel
  // (decisión #10); desde el panel no se vacía.
  agenda: definir(
    'configuracion_agenda',
    {
      cantidad_probadores: entero(1, 20),
      escalonado_min: entero(1, 120),
      dias_reserva_urgencia: entero(1, 365).nullable(),
      aviso_turno_min: entero(1, 240),
    },
    {
      obligatorios: null,
      // Bajar la cantidad de probadores deja afuera a los que desaparecen: se rechaza si una
      // franja todavía los usa (la base también lo frena, 0030) o si tienen turnos por venir,
      // hasta que alguien baje esas franjas o reubique esos turnos.
      verificar: async (db, actual, final) => {
        const n = final.cantidad_probadores as number;
        if (!actual || n >= (actual.cantidad_probadores as number)) return null;
        const franjas = await db
          .from('franjas_turnos')
          .select('id', { count: 'exact', head: true })
          .gt('probadores', n);
        if (franjas.error) throw franjas.error;
        if (franjas.count) {
          return {
            status: 409,
            mensaje: `Hay ${franjas.count} franja(s) de turnos que usan más de ${n} probador(es): bajalas antes de bajar la cantidad`,
          };
        }
        const { count, error } = await db
          .from('turnos')
          .select('id', { count: 'exact', head: true })
          .gt('probador', n)
          .gte('fin', new Date().toISOString())
          .not('estado', 'in', '(cancelado,no-vino)');
        if (error) throw error;
        return count
          ? {
              status: 409,
              mensaje: `Hay ${count} turno(s) por venir en probadores que dejarían de existir: reubicalos antes de bajar la cantidad`,
            }
          : null;
      },
    }
  ),

  // Conocimiento: fragmentos (activar, editar; la versión la lleva el trigger).
  fragmentos: definir(
    'fragmentos',
    { tema: z.enum(TEMAS_FRAGMENTO), titulo: texto(120), texto: texto(4000), activo: z.boolean() },
    { obligatorios: ['tema', 'titulo', 'texto'], soloAdmin: false }
  ),

  // Configuración › Reglas. Sin número, va al final.
  reglas: definir(
    'reglas_agente',
    { numero: entero(1, 999), texto: texto(500), activo: z.boolean() },
    {
      obligatorios: ['texto'],
      completarAlta: async (db, datos) => {
        if (datos.numero !== undefined) return datos;
        const { data, error } = await db
          .from('reglas_agente')
          .select('numero')
          .order('numero', { ascending: false })
          .limit(1);
        if (error) throw error;
        return { ...datos, numero: ((data?.[0]?.numero as number | undefined) ?? 0) + 1 };
      },
    }
  ),

  // Configuración › Lucía: presentación, tono, ancla de valor… (claves fijas: solo el valor).
  contexto: definir('contexto_agente', { valor: texto(4000) }, { obligatorios: null }),

  // Configuración › Lucía › Avanzado: el prompt base. Nunca se guarda si el generador no lo
  // aprueba (PROCESOS.md § 8): la versión anterior sigue activa.
  prompt: definir(
    'prompt_base',
    {
      texto: z
        .string()
        .min(1, 'No puede quedar vacío')
        .max(100_000)
        .transform((v) => v.replace(/\r\n?/g, '\n')),
    },
    { obligatorios: ['texto'], verificar: async (_db, _actual, final) => validarPromptBase(final.texto as string) }
  ),

  // Configuración › Herramientas: activar/desactivar y la descripción que lee Lucía. El
  // schema y las precondiciones viven en código (agente, H1.4) y no se tocan desde acá.
  herramientas: definir(
    'herramientas_agente',
    { activa: z.boolean(), descripcion: texto(1000) },
    { obligatorios: null }
  ),

  // Configuración › Notas: texto libre que se inyecta como notas-del-dueno.
  notas: definir(
    'notas_dueno',
    { titulo: textoOpcional(120), texto: texto(4000), activo: z.boolean() },
    { obligatorios: ['texto'] }
  ),

  // Clientes: la ficha (AGENTE.md § 7, columnas de 1.15). El teléfono no se edita: es la
  // identidad del cliente en WhatsApp.
  clientes: definir(
    'clientes',
    {
      nombre: textoOpcional(120),
      email: z
        .string()
        .trim()
        .max(200)
        .regex(/^([^\s@]+@[^\s@]+\.[^\s@]+)?$/, 'Email inválido')
        .nullable()
        .transform((v) => (v === '' ? null : v)),
      evento: z.enum(EVENTOS).nullable(),
      fecha_evento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato AAAA-MM-DD').nullable(),
      rol: z.enum(ROLES_CLIENTE).nullable(),
      dia_o_noche: z.enum(['dia', 'noche']).nullable(),
      talle_aprox: textoOpcional(20),
      ciudad: textoOpcional(80),
      color_preferido: textoOpcional(60),
      presupuesto_mencionado: textoOpcional(120),
      notas_libres: textoOpcional(4000),
    },
    { obligatorios: null, soloAdmin: false }
  ),

  // Configuración › Enlaces: web, mapa, reseña.
  enlaces: definir(
    'enlaces',
    { nombre: texto(80), url: enlace, activo: z.boolean() },
    { obligatorios: ['nombre', 'url'] }
  ),

  // Turnos: los 5 estados que marca el asesor desde la pestaña Turnos (PROCESOS.md § 2, "En el
  // local" y "Retiro y devolución"). sin-confirmar/confirmado no se tocan por acá: sin-confirmar
  // es el inicial y confirmado sale del OK del cartel (H1.16) o del botón de WhatsApp del
  // cliente. No hay alta ni borrado: el turno ya existe (agendar_turno, o el propio panel más
  // adelante). Transiciones válidas — no todas las que acepta el enum de la base (0011):
  //   alquilo   ← sin-confirmar | confirmado   (tomó las medidas, se reservó con el 100%)
  //   retiro    ← alquilo                       (retiró la prenda)
  //   devolvio  ← retiro                        (la devolvió)
  //   no-vino   ← sin-confirmar | confirmado    (no se presentó)
  //   cancelado ← sin-confirmar | confirmado | alquilo | retiro, con motivo_cancelacion
  // devolvio, no-vino y cancelado son finales: no se editan por acá (0011 ya libera el hueco
  // de la agenda). Editar solo motivo_cancelacion sin cambiar el estado está permitido (p. ej.
  // corregirlo). historial_ediciones y editado_por salen gratis de 0004/0017 (turnos ya tiene
  // el trigger de autoría); cancelado_at lo pone 0011.
  turnos: definir(
    'turnos',
    { estado: z.enum(['alquilo', 'retiro', 'devolvio', 'no-vino', 'cancelado']), motivo_cancelacion: textoOpcional(300) },
    {
      obligatorios: null,
      soloAdmin: false,
      verificar: async (_db, actual, final) => {
        if (!actual) return null;
        const previo = actual.estado as string;
        const nuevo = final.estado as string;
        if (nuevo === previo) return null; // no cambia el estado (p. ej. solo el motivo)
        const origenValido: Record<string, string[]> = {
          alquilo: ['sin-confirmar', 'confirmado'],
          retiro: ['alquilo'],
          devolvio: ['retiro'],
          'no-vino': ['sin-confirmar', 'confirmado'],
          cancelado: ['sin-confirmar', 'confirmado', 'alquilo', 'retiro'],
        };
        if (!origenValido[nuevo]?.includes(previo)) {
          return { status: 409, mensaje: `No se puede pasar de "${previo}" a "${nuevo}"` };
        }
        if (nuevo === 'cancelado' && !(final.motivo_cancelacion as string | null)?.trim()) {
          return { status: 400, mensaje: 'Cancelar un turno necesita un motivo' };
        }
        return null;
      },
    }
  ),
} satisfies Record<string, Entidad>;

export type ClaveEntidad = keyof typeof ENTIDADES;

export function entidadPorTabla(tabla: string): Entidad | undefined {
  return Object.values(ENTIDADES).find((e) => e.tabla === tabla);
}
