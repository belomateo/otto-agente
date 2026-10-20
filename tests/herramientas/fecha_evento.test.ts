// «Es un 15 de mi hija» no es el día 15 (Darien, 17/10).

import { assertEquals } from "jsr:@std/assert@1.0.13";
import { quinceNoEsUnDia } from "../../supabase/functions/_shared/herramientas/fecha_evento.ts";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { validarExtraccion } from "../../supabase/functions/_shared/llm/extractor.ts";
import { esOk, prueba } from "./_arnes.ts";

Deno.test("quinceNoEsUnDia: la fiesta de quince no es el día 15, pero «15 de marzo» sí", () => {
  const darien = "Marzo 2027 Pero necesito ir viendo Es un 15 de mi hija Si Dale";
  assertEquals(quinceNoEsUnDia("2027-03-15", darien), true);
  assertEquals(quinceNoEsUnDia("2027-03-15", "Para un 15 y yo sería el padre"), true);
  assertEquals(quinceNoEsUnDia("2027-03-15", "los 15 de mi nieta, en marzo"), true);
  // con el día dicho de verdad, vale
  assertEquals(quinceNoEsUnDia("2027-03-15", "Es un 15 de mi hija, el 15 de marzo"), false);
  assertEquals(quinceNoEsUnDia("2027-03-15", "son los 15 de mi hija el 15/3"), false);
  assertEquals(quinceNoEsUnDia("2027-03-15", "los 15 de mi hija son el día 15"), false);
  // sin fiesta de quince, nada cambia
  assertEquals(quinceNoEsUnDia("2027-03-15", "Marzo 2027"), false);
  assertEquals(quinceNoEsUnDia("2027-03-15", "me caso el 15 de marzo"), false);
  // otro día del mes: no se mira
  assertEquals(quinceNoEsUnDia("2027-01-02", "Para un 15 y yo sería el padre es para el 2 de enero"), false);
  assertEquals(quinceNoEsUnDia(null, darien), false);
});

Deno.test("validarExtraccion descarta fecha_evento cuando el «15» es la fiesta (Darien) y la deja si dijo el día", () => {
  const origen = (cliente: string) => ({ cliente, lucia: "" });
  const a = validarExtraccion({ evento: "fiesta", fecha_evento: "2027-03-15" }, "2026-10-20", origen("Marzo 2027. Es un 15 de mi hija"));
  assertEquals(a.ficha, { evento: "fiesta" });
  assertEquals(a.descartados.length, 1);
  const b = validarExtraccion({ evento: "fiesta", fecha_evento: "2027-03-15" }, "2026-10-20", origen("Es un 15 de mi hija, el 15 de marzo"));
  assertEquals(b.ficha, { evento: "fiesta", fecha_evento: "2027-03-15" });
});

prueba("guardar_datos_cliente no guarda un día 15 sacado de «un 15 de mi hija» (Darien, 17/10)", async ({ ctx, sql, clienteId, conversacionId }) => {
  for (const [i, t] of ["Marzo 2027", "Es un 15 de mi hija"].entries()) {
    await sql.query(
      "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', $2, clock_timestamp() - make_interval(mins => $3))",
      [conversacionId, t, 5 - i],
    );
  }
  esOk(await ejecutarHerramienta("guardar_datos_cliente", { nombre: null, evento: "fiesta", fecha_evento: "2031-03-15", rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null, nota: null }, ctx));
  const [f] = (await sql.query("select evento, fecha_evento::text as fecha_evento from clientes where id = $1", [clienteId])).rows;
  assertEquals(f.evento, "fiesta");
  assertEquals(f.fecha_evento, null);
  // con el día dicho, sí se guarda
  await sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', 'Es el 15 de marzo', clock_timestamp())",
    [conversacionId],
  );
  esOk(await ejecutarHerramienta("guardar_datos_cliente", { nombre: null, evento: null, fecha_evento: "2031-03-15", rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null, email: null, nota: null }, ctx));
  const [g] = (await sql.query("select fecha_evento::text as fecha_evento from clientes where id = $1", [clienteId])).rows;
  assertEquals(g.fecha_evento, "2031-03-15");
});
