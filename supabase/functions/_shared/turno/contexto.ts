// armar_contexto (AGENTE.md § 3 paso 5): la libreta del cliente + su ficha + sus turnos activos
// + la hora actual + el horario de hoy, en un bloque de texto que se manda APARTE de prompt.md
// (hito 1.3, control 6: nada que cambie turno a turno rompe el caché del prefijo). Va como
// mensaje de sistema propio, justo después de prompt.md y antes del historial (STACK.md § 3:
// "prompt.md (prefijo cacheable) + contexto del turno + historial, en ese orden").

import type { Db } from "../db.ts";
import { ESTADOS_QUE_LIBERAN } from "../enums.ts";
import { leerFicha } from "../herramientas/ficha.ts";
import { describirHorarios, type HorarioLocal, leerHorarioDelLocal } from "../herramientas/horario_laboral.ts";
import { fechaLarga, fechaLocal, horaLocal, nombreDia, partesLocales, sumarDias } from "../tiempo.ts";

// Pedido de Mateo, 21/9: Lucía se presenta la primera vez de la charla, y de nuevo si pasaron
// más de 7 días desde el último mensaje — un hueco así de largo se trata como si arrancara una
// charla nueva. turno.ts lo usa para lo mismo del lado de esPrimerMensaje (presentacion_repetida
// ya no la corta en ese caso); acá se le suma la línea de contexto que se lo dice al modelo.
export const UMBRAL_DIAS_REPRESENTACION = 7;

const NOMBRE_CAMPO: Record<string, string> = {
  nombre: "nombre", evento: "evento", fecha_evento: "fecha del evento", rol: "rol",
  dia_o_noche: "día o noche", talle_aprox: "talle aproximado", ciudad: "ciudad",
  color_preferido: "color preferido", presupuesto_mencionado: "lo que dijo del presupuesto",
  email: "mail",
};

async function libretaTexto(db: Db, clienteId: string): Promise<string> {
  const ficha = await leerFicha(db, clienteId);
  const conocidos = Object.entries(ficha).filter(([, v]) => v !== null);
  if (conocidos.length === 0) return "Todavía no sabés nada de este cliente: es la primera vez que hablan (o no dejó datos).";
  const notas = await db.consulta<{ texto: string }>(
    "select texto from notas where cliente_id = $1 order by creado_at desc limit 5",
    [clienteId],
  );
  const partes = conocidos.map(([campo, valor]) => `- ${NOMBRE_CAMPO[campo] ?? campo}: ${valor}`);
  if (notas.length) partes.push(...notas.map((n) => `- nota: ${n.texto}`));
  return "Esto es lo que ya sabés de este cliente (no se lo vuelvas a preguntar):\n" + partes.join("\n");
}

async function turnosActivosTexto(db: Db, clienteId: string, ahora: Date, tz: string): Promise<{ texto: string; horas: string[] }> {
  const filas = await db.consulta<{ id: string; tipo: string; inicio: string; estado: string; confirmado: boolean }>(
    `select id::text as id, tipo, inicio, estado, confirmado from turnos
      where cliente_id = $1 and fin > $2::timestamptz and not (estado = any($3::text[]))
      order by inicio`,
    [clienteId, ahora.toISOString(), [...ESTADOS_QUE_LIBERAN]],
  );
  if (filas.length === 0) return { texto: "No tiene ningún turno activo.", horas: [] };
  const horas: string[] = [];
  const texto = filas
    .map((f) => {
      const inicio = new Date(f.inicio);
      const h = horaLocal(inicio, tz);
      horas.push(h);
      return `- turno_id ${f.id}: ${f.tipo}, ${fechaLarga(inicio, tz)} a las ${h}, ${f.estado}${f.confirmado ? " (confirmado)" : ""}`;
    })
    .join("\n");
  return { texto, horas };
}

// Pedido de Mateo, 5/10: el local abre de corrido. Antes iban también las franjas de turnos de hoy
// ("de 9:30 a 12:00 y de 13:15 a 18:30") y Lucía las contaba como si el local cortara al mediodía.
// Los turnos libres de hoy los dice buscar_horarios.
async function horarioDeHoyTexto(db: Db, ahora: Date, tz: string, horario: HorarioLocal[]): Promise<{ texto: string; horas: string[] }> {
  const hoy = horario.filter((h) => h.diaSemana === partesLocales(ahora, tz).diaSemana);
  const { local: textoLocal, horas } = describirHorarios(hoy, [], [partesLocales(ahora, tz).diaSemana]);
  return { texto: `Local hoy: ${textoLocal}${hoy.length ? " Abre de corrido, sin cortar al mediodía." : ""}`, horas };
}

// 8/10: los próximos días con su fecha y si el local abre, sacado de la misma agenda que usa
// buscar_horarios (horarios + cierres_agenda, lo que el equipo carga en Configuración › Agenda).
// El modelo corre sin razonamiento y calculaba mal: buscó «el sábado» en el domingo 11, y a
// «¿abren el feriado?» dio cinco respuestas distintas en una semana. Así no calcula: lee.
export const DIAS_DEL_CALENDARIO = 14;
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
async function proximosDiasTexto(db: Db, ahora: Date, tz: string, horario: HorarioLocal[]): Promise<{ texto: string; horas: string[] }> {
  const hoy = fechaLocal(ahora, tz);
  const cierres = await db.consulta<{ fecha: string; motivo: string | null }>(
    `select to_char(fecha, 'YYYY-MM-DD') as fecha, motivo from cierres_agenda where fecha between $1::date and $2::date`,
    [hoy, sumarDias(hoy, DIAS_DEL_CALENDARIO - 1)],
  );
  const cerrado = new Map(cierres.map((c) => [String(c.fecha), (c.motivo ?? "").trim()]));
  const lineas: string[] = [];
  for (let i = 0; i < DIAS_DEL_CALENDARIO; i++) {
    const ymd = sumarDias(hoy, i);
    const [a, m, d] = ymd.split("-").map(Number);
    const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    const h = horario.find((x) => x.diaSemana === diaSemana);
    const cuando = i === 0 ? " (hoy)" : i === 1 ? " (mañana)" : "";
    const estado = cerrado.has(ymd)
      ? `cerrado${cerrado.get(ymd) ? ` (${cerrado.get(ymd)})` : ""}`
      : h ? `abre de ${hm(h.apertura)} a ${hm(h.cierre)}` : "cerrado";
    lineas.push(`- ${nombreDia(diaSemana)} ${d}/${m}${cuando}: ${estado}`);
  }
  return { texto: lineas.join("\n"), horas: describirHorarios(horario, []).horas };
}

export async function armarContextoDelTurno(
  db: Db,
  p: { clienteId: string; ahora: Date; tz: string; diasDesdeUltimoMensaje: number | null },
): Promise<{ texto: string; horas: string[] }> {
  const horario = await leerHorarioDelLocal(db);
  const [libreta, turnos, horarioHoy, proximos] = await Promise.all([
    libretaTexto(db, p.clienteId),
    turnosActivosTexto(db, p.clienteId, p.ahora, p.tz),
    horarioDeHoyTexto(db, p.ahora, p.tz, horario),
    proximosDiasTexto(db, p.ahora, p.tz, horario),
  ]);
  const lineas = [
    "CONTEXTO DE ESTE TURNO (no es parte de lo que sabés de memoria; usalo, no lo repitas al cliente tal cual).",
    "",
    "TU LIBRETA",
    libreta,
    "",
    "SUS TURNOS",
    turnos.texto,
    "",
    `FECHA ACTUAL: ${fechaLocal(p.ahora, p.tz)} (año, mes, día). HORA ACTUAL: ${fechaLarga(p.ahora, p.tz)}, ${horaLocal(p.ahora, p.tz)} (hora de Argentina).`,
    horarioHoy.texto,
    "",
    `PRÓXIMOS ${DIAS_DEL_CALENDARIO} DÍAS (la agenda del local). Usala para saber qué fecha es «el sábado», «el lunes» o ` +
    "«mañana», sin calcularla, y para contestar si un día abrimos: si no dice cerrado, ese día el local abre, aunque " +
    "sea feriado. Los turnos libres de cada día los da buscar_horarios.",
    proximos.texto,
  ];
  if (p.diasDesdeUltimoMensaje !== null && p.diasDesdeUltimoMensaje >= UMBRAL_DIAS_REPRESENTACION) {
    lineas.push(
      "",
      `Pasaron ${p.diasDesdeUltimoMensaje} días desde el último mensaje de este cliente: presentate de nuevo, como si arrancara la charla.`,
    );
  }
  const texto = lineas.join("\n");
  // Hallazgo de la auditoría, 17/9: horario_sin_herramienta y traza.ts prometen que estas horas
  // (los turnos activos del cliente, y las del horario de hoy) quedan sembradas en
  // traza.horasDevueltas — pero nadie las agarraba de acá para pasárselas al turno. El cliente
  // preguntando por su propio turno ("¿a qué hora era?") hacía saltar la barandilla dos veces y
  // terminaba en barandilla_doble (con el texto fijo de turno.ts, desde el 19/9 — antes, mudo).
  const horas = [...new Set([...turnos.horas, ...horarioHoy.horas, ...proximos.horas])];
  return { texto, horas };
}
