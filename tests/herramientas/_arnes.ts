// Arnés de las pruebas de herramientas (hito 1.4). Cada prueba corre adentro de una transacción
// contra la base real y termina en rollback: lo que escribe una herramienta se verifica contra
// la base y no queda nada (control 5). El horario, las duraciones y los probadores se fijan
// adentro de la transacción, así la prueba no depende de lo que el dueño tenga cargado, y las
// fechas son de 2030, lejos de cualquier turno real.
//
// Correr: deno test --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=.env tests/herramientas

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { assertEquals } from "jsr:@std/assert@1.0.13";
import { type ClienteSql, dbDesde } from "../../supabase/functions/_shared/db.ts";
import type { TipoTurno } from "../../supabase/functions/_shared/enums.ts";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import type {
  Agenda,
  Calendario,
  ContextoHerramienta,
  Hueco,
  Resultado,
  ResultadoAgenda,
  TurnoParaCalendario,
} from "../../supabase/functions/_shared/herramientas/tipos.ts";
import { MS_POR_MINUTO } from "../../supabase/functions/_shared/tiempo.ts";
import { trazaNueva } from "../../supabase/functions/_shared/traza.ts";

export const TZ = "America/Argentina/Cordoba";
export const AHORA = new Date("2030-06-03T12:00:00-03:00"); // lunes al mediodía
export const LUNES = "2030-06-03";
export const MARTES = "2030-06-04";
export const MIERCOLES = "2030-06-05";
export const JUEVES = "2030-06-06";
export const SABADO = "2030-06-08";
export const DOMINGO = "2030-06-09";
export const FECHA_EVENTO = "2030-06-20";

export const local = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00-03:00`);
export const iso = (ymd: string, hm: string) => `${ymd}T${hm}:00-03:00`;

export function hueco(ymd: string, hm: string, minutos: number, probador = 1): Hueco {
  const inicio = local(ymd, hm);
  return {
    inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + minutos * MS_POR_MINUTO).toISOString(),
    probador,
  };
}

// El texto fijo de la derivación por evento hoy o mañana, adentro de la transacción: así la
// prueba demuestra que sale de contexto_agente y no de un texto escrito en el código.
export const TEXTO_EVENTO_INMINENTE = "Texto de prueba: te paso con un asesor del local.";

// La agenda de logica (H1.13) todavía no existe: el doble devuelve lo que la prueba le carga,
// aunque esté mal (así se prueba que las herramientas no le creen).
export class AgendaDoble implements Agenda {
  lista: Hueco[] = [];
  derivar: "evento_inminente" | undefined = undefined;
  pedidos: { desde: string; hasta: string; tipo: TipoTurno; fechaEvento: string | null }[] = [];
  huecos(p: { desde: string; hasta: string; tipo: TipoTurno; ahora: Date; fechaEvento: string | null }): Promise<ResultadoAgenda> {
    this.pedidos.push({ desde: p.desde, hasta: p.hasta, tipo: p.tipo, fechaEvento: p.fechaEvento });
    return Promise.resolve(this.derivar ? { huecos: [], derivar: this.derivar } : { huecos: this.lista });
  }
}

export class CalendarioDoble implements Calendario {
  llamadas: { accion: string; eventoId: string | null; turnoId?: string }[] = [];
  falla = false;
  #n = 0;
  crear(t: TurnoParaCalendario): Promise<{ eventoId: string | null }> {
    this.llamadas.push({ accion: "crear", eventoId: null, turnoId: t.turnoId });
    if (this.falla) return Promise.reject(new Error("credencial inválida (prueba)"));
    return Promise.resolve({ eventoId: `evento-prueba-${++this.#n}` });
  }
  mover(eventoId: string | null, t: TurnoParaCalendario): Promise<{ eventoId: string | null }> {
    this.llamadas.push({ accion: "mover", eventoId, turnoId: t.turnoId });
    if (this.falla) return Promise.reject(new Error("credencial inválida (prueba)"));
    return Promise.resolve({ eventoId });
  }
  cancelar(eventoId: string | null): Promise<void> {
    this.llamadas.push({ accion: "cancelar", eventoId });
    if (this.falla) return Promise.reject(new Error("credencial inválida (prueba)"));
    return Promise.resolve();
  }
}

export type Escenario = {
  sql: pg.Client;
  ctx: ContextoHerramienta;
  agenda: AgendaDoble;
  calendario: CalendarioDoble;
  clienteId: string;
  conversacionId: string;
};

function urlDeLaBase(): string {
  const u = Deno.env.get("SUPABASE_DB_URL");
  if (!u) throw new Error("Falta SUPABASE_DB_URL: corré los tests con --env-file=.env");
  return u;
}

export async function conBase<T>(fn: (sql: pg.Client) => Promise<T>): Promise<T> {
  const sql = new pg.Client({ connectionString: urlDeLaBase() });
  await sql.connect();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const telefonoDePrueba = () => `+549000${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

async function fijarAgenda(sql: pg.Client) {
  await sql.query("delete from horarios");
  await sql.query(
    `insert into horarios (dia_semana, hora_apertura, hora_cierre, corte_desde, corte_hasta) values
       (1, '10:00', '19:00', '14:00', '15:00'), (2, '10:00', '19:00', '14:00', '15:00'),
       (3, '10:00', '19:00', '14:00', '15:00'), (4, '10:00', '19:00', '14:00', '15:00'),
       (5, '10:00', '19:00', '14:00', '15:00'), (6, '09:30', '18:30', null, null)`,
  );
  await sql.query(
    `update duraciones_turno set duracion_min = case tipo
       when 'doble' then 90 when 'triple' then 120 when 'prueba_final' then 15 else 45 end`,
  );
  await sql.query("update configuracion_agenda set cantidad_probadores = 3");
  // Si ya existe franjas_turnos (paneles, decisión #7), se cargan franjas equivalentes al
  // horario de arriba partido en el corte: las pruebas esperan lo mismo con o sin la tabla.
  if (HAY_FRANJAS) {
    await sql.query("delete from franjas_turnos");
    await sql.query(
      `insert into franjas_turnos (dia_semana, desde, hasta, probadores) values
         (1, '10:00', '14:00', 3), (1, '15:00', '19:00', 3), (2, '10:00', '14:00', 3), (2, '15:00', '19:00', 3),
         (3, '10:00', '14:00', 3), (3, '15:00', '19:00', 3), (4, '10:00', '14:00', 3), (4, '15:00', '19:00', 3),
         (5, '10:00', '14:00', 3), (5, '15:00', '19:00', 3), (6, '09:30', '18:30', 3)`,
    );
  }
  await sql.query(
    `insert into contexto_agente (clave, valor) values ('texto_evento_inminente', $1)
     on conflict (clave) do update set valor = excluded.valor`,
    [TEXTO_EVENTO_INMINENTE],
  );
}

export function prueba(nombre: string, fn: (e: Escenario) => Promise<void>, opciones: { ignorar?: boolean } = {}) {
  Deno.test({
    name: nombre,
    ignore: opciones.ignorar ?? false,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () =>
      conBase(async (sql) => {
        await sql.query("begin");
        try {
          await fijarAgenda(sql);
          const telefono = telefonoDePrueba();
          const clienteId = (await sql.query(
            "insert into clientes (telefono) values ($1) returning id::text as id",
            [telefono],
          )).rows[0].id as string;
          const conversacionId = (await sql.query(
            "insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id",
            [clienteId],
          )).rows[0].id as string;
          const agenda = new AgendaDoble();
          const calendario = new CalendarioDoble();
          const ctx: ContextoHerramienta = {
            db: dbDesde(sql as unknown as ClienteSql),
            cliente: { id: clienteId, telefono },
            conversacionId,
            ahora: AHORA,
            tz: TZ,
            traza: trazaNueva(),
            agenda,
            calendario,
            derivacionTel: null,
          };
          await fn({ sql, ctx, agenda, calendario, clienteId, conversacionId });
        } finally {
          await sql.query("rollback");
        }
      }),
  });
}

// ── Datos de prueba (siempre adentro de la transacción) ──────────────────────────────────

export async function crearCliente(sql: pg.Client): Promise<string> {
  return (await sql.query("insert into clientes (telefono) values ($1) returning id::text as id", [telefonoDePrueba()]))
    .rows[0].id as string;
}

export async function fichaCompleta(
  sql: pg.Client,
  clienteId: string,
  datos: { nombre?: string | null; evento?: string | null; fecha_evento?: string | null } = {},
) {
  await sql.query("update clientes set nombre = $2, evento = $3, fecha_evento = $4 where id = $1", [
    clienteId,
    datos.nombre === undefined ? "Juan Pérez" : datos.nombre,
    datos.evento === undefined ? "casamiento" : datos.evento,
    datos.fecha_evento === undefined ? FECHA_EVENTO : datos.fecha_evento,
  ]);
}

export async function crearTurno(
  sql: pg.Client,
  p: {
    clienteId: string;
    inicio: Date;
    tipo?: TipoTurno;
    minutos?: number;
    probador?: number;
    estado?: string;
    confirmado?: boolean;
    googleEventId?: string | null;
  },
): Promise<string> {
  const minutos = p.minutos ?? 45;
  const fin = new Date(p.inicio.getTime() + minutos * MS_POR_MINUTO);
  const confirmado = p.confirmado ?? false;
  return (await sql.query(
    `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, confirmado,
                         confirmado_at, recordatorio_enviado_at, google_event_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, case when $8 then now() end, case when $8 then now() end, $9)
     returning id::text as id`,
    [
      p.clienteId, p.tipo ?? "invitado", minutos, p.probador ?? 1, p.inicio.toISOString(), fin.toISOString(),
      p.estado ?? "sin-confirmar", confirmado, p.googleEventId ?? null,
    ],
  )).rows[0].id as string;
}

// orden: prioridad de recomendación de paneles (1 pesa más que 2, etc. — decisión de Mateo,
// 16/9, pedido 1c). Sin valor explícito, cada llamada toma el siguiente número: alcanza para los
// tests que no le importa el orden, y los que sí lo prueban pasan el suyo.
let contadorOrdenModelo = 0;

export async function crearModelo(
  sql: pg.Client,
  p: { modelo: string; precio?: number; colores?: string[]; talles?: string[]; fotos?: string[]; orden?: number },
): Promise<string> {
  return (await sql.query(
    `insert into catalogo_alquiler (modelo, precio_base, colores, talles, fotos, orden)
     values ($1, $2, $3::jsonb, $4, $5, $6) returning id::text as id`,
    [
      p.modelo,
      p.precio ?? 100,
      JSON.stringify((p.colores ?? []).map((nombre) => ({ nombre, hex: "#000000" }))),
      p.talles ?? [],
      p.fotos ?? [],
      p.orden ?? ++contadorOrdenModelo,
    ],
  )).rows[0].id as string;
}

// Deja activos solo estos fragmentos (los reales se desactivan hasta el rollback).
export async function soloEstosFragmentos(sql: pg.Client, lista: { tema: string; titulo: string; texto: string }[]) {
  await sql.query("update fragmentos set activo = false where activo");
  for (const f of lista) {
    await sql.query("insert into fragmentos (tema, titulo, texto) values ($1, $2, $3)", [f.tema, f.titulo, f.texto]);
  }
}

export async function soloEstosEnlaces(sql: pg.Client, lista: { nombre: string; url: string }[]) {
  await sql.query("update enlaces set activo = false where activo");
  for (const e of lista) await sql.query("insert into enlaces (nombre, url) values ($1, $2)", [e.nombre, e.url]);
}

export async function soloEstosModelos(sql: pg.Client) {
  await sql.query("update catalogo_alquiler set activo = false where activo");
}

export async function contar(sql: pg.Client, q: string, v: unknown[] = []): Promise<number> {
  return Number((await sql.query(q, v)).rows[0].n);
}

// deno-lint-ignore no-explicit-any
export async function fila(sql: pg.Client, q: string, v: unknown[] = []): Promise<any> {
  return (await sql.query(q, v)).rows[0];
}

export function esRechazo(r: Resultado, codigo: string): asserts r is Extract<Resultado, { ok: false }> {
  if (r.ok) throw new Error(`se esperaba el rechazo ${codigo} y salió bien: ${JSON.stringify(r.datos)}`);
  assertEquals(r.rechazo, codigo, r.mensaje);
}

export function esOk(r: Resultado): asserts r is Extract<Resultado, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba ok y salió ${r.rechazo}: ${r.mensaje}`);
}

export const buscar = (
  ctx: ContextoHerramienta,
  desde: string,
  hasta: string,
  tipo: TipoTurno,
  fechaEvento: string | null = null,
) => ejecutarHerramienta("buscar_horarios", { desde, hasta, tipo_turno: tipo, fecha_evento: fechaEvento }, ctx);

// ¿Ya existe franjas_turnos en la base? (la crea paneles, decisión #7). Mientras no exista,
// las herramientas sacan las franjas de horarios y las pruebas que dependen de la tabla se saltean.
export const HAY_FRANJAS: boolean = await conBase(async (sql) =>
  (await sql.query("select to_regclass('public.franjas_turnos') is not null as existe")).rows[0].existe === true
);

export const agendar = (
  ctx: ContextoHerramienta,
  ymd: string,
  hm: string,
  tipo: TipoTurno,
  extra: Record<string, unknown> = {},
) => ejecutarHerramienta("agendar_turno", { fecha_hora: iso(ymd, hm), tipo, nombre: null, evento: null, fecha_evento: null, ...extra }, ctx);
