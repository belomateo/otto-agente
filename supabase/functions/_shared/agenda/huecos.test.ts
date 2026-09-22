// Pruebas del cálculo de huecos (hito 1.13), sin base: las reglas se arman acá con los valores
// del seed de paneles (franjas del 14/9) para ver cada caso del control.
// Correr: deno test --no-lock --node-modules-dir=none --allow-read supabase/functions/_shared/agenda/huecos.test.ts

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { dentroDeFranja, type Franja } from "../herramientas/horario_laboral.ts";
import type { ResultadoAgenda } from "../herramientas/tipos.ts";
import { fechaLocal, horaLocal } from "../tiempo.ts";
import { calcularHuecos, type Ocupado, type PedidoHuecos, type ReglasAgenda } from "./huecos.ts";

const TZ = "America/Argentina/Cordoba";
const min = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const local = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00-03:00`);

// Lunes a viernes 13–19 con 3 probadores; sábado 9:30–12 con 3 y 13:30–18:30 con 2.
const FRANJAS: Franja[] = [
  ...[1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, desde: min("13:00"), hasta: min("19:00"), probadores: 3 })),
  { diaSemana: 6, desde: min("09:30"), hasta: min("12:00"), probadores: 3 },
  { diaSemana: 6, desde: min("13:30"), hasta: min("18:30"), probadores: 2 },
];
// diasConfeccion 1 = el comportamiento de siempre (nada el día del evento). Los casos de la
// regla nueva de Mateo (16/9) están abajo, con margen 2.
const REGLAS: ReglasAgenda = { franjas: FRANJAS, escalonadoMin: 15, diasReservaUrgencia: null, duracionMin: 45, diasConfeccion: 1 };

const LUNES = "2030-06-03";
const MARTES = "2030-06-04";
const MIERCOLES = "2030-06-05";
const VIERNES = "2030-06-07";
const SABADO = "2030-06-08";
const DOMINGO = "2030-06-09";
const EVENTO_LEJANO = "2030-07-15";
const DOS_SEMANAS_ANTES = local("2030-05-20", "10:00"); // lunes

const pedido = (desde: string, hasta: string, extra: Partial<PedidoHuecos> = {}): PedidoHuecos => ({
  desde,
  hasta,
  ahora: DOS_SEMANAS_ANTES,
  fechaEvento: EVENTO_LEJANO,
  tz: TZ,
  cerrados: new Set<string>(),
  ...extra,
});
const horas = (r: ResultadoAgenda) => r.huecos.map((h) => horaLocal(new Date(h.inicio), TZ));
const dias = (r: ResultadoAgenda) => [...new Set(r.huecos.map((h) => fechaLocal(new Date(h.inicio), TZ)))];
const probadorA = (r: ResultadoAgenda, hm: string) =>
  r.huecos.find((h) => horaLocal(new Date(h.inicio), TZ) === hm)?.probador;
const turno = (probador: number, ymd: string, desde: string, hasta: string): Ocupado => ({
  probador,
  inicio: local(ymd, desde),
  fin: local(ymd, hasta),
});

Deno.test("las fechas de prueba caen el día que dicen", () => {
  const dia = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
  assertEquals([dia(LUNES), dia(SABADO), dia(DOMINGO), dia("2030-05-20")], [1, 6, 0, 1]);
});

Deno.test("a. lunes a viernes: turnos solo de 13 a 19, con los 3 probadores; a la mañana, ninguno", () => {
  for (const dia of [LUNES, MARTES, MIERCOLES, "2030-06-06", VIERNES]) {
    const r = calcularHuecos(REGLAS, [], pedido(dia, dia));
    const hs = horas(r);
    assertEquals(hs[0], "13:00", dia);
    assertEquals(hs.at(-1), "18:15", dia); // 18:15 + 45' = 19:00
    assertEquals(hs.length, 22, dia); // de 13:00 a 18:15, uno cada 15'
  }
  // Con el 1 y el 2 ocupados a las 13:30 entra el 3; con los tres ocupados, esa hora no se ofrece.
  const dos = [turno(1, LUNES, "13:00", "13:45"), turno(2, LUNES, "13:15", "14:00")];
  assertEquals(probadorA(calcularHuecos(REGLAS, dos, pedido(LUNES, LUNES)), "13:30"), 3);
  const r = calcularHuecos(REGLAS, [...dos, turno(3, LUNES, "13:30", "14:15")], pedido(LUNES, LUNES));
  assertEquals(horas(r)[0], "13:45");
  assertEquals(probadorA(r, "13:45"), 1);
});

Deno.test("b. sábado: 9:30 a 12 con 3 probadores y 13:30 a 18:30 con 2; entre 12 y 13:30, nada", () => {
  const r = calcularHuecos(REGLAS, [], pedido(SABADO, SABADO));
  const hs = horas(r);
  assertEquals(hs.filter((h) => h < "12:00"), ["09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15"]);
  assertEquals(hs.filter((h) => h >= "12:00" && h < "13:30"), []);
  assertEquals(hs.filter((h) => h >= "13:30")[0], "13:30");
  assertEquals(hs.at(-1), "17:45"); // 17:45 + 45' = 18:30
  assertEquals(hs.length, 8 + 18);

  // Con el 1 y el 2 ocupados: a la mañana entra el 3; a la tarde el 3 no toma turnos.
  const ocupados = [
    turno(1, SABADO, "09:30", "10:15"), turno(2, SABADO, "09:45", "10:30"),
    turno(1, SABADO, "13:30", "14:15"), turno(2, SABADO, "13:45", "14:30"),
  ];
  const r2 = calcularHuecos(REGLAS, ocupados, pedido(SABADO, SABADO));
  assertEquals(probadorA(r2, "10:00"), 3);
  assertEquals(probadorA(r2, "14:00"), undefined);
  assert(r2.huecos.filter((h) => horaLocal(new Date(h.inicio), TZ) >= "13:30").every((h) => h.probador <= 2));
});

Deno.test("c. mismo día: solo lo que arranca después de la hora actual", () => {
  const ahora = local(LUNES, "15:05");
  const r = calcularHuecos(REGLAS, [], pedido(LUNES, LUNES, { ahora }));
  assertEquals(horas(r)[0], "15:15");
  assert(r.huecos.every((h) => new Date(h.inicio) > ahora));
  // Un desde en el pasado arranca hoy: el sábado anterior no aparece.
  const r2 = calcularHuecos(REGLAS, [], pedido("2030-06-01", LUNES, { ahora }));
  assertEquals(dias(r2), [LUNES]);
});

Deno.test("d. domingo (sin franjas) y fuera de franja: cero huecos", () => {
  assertEquals(calcularHuecos(REGLAS, [], pedido(DOMINGO, DOMINGO)).huecos, []);
  const r = calcularHuecos(REGLAS, [], pedido(LUNES, DOMINGO));
  assert(!dias(r).includes(DOMINGO));
  // Cada hueco entra entero en una franja, en un probador que toma turnos en ella (lo valida el
  // mismo código que usa agendar_turno antes de escribir).
  for (const h of r.huecos) {
    const ok = dentroDeFranja(new Date(h.inicio), new Date(h.fin), FRANJAS, TZ, h.probador);
    assert(ok.ok, `hueco fuera de franja: ${h.inicio} (probador ${h.probador})`);
  }
});

Deno.test("e. escalonado de a 15': nunca dos turnos a menos de 15', y sale de la tabla", () => {
  // Con un turno a las 13:00 en el 1: esa hora no se ofrece, 13:15 va al 2 y 13:45 vuelve al 1.
  const r = calcularHuecos(REGLAS, [turno(1, LUNES, "13:00", "13:45")], pedido(LUNES, LUNES));
  assert(!horas(r).includes("13:00"));
  assertEquals(probadorA(r, "13:15"), 2);
  assertEquals(probadorA(r, "13:45"), 1);
  // A cada hora, un solo probador.
  const semana = calcularHuecos(REGLAS, [], pedido(LUNES, SABADO));
  assertEquals(new Set(semana.huecos.map((h) => h.inicio)).size, semana.huecos.length);
  // Un turno cargado a mano fuera de la grilla (13:05) corre a 13:00 y 13:15, no a 13:30.
  const r2 = calcularHuecos(REGLAS, [turno(3, LUNES, "13:05", "13:50")], pedido(LUNES, LUNES));
  assertEquals(horas(r2).slice(0, 2), ["13:30", "13:45"]);
  // Con un escalonado de 30 los turnos arrancan cada 30'.
  const r30 = calcularHuecos({ ...REGLAS, escalonadoMin: 30 }, [], pedido(LUNES, LUNES));
  assertEquals(horas(r30).slice(0, 3), ["13:00", "13:30", "14:00"]);
});

Deno.test("f. doble y triple en un solo probador, sin cruzar el final de la franja", () => {
  const doble = calcularHuecos({ ...REGLAS, duracionMin: 90 }, [], pedido(LUNES, LUNES));
  assertEquals(horas(doble).at(-1), "17:30"); // 17:30 + 1:30 = 19:00
  const triple = calcularHuecos({ ...REGLAS, duracionMin: 120 }, [], pedido(SABADO, SABADO));
  assertEquals(horas(triple).filter((h) => h < "12:00"), ["09:30", "09:45", "10:00"]); // 10:00 + 2:00 = 12:00
  assertEquals(horas(triple).at(-1), "16:30"); // 16:30 + 2:00 = 18:30
  for (const h of triple.huecos) {
    const ok = dentroDeFranja(new Date(h.inicio), new Date(h.fin), FRANJAS, TZ, h.probador);
    assert(ok.ok, `${h.inicio}–${h.fin} cruza el final de su franja`);
  }
  // Con el 1 ocupado a las 14:00, un doble a las 13:00 va al 2: el 1 no está libre la 1:30 entera.
  const r = calcularHuecos({ ...REGLAS, duracionMin: 90 }, [turno(1, LUNES, "14:00", "14:45")], pedido(LUNES, LUNES));
  assertEquals(probadorA(r, "13:00"), 2);
});

Deno.test("h. cambiar una franja, los probadores o una duración cambia el resultado sin tocar código", () => {
  const conCorte = FRANJAS.filter((f) => f.diaSemana !== 1).concat(
    { diaSemana: 1, desde: min("13:00"), hasta: min("14:00"), probadores: 3 },
    { diaSemana: 1, desde: min("15:00"), hasta: min("19:00"), probadores: 3 },
  );
  const r = calcularHuecos({ ...REGLAS, franjas: conCorte }, [], pedido(LUNES, LUNES));
  assertEquals(horas(r).filter((h) => h < "15:00"), ["13:00", "13:15"]); // 13:15 + 45' = 14:00
  assertEquals(horas(calcularHuecos({ ...REGLAS, duracionMin: 60 }, [], pedido(LUNES, LUNES))).at(-1), "18:00");
  const unSoloProbador = FRANJAS.map((f) => ({ ...f, probadores: 1 }));
  const r2 = calcularHuecos({ ...REGLAS, franjas: unSoloProbador }, [turno(1, LUNES, "13:00", "13:45")], pedido(LUNES, LUNES));
  assertEquals(horas(r2)[0], "13:45");
});

Deno.test("i. evento hoy o mañana: ningún hueco y derivar evento_inminente", () => {
  const ahora = local(LUNES, "10:00");
  for (const fechaEvento of [LUNES, MARTES]) {
    const r = calcularHuecos(REGLAS, [], pedido(LUNES, VIERNES, { ahora, fechaEvento }));
    assertEquals(r, { huecos: [], derivar: "evento_inminente" }, fechaEvento);
  }
  // Pasado mañana sigue el camino normal, y nada el día del evento ni después.
  const r = calcularHuecos(REGLAS, [], pedido(LUNES, VIERNES, { ahora, fechaEvento: MIERCOLES }));
  assertEquals(r.derivar, undefined);
  assertEquals(dias(r), [LUNES, MARTES]);
  // Un evento que ya pasó no tiene huecos (buscar_horarios lo rechaza antes).
  assertEquals(calcularHuecos(REGLAS, [], pedido(LUNES, VIERNES, { ahora, fechaEvento: "2030-06-01" })), { huecos: [] });
});

Deno.test("j. orden de urgencia: los 7 días que vienen quedan para los eventos de esa semana", () => {
  const U: ReglasAgenda = { ...REGLAS, diasReservaUrgencia: 7 };
  const ahora = local(LUNES, "10:00"); // la reserva va del lunes 3 al domingo 9; hoy + 7 = lunes 10
  const pedidoU = (fechaEvento: string | null) => pedido(LUNES, "2030-06-16", { ahora, fechaEvento });

  const urgente = calcularHuecos(U, [], pedidoU(SABADO));
  assertEquals(dias(urgente)[0], LUNES);
  assertEquals(horas(urgente)[0], "13:00");

  const lejano = calcularHuecos(U, [], pedidoU(EVENTO_LEJANO));
  assertEquals(dias(lejano)[0], "2030-06-10");
  assertEquals(horas(lejano)[0], "13:00");

  // Bordes: el evento el día hoy + 7 es urgente; el de hoy + 8 tiene solo el día hoy + 7.
  assertEquals(dias(calcularHuecos(U, [], pedidoU("2030-06-10")))[0], LUNES);
  assertEquals(dias(calcularHuecos(U, [], pedidoU("2030-06-11"))), ["2030-06-10"]);

  // Sin fecha de evento la reserva vale igual; sin reserva (vacío), se ofrece desde hoy.
  assertEquals(dias(calcularHuecos(U, [], pedidoU(null)))[0], "2030-06-10");
  assertEquals(dias(calcularHuecos(REGLAS, [], pedidoU(EVENTO_LEJANO)))[0], LUNES);

  // Los más cercanos primero.
  const inicios = lejano.huecos.map((h) => h.inicio);
  assertEquals(inicios, [...inicios].sort());
});

Deno.test("grep: huecos.ts no tiene horas, duraciones, probadores ni días escritos a mano", async () => {
  const fuente = await Deno.readTextFile(new URL("./huecos.ts", import.meta.url));
  const codigo = fuente.replace(/\/\/.*$/gm, "").replace(/"[^"\n]*"|`[^`]*`/g, '""');
  assertEquals(codigo.match(/\b\d{1,2}:\d{2}\b/g), null);
  const numeros = [...new Set(codigo.match(/\b\d+\b/g) ?? [])].sort();
  assert(numeros.every((n) => ["0", "1", "2"].includes(n)), `números en el código: ${numeros.join(", ")}`);
});

// Cierres puntuales (pedido de Mateo, 21/9): feriados y dias sueltos en que el local no abre.
// La tabla la maneja paneles; aca solo llega el conjunto de fechas.
Deno.test("un dia cerrado no ofrece ningun turno, aunque su dia de la semana tenga franja", () => {
  const abierto = calcularHuecos(REGLAS, [], pedido(LUNES, LUNES));
  assert(abierto.huecos.length > 0, "el lunes tiene que tener turnos si no esta cerrado");
  const cerrado = calcularHuecos(REGLAS, [], pedido(LUNES, LUNES, { cerrados: new Set([LUNES]) }));
  assertEquals(cerrado.huecos, []);
});

Deno.test("cerrar un dia no toca los otros: el resto de la semana sigue igual", () => {
  const todaLaSemana = calcularHuecos(REGLAS, [], pedido(LUNES, SABADO));
  const sinElLunes = calcularHuecos(REGLAS, [], pedido(LUNES, SABADO, { cerrados: new Set([LUNES]) }));
  const diasDe = (r: ResultadoAgenda) => [...new Set(r.huecos.map((h) => h.inicio.slice(0, 10)))];
  const antes = diasDe(todaLaSemana);
  const despues = diasDe(sinElLunes);
  assert(antes.length > despues.length, "tiene que faltar al menos un dia");
  assertEquals(despues, antes.filter((d) => d !== LUNES));
  // Y los horarios de los demas dias no se corren ni cambian.
  const martes = (r: ResultadoAgenda) => r.huecos.filter((h) => !h.inicio.startsWith(LUNES)).map((h) => h.inicio);
  assertEquals(martes(sinElLunes), martes(todaLaSemana));
});

Deno.test("una fecha cerrada que no esta en el rango no molesta (caso parecido)", () => {
  const conRuido = calcularHuecos(REGLAS, [], pedido(LUNES, LUNES, { cerrados: new Set(["2031-01-01", "2030-12-25"]) }));
  assertEquals(horas(conRuido), horas(calcularHuecos(REGLAS, [], pedido(LUNES, LUNES))));
});
