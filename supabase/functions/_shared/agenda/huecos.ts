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
//  · días cerrados (cierres_agenda, 0061): ese día no hay ningún hueco.
//  · horarios bloqueados (bloqueos_agenda, 0067, pedido de la dueña del 26/9): un rato de una
//    fecha tapado para un probador o para todos. Ese probador no toma un turno que lo pise, y
//    a esa hora se ofrece el siguiente libre; si el bloqueo es de todos, esa hora no se ofrece.
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

// Un horario bloqueado (bloqueos_agenda, 0067) ya pasado a instantes: [inicio, fin), igual que
// un turno. probador null = todos los probadores. No es un Ocupado a propósito: un turno es un
// cliente que llega y un bloqueo no, y la regla del escalonado ("dos turnos nunca arrancan a
// menos de un escalonado") es sobre clientes. Si un bloqueo entrara en `ocupados`, un rato
// tapado del probador 1 le sacaría horarios vecinos a los probadores 2 y 3, que están libres.
export type BloqueoAgenda = { inicio: Date; fin: Date; probador: number | null };

export type ReglasAgenda = {
  franjas: Franja[];
  escalonadoMin: number;
  diasReservaUrgencia: number | null;
  duracionMin: number;
  // Cuántos días tienen que quedar entre el turno y el evento: el traje necesita un mínimo de
  // confección (decisión de Mateo, el dieciséis de septiembre). Un día es solo "nada el día del
  // evento", que es lo de siempre y lo que corresponde a la prueba final, donde ya no se arregla.
  diasConfeccion: number;
  // Días de la semana (0=dom..6=sáb) donde los probadores no se escalonan: ambos atienden a la
  // misma hora. Pedido de Mateo, 29/9: el sábado el horario es acotado y conviene que los dos
  // probadores estén disponibles en cada slot. En esos días el paso entre slots es la duración
  // del turno (no escalonadoMin) y se ofrecen todos los probadores libres en el mismo instante.
  diasSimultaneos: readonly number[];
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
  // Los horarios bloqueados del mismo rango de fechas (bloqueos_agenda, 0067). Va acá por lo
  // mismo que `cerrados`: depende de desde/hasta, lo trae quien llama y es obligatorio, para
  // que el typecheck no deje compilar a un llamador que se olvide de leerlos. Olvidarlo no
  // rompe nada a la vista: la base igual rechaza el turno (turno_en_horario_bloqueado), pero
  // Lucía y el panel seguirían ofreciendo una hora que después no se puede agendar.
  bloqueos: readonly BloqueoAgenda[];
};

const dos = (n: number) => String(n).padStart(2, "0");
const aHora = (min: number) => `${dos(Math.floor(min / MINUTOS_POR_HORA))}:${dos(min % MINUTOS_POR_HORA)}`;

// Día de la semana de una fecha de calendario (0 = domingo, como franjas_turnos). No depende
// del huso: es el mismo día en cualquier zona.
function diaDeLaSemana(ymd: string): number {
  const [a, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

// Se pisan si se solapan, no solo si el turno ARRANCA adentro: un turno que empieza antes y
// termina adentro de un bloqueo también lo pisa. Los dos rangos son [inicio, fin): terminar
// justo cuando el otro arranca no pisa.
const pisa = (o: { inicio: Date; fin: Date }, inicio: Date, fin: Date) => o.inicio < fin && o.fin > inicio;

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
    // En días simultáneos (típicamente sábado), los probadores atienden en paralelo en el mismo
    // slot: no se escalonan y el paso entre slots es la duración del turno (no escalonadoMin).
    // Así 9:30 tiene probador 1 y probador 2 disponibles juntos, luego 10:15, etc.
    const esSimultaneo = reglas.diasSimultaneos.includes(semana);
    const paso = esSimultaneo ? reglas.duracionMin : reglas.escalonadoMin;
    const franjas = reglas.franjas.filter((f) => f.diaSemana === semana).sort((a, b) => a.desde - b.desde);
    for (const f of franjas) {
      for (let min = f.desde; min + reglas.duracionMin <= f.hasta; min += paso) {
        const inicio = instanteLocal(dia, aHora(min), p.tz);
        if (inicio <= p.ahora) continue;
        // Filtro de escalonado: en días normales, dos turnos nunca arrancan a menos de
        // escalonadoMin entre sí (el equipo recibe un cliente por vez). En días simultáneos
        // no aplica: dos clientes pueden entrar al mismo tiempo en probadores distintos.
        if (!esSimultaneo && ocupados.some((o) => Math.abs(o.inicio.getTime() - inicio.getTime()) < escalonadoMs)) continue;
        const fin = new Date(inicio.getTime() + duracionMs);
        for (let probador = 1; probador <= f.probadores; probador++) {
          if (ocupados.some((o) => o.probador === probador && pisa(o, inicio, fin))) continue;
          // El bloqueo se mira acá y solo acá (no en el escalonado de arriba): tapa el lugar de
          // SU probador, o de todos si no tiene. Así uno del probador 1 hace que esa hora se
          // ofrezca en el 2, que es lo que la agenda de Lucía necesita — ella trae UN probador
          // por hora y, si fuera el bloqueado, la base le rechazaba el turno sin otro a mano.
          if (p.bloqueos.some((b) => (b.probador === null || b.probador === probador) && pisa(b, inicio, fin))) continue;
          huecos.push({ inicio: inicio.toISOString(), fin: fin.toISOString(), probador });
          // En días normales, solo el primer probador libre por slot (el equipo no se divide).
          // En días simultáneos se ofrecen todos los probadores que quepan.
          if (!esSimultaneo) break;
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
  const { franjas: todas } = await leerFranjas(db);

  // probadores_lucia (0073, pedido de Sofi 30/9): los probadores de más arriba quedan para que el
  // equipo agende a mano (urgencias). Se recorta acá y no en calcularHuecos porque esa la usa
  // también el panel, que sí tiene que ver todos.
  let franjas = todas;
  const [colLucia] = await db.consulta(
    `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'configuracion_agenda'
         and column_name = 'probadores_lucia'`,
  );
  if (colLucia) {
    const [lim] = await db.consulta("select probadores_lucia from configuracion_agenda limit 1");
    const tope = lim?.probadores_lucia === null || lim?.probadores_lucia === undefined ? null : Number(lim.probadores_lucia);
    if (tope !== null && Number.isFinite(tope)) franjas = todas.map((f) => ({ ...f, probadores: Math.min(f.probadores, tope) }));
  }

  // dias_simultaneos: columna de la migración 0068. Si la migración todavía no se aplicó,
  // la columna no existe y usamos [] (sin días simultáneos) hasta que se aplique.
  // La columna en la base tiene DEFAULT '{6}' (sábado), así que en producción el sábado
  // siempre viene de la base, no de este fallback.
  let diasSimultaneos: number[] = [];
  const [colExiste] = await db.consulta(
    `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'configuracion_agenda'
         and column_name = 'dias_simultaneos'`,
  );
  if (colExiste) {
    const [ext] = await db.consulta("select dias_simultaneos from configuracion_agenda limit 1");
    if (ext && Array.isArray(ext.dias_simultaneos)) diasSimultaneos = ext.dias_simultaneos as number[];
  }

  return {
    franjas,
    escalonadoMin: Number(config.escalonado_min),
    diasReservaUrgencia: config.dias_reserva_urgencia === null ? null : Number(config.dias_reserva_urgencia),
    duracionMin: Number(duracion.duracion_min),
    diasConfeccion: await diasConfeccion(db, tipo),
    diasSimultaneos,
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

// Los horarios bloqueados del rango (bloqueos_agenda, 0067). La tabla guarda fecha + desde/hasta
// en hora del local; el paso a instante se hace en SQL, con la zona del negocio, y no acá: si la
// fecha viajara como Date, el huso la corre un día (el mismo bug que cuidan leerCierres y su
// prueba). Un hasta de fin de día (24:00) da solo la medianoche del día siguiente.
//
// La migración la aplica Mateo a mano y puede llegar DESPUÉS del deploy del worker: mientras la
// tabla no exista, no hay bloqueos que respetar y Lucía tiene que seguir ofreciendo horarios, no
// quedarse muda. Se pregunta antes si existe (como leerFranjas en horario_laboral.ts) en vez de
// consultar y atajar el undefined_table: adentro de una transacción ese error la deja abortada,
// y las pruebas contra la base corren todas adentro de un begin … rollback — todo lo que viniera
// después fallaría. to_regclass resuelve el nombre igual que el from de abajo.
export async function leerBloqueos(db: Db, desde: string, hasta: string, tz: string): Promise<BloqueoAgenda[]> {
  const [existe] = await db.consulta("select to_regclass('bloqueos_agenda') is not null as hay");
  if (existe?.hay !== true) {
    console.error(
      "agenda: la tabla bloqueos_agenda no existe todavía (falta aplicar la migración 0067); " +
        "los huecos se calculan sin horarios bloqueados (sin la tabla no puede haber ninguno cargado).",
    );
    return [];
  }
  const filas = await db.consulta(
    `select (fecha + desde) at time zone $3::text as inicio,
            (fecha + hasta) at time zone $3::text as fin,
            probador
       from bloqueos_agenda
      where fecha between $1::date and $2::date`,
    [desde, hasta, tz],
  );
  return filas.map((f) => ({
    inicio: new Date(f.inicio as string),
    fin: new Date(f.fin as string),
    probador: f.probador === null || f.probador === undefined ? null : Number(f.probador),
  }));
}

export function agendaDesdeBase(db: Db, tz: string): Agenda {
  return {
    async huecos({ desde, hasta, tipo, ahora, fechaEvento }) {
      const reglas = await leerReglas(db, tipo);
      const ocupados = await leerOcupados(db, desde, hasta, tz);
      const cerrados = await leerCierres(db, desde, hasta);
      const bloqueos = await leerBloqueos(db, desde, hasta, tz);
      return calcularHuecos(reglas, ocupados, { desde, hasta, ahora, fechaEvento, tz, cerrados, bloqueos });
    },
  };
}
