import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { resumenTurno } from "../../supabase/functions/_shared/herramientas/confirmacion.ts";
import { mensajesDeEfectos } from "../../supabase/functions/_shared/herramientas/efectos.ts";
import { confirmacionDoble } from "../../supabase/functions/_shared/barandillas/chequeos/confirmacion_doble.ts";
import { entrada } from "../barandillas/_ayuda.ts";
import { trazaNueva } from "../../supabase/functions/_shared/traza.ts";
import { prepararParaEnviar } from "../../supabase/functions/_shared/whatsapp/preparar.ts";

const datos = { nombre: null, email: null, telefono: "+5490001234567", inicio: new Date("2030-06-06T12:00:00-03:00"), tz: "America/Argentina/Cordoba" };

Deno.test("lista simple con datos faltantes y fecha real", () => {
  const texto = resumenTurno(datos);
  assertEquals(texto.split("\n").filter((l) => l.startsWith("- ")).length, 4);
  assertMatch(texto, /- Nombre: No especificado/);
  assertMatch(texto, /- Número: \+5490001234567/);
  assertMatch(texto, /- Día y hora: jueves 6 de junio a las 12:00 hs/);
  assertMatch(texto, /- Gmail: No especificado/);
  assertMatch(texto, /tu nombre y correo electrónico/);
});

Deno.test("la lista completa queda en un solo mensaje aunque nombre y correo sean largos", () => {
  const texto = resumenTurno({ ...datos, nombre: "Aldo ".repeat(15).trim(), email: "a".repeat(100) + "@ejemplo.com" });
  const mensajes = prepararParaEnviar([texto]);
  assertEquals(mensajes.filter((m) => ["- Nombre:", "- Número:", "- Día y hora:", "- Gmail:"].every((campo) => m.includes(campo))).length, 1);
});

Deno.test("correo presente y nombre ausente pide solo nombre; dato no introduce líneas", () => {
  assertMatch(resumenTurno({ ...datos, email: "aldo@ejemplo.com" }), /tu nombre\?/);
  const completo = resumenTurno({ ...datos, nombre: "Aldo\nLera", email: "aldo@ejemplo.com", actualizado: true });
  assertEquals(completo.includes("¿"), false);
  assertMatch(completo, /- Nombre: Aldo Lera\n- Número:/);
});

Deno.test("una sola lista por reserva sin perder otros mensajes", () => {
  assertEquals(mensajesDeEfectos([
    { resumenTurnoId: "uno", mensajesAlCliente: ["vieja"] },
    { mensajesAlCliente: ["respuesta aparte"] },
    { resumenTurnoId: "uno", mensajesAlCliente: ["actualizada"] },
    { resumenTurnoId: "dos", mensajesAlCliente: ["otra reserva"] },
  ]), ["respuesta aparte", "actualizada", "otra reserva"]);
});

Deno.test("se recorta resumen repetido por modelo conservando respuesta independiente", async () => {
  const traza = trazaNueva();
  traza.resumenTurnoEmitido = true;
  const r = await confirmacionDoble.evaluar(entrada(
    "¡Excelente! Ya actualicé los datos de tu reserva:\n\n- **Nombre:** Aldo Lera\n- **Número:** +5490001234567\n- **Día y hora:** jueves a las 12:00\n- **Gmail:** aldo@ejemplo.com\n\nTambién tenemos chalecos.", { traza },
  ));
  assertEquals(r.salta, true);
  if (r.salta) assertEquals(r.texto, "También tenemos chalecos.");
});

Deno.test("se recorta pregunta duplicada de datos pendientes", async () => {
  const traza = trazaNueva();
  traza.resumenTurnoEmitido = true;
  const r = await confirmacionDoble.evaluar(entrada("Para completar tus datos, ¿me decís tu nombre y correo electrónico?", { traza }));
  assertEquals(r.salta, true);
  if (r.salta) assertEquals(r.texto, "");
});

Deno.test("sin resumen emitido no se borra una actualización de ficha", async () => {
  const r = await confirmacionDoble.evaluar(entrada("Ya actualicé tus datos.", { traza: trazaNueva() }));
  assertEquals(r.salta, false);
});
