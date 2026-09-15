// Aviso de turno (H1.16, decisión #10): los turnos que tienen el cartel abierto ahora. La
// ventana (desde inicio − aviso_turno_min hasta el OK o el fin del turno, sin 'cancelado' ni
// 'no-vino') la define la base en la vista turnos_por_avisar (0031), con su propia hora: acá
// solo se arma lo que muestra el cartel. front lo consulta cada 30 segundos o menos (1.17).
import 'server-only';
import { ETIQUETA_EVENTO, ETIQUETA_ROL, ETIQUETA_TIPO_TURNO } from '@/lib/etiquetas';
import { diaMes, hora } from '@/lib/formato';
import { nombreDe, telefonoLegible, type ClienteDb } from './comun';

export type AvisoTurno = {
  /** id del turno (el del POST /api/turnos/<id>/ok). */
  id: string;
  cliente_id: string;
  /** Charla más reciente del cliente; null si no tiene. */
  conversacion_id: string | null;
  inicio: string;
  fin: string;
  tipo: string;
  estado: string;
  probador: number;
  /** '16:30' y '17:15', en la zona del negocio. */
  desde: string;
  hasta: string;
  /** 'Invitado · 45’' */
  t: string;
  /** 'Probador 2' */
  p: string;
  cliente: {
    /** El nombre, o el teléfono legible si no lo dio. */
    nombre: string;
    telefono: string;
    telefono_legible: string;
    evento: string | null;
    fecha_evento: string | null;
    /** '25/10' */
    fecha_evento_corta: string | null;
    rol: string | null;
    talle_aprox: string | null;
    color_preferido: string | null;
    /** notas_libres de la ficha. */
    notas: string | null;
  };
  /** Ya confirmó por WhatsApp, con el botón de la plantilla (confirmado_por = 'cliente'). */
  cliente_confirmo: boolean;
  confirmado_por: string | null;
  /** Links de las pantallas del panel; front los conecta en 1.17. */
  enlaces: { charla: string | null; ficha: string };
};

export type AvisosDeTurno = {
  /** Minutos antes del turno en que sale el cartel (configuracion_agenda); null = sin cartel. */
  aviso_turno_min: number | null;
  turnos: AvisoTurno[];
};

export async function turnosPorAvisar(db: ClienteDb): Promise<AvisosDeTurno> {
  const [turnos, config] = await Promise.all([
    db
      .from('turnos_por_avisar')
      .select('id, cliente_id, tipo, estado, probador, inicio, fin, duracion_min, confirmado_por')
      .order('inicio', { ascending: true })
      .order('probador', { ascending: true }),
    db.from('configuracion_agenda').select('aviso_turno_min').maybeSingle(),
  ]);
  if (turnos.error) throw turnos.error;
  if (config.error) throw config.error;
  // Las columnas de una vista vienen todas como opcionales en los tipos generados; en esta
  // vista son las de turnos, que no son nulas.
  const filas = (turnos.data ?? []).map((t) => ({
    ...t,
    id: t.id as string,
    cliente_id: t.cliente_id as string,
    tipo: t.tipo as string,
    estado: t.estado as string,
    probador: t.probador as number,
    inicio: t.inicio as string,
    fin: t.fin as string,
    duracion_min: t.duracion_min as number,
  }));
  const idsClientes = [...new Set(filas.map((t) => t.cliente_id))];
  if (idsClientes.length === 0) return { aviso_turno_min: config.data?.aviso_turno_min ?? null, turnos: [] };

  const [clientes, charlas] = await Promise.all([
    db
      .from('clientes')
      .select('id, nombre, telefono, evento, fecha_evento, rol, talle_aprox, color_preferido, notas_libres')
      .in('id', idsClientes),
    db
      .from('conversaciones')
      .select('id, cliente_id, ultimo_mensaje_at, iniciado_at')
      .in('cliente_id', idsClientes)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
      .order('iniciado_at', { ascending: false }),
  ]);
  if (clientes.error) throw clientes.error;
  if (charlas.error) throw charlas.error;
  const porId = new Map((clientes.data ?? []).map((c) => [c.id, c]));
  const charlaDe = new Map<string, string>();
  for (const c of charlas.data ?? []) if (!charlaDe.has(c.cliente_id)) charlaDe.set(c.cliente_id, c.id);

  return {
    aviso_turno_min: config.data?.aviso_turno_min ?? null,
    turnos: filas.map((t) => {
      const c = porId.get(t.cliente_id);
      const conversacion = charlaDe.get(t.cliente_id) ?? null;
      return {
        id: t.id,
        cliente_id: t.cliente_id,
        conversacion_id: conversacion,
        inicio: t.inicio,
        fin: t.fin,
        tipo: t.tipo,
        estado: t.estado,
        probador: t.probador,
        desde: hora(t.inicio),
        hasta: hora(t.fin),
        t: `${ETIQUETA_TIPO_TURNO[t.tipo] ?? t.tipo} · ${t.duracion_min}’`,
        p: `Probador ${t.probador}`,
        cliente: {
          nombre: nombreDe(c),
          telefono: c?.telefono ?? '',
          telefono_legible: c ? telefonoLegible(c.telefono) : '',
          evento: c?.evento ? (ETIQUETA_EVENTO[c.evento] ?? c.evento) : null,
          fecha_evento: c?.fecha_evento ?? null,
          fecha_evento_corta: c?.fecha_evento ? diaMes(c.fecha_evento) : null,
          rol: c?.rol ? (ETIQUETA_ROL[c.rol] ?? c.rol) : null,
          talle_aprox: c?.talle_aprox ?? null,
          color_preferido: c?.color_preferido ?? null,
          notas: c?.notas_libres ?? null,
        },
        cliente_confirmo: t.confirmado_por === 'cliente',
        confirmado_por: t.confirmado_por ?? null,
        enlaces: {
          charla: conversacion ? `/bandeja/charla?id=${conversacion}` : null,
          ficha: `/clientes?id=${t.cliente_id}`,
        },
      };
    }),
  };
}
