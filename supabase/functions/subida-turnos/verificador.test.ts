import { assertEquals } from "jsr:@std/assert@1.0.13";
import type { Acuerdo } from "./lector.ts";
import { esDiaYHoraReal, fraseEstaEnLaCharla, verificar } from "./verificador.ts";

const TZ = "America/Argentina/Cordoba";
const AHORA = new Date("2026-10-14T12:00:00-03:00");

const acuerdo = (o: Partial<Acuerdo> = {}): Acuerdo => ({
  frase: "este jueves a las 13:30 podria ser", hayAcuerdo: true, dia: "2026-10-15", hora: "13:30", propuso: "local", acepto: "cliente",
  nombre: null, email: null, intencionSinHora: false, motivo: "", ...o,
});
const base = {
  textos: ["Hola", "este jueves a las 13:30 podria ser", "Ok", "perfecto! ya te agende"],
  turnosDelCliente: [],
  ahora: AHORA,
  tz: TZ,
  diaSinTurnos: () => null,
};

Deno.test("acuerdo claro y sin turno cargado: se carga (Marcos, 13/10)", () => {
  const d = verificar({ ...base, acuerdo: acuerdo() });
  assertEquals(d.accion, "cargar");
  if (d.accion === "cargar") assertEquals(d.inicio.toISOString(), "2026-10-15T16:30:00.000Z");
});

Deno.test("si el cliente ya tiene el turno a esa hora, no se vuelve a cargar", () => {
  const d = verificar({ ...base, acuerdo: acuerdo(), turnosDelCliente: [{ id: "t1", inicio: new Date("2026-10-15T16:30:00Z"), estado: "sin-confirmar" }] });
  assertEquals(d.accion, "ya_esta");
});

Deno.test("si tiene otro turno a futuro, se mueve ese y no se agrega uno (decisión de Mateo, 14/10)", () => {
  const d = verificar({ ...base, acuerdo: acuerdo(), turnosDelCliente: [{ id: "t1", inicio: new Date("2026-10-16T13:00:00Z"), estado: "sin-confirmar" }] });
  assertEquals(d.accion, "mover");
  if (d.accion === "mover") assertEquals(d.turnoId, "t1");
});

Deno.test("caso parecido: con dos turnos a futuro no se sabe cuál mover, va a revisión", () => {
  const d = verificar({
    ...base, acuerdo: acuerdo(),
    turnosDelCliente: [
      { id: "t1", inicio: new Date("2026-10-20T13:00:00Z"), estado: "sin-confirmar" },
      { id: "t2", inicio: new Date("2026-10-22T13:00:00Z"), estado: "confirmado" },
    ],
  });
  assertEquals(d.accion, "dudoso");
});

Deno.test("un horario que ya pasó no se carga (Nicolás, 14/10 a las 11)", () => {
  const d = verificar({ ...base, acuerdo: acuerdo({ dia: "2026-10-14", hora: "11:00" }) });
  assertEquals(d.accion, "pasado");
});

Deno.test("sin hora no se carga: queda «falta datos» (Vicky: «el viernes 16»)", () => {
  const d = verificar({ ...base, acuerdo: acuerdo({ hayAcuerdo: false, dia: "2026-10-16", hora: null, intencionSinHora: true, motivo: "falta la hora" }) });
  assertEquals(d.accion, "falta_datos");
});

Deno.test("acuerdo marcado pero sin hora real: falta datos, nunca se inventa una hora", () => {
  assertEquals(verificar({ ...base, acuerdo: acuerdo({ hora: null }) }).accion, "falta_datos");
  assertEquals(verificar({ ...base, acuerdo: acuerdo({ hora: "25:99" }) }).accion, "falta_datos");
  assertEquals(verificar({ ...base, acuerdo: acuerdo({ dia: "2026-02-31" }) }).accion, "falta_datos");
});

Deno.test("sin acuerdo ni ganas: no se hace nada", () => {
  assertEquals(verificar({ ...base, acuerdo: acuerdo({ hayAcuerdo: false, intencionSinHora: false }) }).accion, "sin_acuerdo");
});

Deno.test("la frase inventada por el modelo no pasa: va a revisión", () => {
  const d = verificar({ ...base, acuerdo: acuerdo({ frase: "listo, te espero el jueves a las 13:30 en el local" }) });
  assertEquals(d.accion, "dudoso");
});

Deno.test("día cerrado o feriado: no se carga y se explica por qué", () => {
  const d = verificar({ ...base, acuerdo: acuerdo({ dia: "2026-10-15" }), diaSinTurnos: (ymd) => (ymd === "2026-10-15" ? "Feriado: puente" : null) });
  assertEquals(d.accion, "dudoso");
});

Deno.test("hay día y hora pero nadie aceptó: no se carga", () => {
  assertEquals(verificar({ ...base, acuerdo: acuerdo({ acepto: null }) }).accion, "dudoso");
});

Deno.test("sin lectura (el modelo falló) nunca carga", () => {
  assertEquals(verificar({ ...base, acuerdo: null }).accion, "dudoso");
});

Deno.test("esDiaYHoraReal y fraseEstaEnLaCharla", () => {
  assertEquals(esDiaYHoraReal("2026-10-15", "13:30"), true);
  assertEquals(esDiaYHoraReal("2026-13-01", "13:30"), false);
  assertEquals(esDiaYHoraReal(null, "13:30"), false);
  assertEquals(fraseEstaEnLaCharla("Ya te agende", ["perfecto! ya te agende Marcos"]), true);
  assertEquals(fraseEstaEnLaCharla("nada", ["nada"]), false);
});

Deno.test("acordó y después canceló ese mismo turno: no se vuelve a cargar (Berina, 15/10)", () => {
  const d = verificar({ ...base, acuerdo: acuerdo(), turnosCancelados: [{ inicio: new Date("2026-10-15T16:30:00Z") }] });
  assertEquals(d.accion, "dudoso");
});

Deno.test("caso parecido: un turno cancelado de otro horario no frena el acuerdo nuevo", () => {
  const d = verificar({ ...base, acuerdo: acuerdo(), turnosCancelados: [{ inicio: new Date("2026-10-20T16:30:00Z") }] });
  assertEquals(d.accion, "cargar");
});
