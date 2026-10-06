// Recontactos más cuidadosos (0088, revisión de las últimas 20 charlas, Mateo 6/10), contra la base
// real en rollback: se aplica la migración adentro de la transacción y se arman cinco charlas.
//  · normal: el cliente escribió ayer → le toca el primero.
//  · Lucía apagada en la charla → no le toca (caso real: le llegó a un cliente que DEVOLVÍA el traje).
//  · ya alquiló hace poco → no le toca.
//  · contestó el primero ("ya les hablo") → no le toca el segundo.
//  · no contestó el primero → le toca el segundo.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { conBase } from "./_arnes.ts";

const TZ = "America/Argentina/Cordoba";
const AHORA = new Date("2030-06-10T12:00:00-03:00"); // lunes al mediodía: dentro de la franja decente
const dias = (n: number) => new Date(AHORA.getTime() - n * 24 * 3600 * 1000);

Deno.test({
  name: "recontactos: con Lucía apagada, si ya alquiló o si contestó el primero, no sale (0088)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      await sql.query("begin");
      try {
        await sql.query(await Deno.readTextFile(new URL("../../supabase/migrations/0088_recontacto_mas_cuidadoso.sql", import.meta.url)));
        let n = 0;
        const charla = async (nombre: string, ultimoDelCliente: Date, o: { luciaActiva?: boolean } = {}) => {
          n++;
          const cli = (await sql.query("insert into clientes (telefono, nombre) values ($1, $2) returning id::text as id", [`+54900000873${n}`, nombre])).rows[0].id;
          const conv = (await sql.query(
            "insert into conversaciones (cliente_id, canal, iniciado_at, lucia_activa) values ($1, 'prueba', $2, $3) returning id::text as id",
            [cli, dias(10).toISOString(), o.luciaActiva ?? true],
          )).rows[0].id;
          await sql.query("insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', 'Cuánto sale?', $2)", [conv, ultimoDelCliente.toISOString()]);
          return { cli, conv };
        };
        const recontacto1Enviado = (conv: string, cli: string, en: Date) =>
          sql.query(
            "insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('recontacto_1', $1, $2, 'recontacto_cliente', 'enviado', $3)",
            [conv, cli, en.toISOString()],
          );

        const normal = await charla("Normal", dias(1));
        const apagada = await charla("Apagada", dias(1), { luciaActiva: false });
        const alquilo = await charla("Alquilo", dias(1));
        await sql.query(
          "insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, editado_por) values ($1, 'invitado', 45, 1, $2, $3, 'alquilo', 'prueba')",
          [alquilo.cli, dias(20).toISOString(), new Date(dias(20).getTime() + 45 * 60000).toISOString()],
        );
        // Contestó el primero: su último mensaje es posterior al recontacto_1.
        const contesto = await charla("Contesto", dias(3));
        await recontacto1Enviado(contesto.conv, contesto.cli, new Date(dias(2).getTime() - 3600 * 1000));
        await sql.query("update mensajes set enviado_at = $2 where conversacion_id = $1", [contesto.conv, dias(3).toISOString()]);
        await sql.query("insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', 'Tengo que coordinar unas cosas y ya les hablo', $2)", [contesto.conv, new Date(dias(2).getTime() + 3600 * 1000).toISOString()]);
        // No contestó el primero: sigue callado desde hace tres días.
        const callado = await charla("Callado", dias(3));
        await recontacto1Enviado(callado.conv, callado.cli, dias(2));

        const pendientes = async (tipo: string) =>
          new Set((await sql.query("select referencia::text as r from envios_pendientes($1, $2, $3)", [tipo, TZ, AHORA.toISOString()])).rows.map((f) => f.r));
        const primero = await pendientes("recontacto_1");
        const segundo = await pendientes("recontacto_2");

        assert(primero.has(normal.conv), "a la charla normal le toca el primero");
        assert(!primero.has(apagada.conv), "con Lucía apagada en la charla, no");
        assert(!primero.has(alquilo.conv), "si ya alquiló hace poco, no");
        assert(!segundo.has(contesto.conv), "si contestó el primero, no le toca el segundo");
        assert(segundo.has(callado.conv), "si no contestó el primero, le toca el segundo");
        // La charla que contestó tampoco está en el primero (su último mensaje fue hace dos días).
        assertEquals(primero.has(contesto.conv), false);
      } finally {
        await sql.query("rollback");
      }
    }),
});
