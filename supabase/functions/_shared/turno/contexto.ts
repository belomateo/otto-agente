// armar_contexto (AGENTE.md § 3 paso 5): la libreta del cliente + su ficha + sus turnos activos
// + la hora actual + el horario de hoy, en un bloque de texto que se manda APARTE de prompt.md
// (hito 1.3, control 6: nada que cambie turno a turno rompe el caché del prefijo). Va como
// mensaje de sistema propio, justo después de prompt.md y antes del historial (STACK.md § 3:
// "prompt.md (prefijo cacheable) + contexto del turno + historial, en ese orden").

import type { Db } from "../db.ts";
import { ESTADOS_QUE_LIBERAN } from "../enums.ts";
import { leerFicha } from "../herramientas/ficha.ts";
import { describirHorarios, leerFranjas, leerHorarioDelLocal } from "../herramientas/horario_laboral.ts";
import { fechaLarga, horaLocal, partesLocales } from "../tiempo.ts";

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

async function horarioDeHoyTexto(db: Db, ahora: Date, tz: string): Promise<{ texto: string; horas: string[] }> {
  const [local, { franjas }] = await Promise.all([leerHorarioDelLocal(db), leerFranjas(db)]);
  const dia = partesLocales(ahora, tz).diaSemana;
  const { local: textoLocal, turnos: textoTurnos, horas } = describirHorarios(
    local.filter((h) => h.diaSemana === dia),
    franjas.filter((f) => f.diaSemana === dia),
  );
  return { texto: `Local hoy: ${textoLocal} Turnos hoy: ${textoTurnos}`, horas };
}

export async function armarContextoDelTurno(
  db: Db,
  p: { clienteId: string; ahora: Date; tz: string; diasDesdeUltimoMensaje: number | null },
): Promise<{ texto: string; horas: string[] }> {
  const [libreta, turnos, horarioHoy] = await Promise.all([
    libretaTexto(db, p.clienteId),
    turnosActivosTexto(db, p.clienteId, p.ahora, p.tz),
    horarioDeHoyTexto(db, p.ahora, p.tz),
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
    `HORA ACTUAL: ${fechaLarga(p.ahora, p.tz)}, ${horaLocal(p.ahora, p.tz)} (hora de Argentina).`,
    horarioHoy.texto,
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
  const horas = [...new Set([...turnos.horas, ...horarioHoy.horas])];
  return { texto, horas };
}
