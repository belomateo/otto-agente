// Bitácora (H1.8; en el panel de hoy la pestaña se llama "Estadísticas", ruta que front
// renombra a /bitacora): KPIs del día, atención humana, costo de OpenAI y los eventos de
// Lucía. `kpis` tiene la forma que tenía el mock; `EventoBitacora` sigue viviendo en
// lib/mock-data.ts (la usan tanto acá como front).
//
// Qué lee de lo que escriben otros roles: `eventos_agente` (tipo + detalle jsonb, worker de
// logica) y `consumo_llm` (costo_usd). Del detalle toma `resumen`, `texto` o `mensaje` si
// están, y `barandilla` para marcar un rehecho; si el formato cambia en Fase 2, se ajusta
// `describir()` y nada más.
import 'server-only';
import type { EventoBitacora } from '@/lib/mock-data';
import type { Json } from '@/lib/tipos-db';
import { ESTILO_EVENTO } from '@/lib/etiquetas';
import { diaMes, dolares, fechaEnZona, fechaLarga, hora, rangoDelDia } from '@/lib/formato';
import { nombreDe, type ClienteDb } from './comun';

export type FilaEvento = EventoBitacora & { id: string; conversacion_id: string; tipo_clave: string; creado_at: string };
export type Bitacora = {
  fecha: string;
  titulo: string;
  kpis: { num: string; l: string; sub: string }[];
  atencion: { derivadas: number; resueltas: number; primera_respuesta: string };
  costo: { hoy: string; por_consulta: string; mes: string; hoy_usd: number; mes_usd: number };
  eventos: FilaEvento[];
};

const LIMITE_EVENTOS = 200;

function comoObjeto(d: Json): Record<string, Json | undefined> | null {
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, Json | undefined>) : null;
}

function describir(detalle: Json): string {
  const d = comoObjeto(detalle);
  if (d) {
    for (const k of ['resumen', 'texto', 'mensaje', 'descripcion']) {
      const v = d[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    if (typeof d.herramienta === 'string') return `${d.herramienta}(${d.input ? JSON.stringify(d.input).slice(0, 80) : ''})`;
  }
  const s = JSON.stringify(detalle);
  return s === '{}' ? '' : s.slice(0, 160);
}

export async function obtenerBitacora(db: ClienteDb, fecha: string): Promise<Bitacora> {
  const { desde, hasta } = rangoDelDia(fecha);
  const inicioMes = rangoDelDia(`${fecha.slice(0, 7)}-01`).desde;

  const [entrantes, turnos, barandillas, derivadas, resueltas, consumo, eventos] = await Promise.all([
    db.from('mensajes').select('conversacion_id').eq('direccion', 'entrante').gte('enviado_at', desde).lt('enviado_at', hasta),
    db.from('turnos').select('id', { count: 'exact', head: true }).gte('creado_at', desde).lt('creado_at', hasta),
    db
      .from('eventos_agente')
      .select('id', { count: 'exact', head: true })
      .not('detalle->>barandilla', 'is', null)
      .gte('creado_at', desde)
      .lt('creado_at', hasta),
    db.from('derivaciones').select('id', { count: 'exact', head: true }).gte('creado_at', desde).lt('creado_at', hasta),
    db
      .from('derivaciones')
      .select('creado_at, atendida_at')
      .eq('estado', 'atendida')
      .gte('atendida_at', desde)
      .lt('atendida_at', hasta),
    db.from('consumo_llm').select('costo_usd, creado_at').gte('creado_at', inicioMes).lt('creado_at', hasta),
    db
      .from('eventos_agente')
      .select('id, conversacion_id, tipo, detalle, creado_at, conversaciones(clientes(nombre, telefono))')
      .gte('creado_at', desde)
      .lt('creado_at', hasta)
      .order('creado_at', { ascending: false })
      .limit(LIMITE_EVENTOS),
  ]);
  for (const r of [entrantes, turnos, barandillas, derivadas, resueltas, consumo, eventos]) if (r.error) throw r.error;

  const consultas = new Set((entrantes.data ?? []).map((m) => m.conversacion_id)).size;
  const agendados = turnos.count ?? 0;
  const esHoy = fecha === fechaEnZona();
  const sub = esHoy ? 'hoy' : diaMes(fecha);

  const tiempos = (resueltas.data ?? [])
    .filter((d) => d.atendida_at)
    .map((d) => (new Date(d.atendida_at as string).getTime() - new Date(d.creado_at).getTime()) / 60000);
  const primera = tiempos.length ? `${Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)} min` : '—';

  const filasConsumo = consumo.data ?? [];
  const mesUsd = filasConsumo.reduce((a, c) => a + Number(c.costo_usd), 0);
  const hoyUsd = filasConsumo.filter((c) => c.creado_at >= desde).reduce((a, c) => a + Number(c.costo_usd), 0);

  return {
    fecha,
    titulo: fechaLarga(fecha),
    kpis: [
      { num: String(consultas), l: 'Consultas', sub },
      { num: String(agendados), l: 'Turnos agendados', sub },
      { num: consultas ? `${Math.round((agendados / consultas) * 100)}%` : '—', l: 'Conversión', sub: 'consulta → turno' },
      { num: String(barandillas.count ?? 0), l: 'Rehecho por barandilla', sub },
    ],
    atencion: { derivadas: derivadas.count ?? 0, resueltas: tiempos.length, primera_respuesta: primera },
    costo: {
      hoy: dolares(hoyUsd),
      por_consulta: consultas ? dolares(hoyUsd / consultas) : '—',
      mes: dolares(mesUsd),
      hoy_usd: hoyUsd,
      mes_usd: mesUsd,
    },
    eventos: (eventos.data ?? []).map((e) => {
      const d = comoObjeto(e.detalle);
      const clave = d && d.barandilla ? 'barandilla' : e.tipo;
      const estilo = ESTILO_EVENTO[clave] ?? ESTILO_EVENTO.ok;
      return {
        id: e.id,
        conversacion_id: e.conversacion_id,
        tipo_clave: clave,
        creado_at: e.creado_at,
        h: hora(e.creado_at),
        tipo: estilo.etiqueta,
        n: nombreDe(e.conversaciones?.clientes),
        d: describir(e.detalle),
        tone: estilo.tone,
        bg: estilo.bg,
      };
    }),
  };
}
