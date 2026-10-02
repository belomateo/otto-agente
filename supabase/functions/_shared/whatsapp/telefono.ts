// El teléfono como lo exige Meta para INICIAR un mensaje (plantillas): solo dígitos, con el
// código de país. Los que escribe el cliente por WhatsApp ya llegan así (549 + 10 dígitos);
// los que carga el equipo a mano desde el panel muchas veces no (hallazgo del 2/10, al prender
// las plantillas): "3415104980" sin el 549 —Meta lo toma como un número de otro país— o
// directamente "sin teléfono · Nombre", los turnos importados de doyTurnos.
//
// Devuelve null si no hay forma de armar un número válido: quien llama lo saltea en vez de
// gastar un intento contra Meta.

export function telefonoParaMeta(crudo: string | null | undefined): string | null {
  const d = String(crudo ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (/^549\d{10}$/.test(d)) return d; // ya está bien
  if (/^54\d{10}$/.test(d)) return `549${d.slice(2)}`; // Argentina sin el 9 de celular
  if (/^0?\d{10}$/.test(d) && !d.startsWith("54")) return `549${d.replace(/^0/, "")}`; // 341 1234567
  if (/^0\d{2,4}15\d{6,8}$/.test(d)) { // 0341 15 1234567: sin el 0 ni el 15
    const sin0 = d.slice(1);
    const i = sin0.indexOf("15");
    const local = sin0.slice(0, i) + sin0.slice(i + 2);
    if (/^\d{10}$/.test(local)) return `549${local}`;
  }
  if (!d.startsWith("54") && d.length >= 11 && d.length <= 15) return d; // otro país, con su código
  return null;
}
