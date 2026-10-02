import { assertEquals } from "jsr:@std/assert@1.0.13";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { prueba, esOk } from "./_arnes.ts";
prueba("el enlace sale una vez por intercambio", async ({ ctx }) => {
  const primero = await ejecutarHerramienta("enviar_link", { tipo: "web-venta" }, ctx);
  esOk(primero);
  assertEquals(primero.efectos?.mensajesAlCliente?.length, 1);
  const segundo = await ejecutarHerramienta("enviar_link", { tipo: "web-venta" }, ctx);
  esOk(segundo);
  assertEquals(segundo.efectos, undefined);
});
prueba("no repite enlace anterior salvo pedido expreso del cliente", async ({ ctx }) => {
  const primero = await ejecutarHerramienta("enviar_link", { tipo: "web-venta" }, ctx);
  esOk(primero);
  await ctx.db.consulta("insert into mensajes(conversacion_id,direccion,contenido) values ($1,'saliente',$2)", [ctx.conversacionId, primero.efectos!.mensajesAlCliente![0]]);
  ctx.traza.llamadas = [];
  const segundo = await ejecutarHerramienta("enviar_link", { tipo: "web-venta" }, ctx);
  esOk(segundo);
  assertEquals(segundo.efectos, undefined);
  await ctx.db.consulta("insert into mensajes(conversacion_id,direccion,contenido) values ($1,'entrante','Pasame el link de nuevo')", [ctx.conversacionId]);
  ctx.traza.llamadas = [];
  const tercero = await ejecutarHerramienta("enviar_link", { tipo: "web-venta" }, ctx);
  esOk(tercero);
  assertEquals(tercero.efectos?.mensajesAlCliente?.length, 1);
});
