// La agenda de turnos (hito 1.13, logica): los huecos libres por probador y duración, dentro de
// las franjas de turnos. Es la implementación de `Agenda` (herramientas/tipos.ts) que usa
// buscar_horarios; las pruebas de las herramientas usan un doble con la misma forma.
//
// Las reglas, todas en código y con los números sacados de las tablas (principio 2: acá no hay
// ninguna hora, duración, cantidad de probadores ni cantidad de días escrita a mano):
//  · franjas_turnos (paneles, 0030): se dan turnos solo dentro de una franja, y en una franja
//    con P probadores toman turnos los probadores 1 a P (decisión #7, supuesto #22). Un día
//    sin franjas no da turnos.
//  · duraciones_turno (0012): el turno entra entero en su franja. El doble y el triple ocupan
//    un solo probador todo ese tiempo.
//  · escalonado (configuracion_agenda.escalonado_min): los turnos arrancan en múltiplos del
//    escalonado desde el inicio de la franja, y dos turnos nunca arrancan a menos de un
//    escalonado de distancia, en ningún probador: el equipo recibe a un cliente por vez. Por
//    eso a cada hora se ofrece un solo probador, el primero libre, y si dos clientes piden la
//    misma hora entra uno solo (supuesto #25).
//  · un turno 'cancelado' o 'no-vino' libera su lugar; los demás estados lo ocupan.
//  · mismo día: solo huecos que arrancan después de `ahora`.
//  · evento hoy o mañana (decisión #8): ningún hueco y `derivar: evento_inminente`.
//  · con la fecha del evento, nada el día del evento ni después (supuesto #24).
//  · orden de urgencia (decisión #9, supuesto #21): con dias_reserva_urgencia = N, los N días
//    que empiezan hoy quedan para los eventos que caen hasta hoy + N; a un evento más lejano,
//    o sin fecha, se le ofrece desde hoy + N. Vacío = sin reserva.
//
// `calcularHuecos` es código puro (se prueba sin base) y `agendaDesdeBase` lee las tablas y la
// llama. Las fechas van en la zona del negocio (NEGOCIO_TZ).

import type { Db } from "../db.ts";
import { ESTADOS_QUE_LIBERAN, type TipoTurno } from "../enums.ts";
import { type Franja, leerFranjas } from "../herramientas/horario_laboral.ts";
import type { Agenda, Hueco, ResultadoAgenda } from "../herramientas/tipos.ts";
import { fechaLocal, instanteLocal, MINUTOS_POR_HORA, MS_POR_MINUTO, sumarDias } from "../tiempo.ts";

export type Ocupado = { probador: number; inicio: Date; fin: Date };

export type ReglasAgenda = {
  franjas: Franja[];
  escalonadoMin: number;
  diasReservaUrgencia: number | null;
  duracionMin: number;
  // Cuántos días tienen que quedar entre el turno y el evento: el traje necesita un mínimo de
  // confección (decisión de Mateo, el dieciséis de septiembre). Un día es solo "nada el día del
  // evento", que es lo de siempre y lo que corresponde a la prueba final, donde ya no se arregla.
  diasConfeccion: number;
};

export type PedidoHuecos = {
  desde: string; // AAAA-MM-DD, en la zona del negocio
  hasta: string;
  ahora: Date;
  fechaEvento: string | null;
  tz: string;
  // Días cerrados puntuales —feriados, o el día que el local no abre por lo que sea— como
  // AAAA-MM-DD en la zona del negocio (pedido de Mateo, 21/9; tabla cierres_agenda, de paneles).
  // Un día acá adentro da cero huecos, igual que un día sin franjas.
  //
  // Va en el pedido y no en las reglas a propósito: depende del rango que se está consultando
  // (desde/hasta), y las reglas se leen sin saber de qué fechas se habla. Acá queda al lado de
  // desde/hasta, que es lo que obliga a quien llama a traerlos del mismo rango.
  //
  // Y lo trae quien llama, no lo consulta esta función, porque calcularHuecos es pura: la usan
  // el worker (Deno) y el panel (Next) con el mismo código, y el panel no tiene esta conexión.
  // Obligatorio y no opcional a propósito: si fuera opcional, quien se olvidara de pasarlo
  // abriría los feriados en silencio, que es la peor forma de fallar.
  cerrados: ReadonlySet<string>;
};

const dos = (n: number) => String(n).padStart(2, "0");
const aHora = (min: number) => `${dos(Math.floor(min / MINUTOS_POR_HORA))}:${dos(min % MINUTOS_POR_HORA)}`;

// Día de la semana de una fecha de calendario (0 = domingo, como franjas_turnos). No depende
// del huso: es el mismo día en cualquier zona.
function diaDeLaSemana(ymd: string): number {
  const [a, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

const pisa = (o: Ocupado, inicio: Date, fin: Date) => o.inicio < fin && o.fin > inicio;

export function calcularHuecos(reglas: ReglasAgenda, ocupados: Ocupado[], p: PedidoHuecos): ResultadoAgenda {
  if (!(reglas.escalonadoMin > 0) || !(reglas.duracionMin > 0)) {
    throw new Error("La agenda necesita un escalonado y una duración mayores que cero.");
  }
  const hoy = fechaLocal(p.ahora, p.tz);
  if (p.fechaEvento !== null) {
    if (p.fechaEvento >= hoy && p.fechaEvento <= sumarDias(hoy, 1)) return { huecos: [], derivar: "evento_inminente" };
    if (p.fechaEvento < hoy) return { huecos: [] };
  }

  let primerDia = p.desde < hoy ? hoy : p.desde;
  let ultimoDia = p.hasta;
  // Nada el día del evento ni después (supuesto #24) y, para los turnos de prueba, con los días
  // de confección de margen: un traje probado el viernes no llega para un casamiento el sábado.
  // La prueba final va con margen 1, porque a esa altura ya no se arregla nada.
  const margen = Math.max(1, Math.trunc(reglas.diasConfeccion));
  if (p.fechaEvento !== null && sumarDias(p.fechaEvento, -margen) < ultimoDia) {
    ultimoDia = sumarDias(p.fechaEvento, -margen);
  }
  if (reglas.diasReservaUrgencia !== null) {
    const finDeLaReserva = sumarDias(hoy, reglas.diasReservaUrgencia);
    const urgente = p.fechaEvento !== null && p.fechaEvento <= finDeLaReserva;
    if (!urgente && primerDia < finDeLaReserva) primerDia = finDeLaReserva;
  }

  const escalonadoMs = reglas.escalonadoMin * MS_POR_MINUTO;
  const duracionMs = reglas.duracionMin * MS_POR_MINUTO;
  const huecos: Hueco[] = [];
  for (let dia = primerDia; dia <= ultimoDia; dia = sumarDias(dia, 1)) {
    // Cerrado ese día puntual: ni se miran las franjas. Es lo mismo que un domingo, pero por
    // fecha en vez de por día de la semana.
    if (p.cerrados.has(dia)) continue;
    const semana = diaDeLaSemana(dia);
    const franjas = reglas.franjas.filter((f) => f.diaSemana === semana).sort((a, b) => a.desde - b.desde);
    for (const f of franjas) {
      for (let min = f.desde; min + reglas.duracionMin <= f.hasta; min += reglas.escalonadoMin) {
        const inicio = instanteLocal(dia, aHora(min), p.tz);
        if (inicio <= p.ahora) continue;
        if (ocupados.some((o) => Math.abs(o.inicio.getTime() - inicio.getTime()) < escalonadoMs)) continue;
        const fin = new Date(inicio.getTime() + duracionMs);
        for (let probador = 1; probador <= f.probadores; probador++) {
          if (!ocupados.some((o) => o.probador === probador && pisa(o, inicio, fin))) {
            huecos.push({ inicio: inicio.toISOString(), fin: fin.toISOString(), probador });
            break;
          }
        }
      }
    }
  }
  return { huecos };
}

// Los días de confección salen de configuracion_agenda si la columna existe (la agrega paneles,
// que es el dueño de esa tabla) y, mientras no exista, del valor que fijó Mateo. Se lee
// así y no con un número fijo para que la dueña lo pueda cambiar desde el panel sin tocar código.
export const DIAS_CONFECCION_POR_DEFECTO = 2;

async function diasConfeccion(db: Db, tipo: TipoTurno): Promise<number> {
  if (tipo === "prueba_final") return 1; // el día antes está bien: ya no se arregla nada
  const hay = await db.consulta(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'configuracion_agenda' and column_name = 'dias_confeccion'`,
  );
  if (!hay.length) return DIAS_CONFECCION_POR_DEFECTO;
  const [f] = await db.consulta("select dias_confeccion from configuracion_agenda limit 1");
  const n = Number(f?.dias_confeccion);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : DIAS_CONFECCION_POR_DEFECTO;
}

async function leerReglas(db: Db, tipo: TipoTurno): Promise<ReglasAgenda> {
  const [config] = await db.consulta(
    "select escalonado_min, dias_reserva_urgencia from configuracion_agenda limit 1",
  );
  if (!config) throw new Error("configuracion_agenda está vacía: la agenda no puede calcular huecos.");
  const [duracion] = await db.consulta("select duracion_min from duraciones_turno where tipo = $1", [tipo]);
  if (!duracion) throw new Error(`duraciones_turno no tiene el tipo ${tipo}: la agenda no puede calcular huecos.`);
  const { franjas } = await leerFranjas(db);
  return {
    franjas,
    escalonadoMin: Number(config.escalonado_min),
    diasReservaUrgencia: config.dias_reserva_urgencia === null ? null : Number(config.dias_reserva_urgencia),
    duracionMin: Number(duracion.duracion_min),
    diasConfeccion: await diasConfeccion(db, tipo),
  };
}

// Los turnos que ocupan lugar entre el principio del primer día y el final del último.
async function leerOcupados(db: Db, desde: string, hasta: string, tz: string): Promise<Ocupado[]> {
  const medianoche = aHora(0);
  const filas = await db.consulta(
    `select probador, inicio, fin from turnos
      where not (estado = any($1::text[])) and inicio < $3::timestamptz and fin > $2::timestamptz`,
    [
      [...ESTADOS_QUE_LIBERAN],
      instanteLocal(desde, medianoche, tz).toISOString(),
      instanteLocal(sumarDias(hasta, 1), medianoche, tz).toISOString(),
    ],
  );
  return filas.map((f) => ({
    probador: Number(f.probador),
    inicio: new Date(f.inicio as string),
    fin: new Date(f.fin as string),
  }));
}

// Los días que el local no abre dentro del rango que se está consultando (cierres_agenda, de
// paneles). Se piden acotados al rango y no enteros: la tabla puede tener feriados de años.
async function leerCierres(db: Db, desde: string, hasta: string): Promise<ReadonlySet<string>> {
  const filas = await db.consulta(
    `select to_char(fecha, 'YYYY-MM-DD') as fecha from cierres_agenda where fecha between $1::date and $2::date`,
    [desde, hasta],
  );
  return new Set(filas.map((f) => String(f.fecha)));
}

export function agendaDesdeBase(db: Db, tz: string): Agenda {
  return {
    async huecos({ desde, hasta, tipo, ahora, fechaEvento }) {
      const reglas = await leerReglas(db, tipo);
      const ocupados = await leerOcupados(db, desde, hasta, tz);
      const cerrados = await leerCierres(db, desde, hasta);
      return calcularHuecos(reglas, ocupados, { desde, hasta, ahora, fechaEvento, tz, cerrados });
    },
  };
}
