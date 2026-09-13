// Qué edita el dueño desde el panel (PROCESOS.md § 5), tabla por tabla: qué columnas se
// pueden tocar, con qué reglas y quién. Es la lista blanca de los handlers de edición y de
// "volver a la versión anterior": una tabla o una columna que no esté acá no se escribe desde
// el panel. Las columnas de sistema (id, version, editado_por, editado_at, busqueda,
// telefono, creado_at…) no están nunca: las pone la base (triggers de 0003 y 0017).
//
// Quién: Configuración y Catálogo, solo un admin (0007 dejó "solo admin en precios" para
// los route handlers de paneles). Clientes y Conocimiento, cualquier perfil aprobado. Es un
// supuesto de H1.9: se cambia con `soloAdmin` en cada entidad.
//
// Los límites de largo son de cordura, no datos del negocio: los datos del negocio (precios,
// horarios, duraciones, cantidad de probadores) viven en las tablas y acá solo se validan.
import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  };
}

// 'HH:MM' o 'HH:MM:SS' → 'HH:MM:SS', para comparar horas como texto.
const hms = (v: unknown) => (typeof v === 'string' && v.length === 5 ? `${v}:00` : ((v ?? null) as string | null));

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

  // Configuración › Agenda: probadores y escalonado (0012, una sola fila).
  agenda: definir(
    'configuracion_agenda',
    { cantidad_probadores: entero(1, 20), escalonado_min: entero(1, 120) },
    {
      obligatorios: null,
      // Bajar la cantidad de probadores con turnos por venir en los que desaparecen los
      // dejaría huérfanos: se rechaza hasta que alguien los reubique.
      verificar: async (db, actual, final) => {
        const n = final.cantidad_probadores as number;
        if (!actual || n >= (actual.cantidad_probadores as number)) return null;
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
} satisfies Record<string, Entidad>;

export type ClaveEntidad = keyof typeof ENTIDADES;

export function entidadPorTabla(tabla: string): Entidad | undefined {
  return Object.values(ENTIDADES).find((e) => e.tabla === tabla);
}
