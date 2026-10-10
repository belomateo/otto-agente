// Aviso al equipo cuando Lucía pasa una charla (0097, pedido de Mateo del 9/10), contra la base real
// en rollback: se aplica la migración adentro de la transacción y se arman cuatro derivaciones.
//  · reciente y pendiente → le toca el aviso.
//  · de anoche → le toca a la mañana (la franja de 9 a 21 vale también acá).
//  · vieja (más de 14 h) o ya atendida → no.
// Y lo que no se ve en el texto: el aviso sale una sola vez y no queda como mensaje de la charla
// (Lucía lo leería como algo que le dijo al cliente), solo en la bitácora.

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { conBase } from "./_arnes.ts";

const TZ = "America/Argentina/Cordoba";
const MEDIODIA = new Date("2030-06-10T12:00:00-03:00");
const horas = (base: Date, h: number) => new Date(base.getTime() + h * 3600 * 1000);

Deno.test({
  name: "aviso_derivacion: le toca a la derivación pendiente reciente, de 9 a 21, una sola vez y sin quedar en la charla (0097)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      await sql.query("begin");
      try {
        await sql.query(await Deno.readTextFile(new URL("../../supabase/migrations/0097_aviso_derivacion.sql", import.meta.url)));
        let n = 0;
        const derivacion = async (creado: Date, estado = "pendiente") => {
          n++;
          const cli = (await sql.query("insert into clientes (telefono, nombre) values ($1, $2) returning id::text as id", [`+54900000974${n}`, `Cliente ${n}`])).rows[0].id;
          const conv = (await sql.query(
            "insert into conversaciones (cliente_id, canal, iniciado_at, estado, lucia_activa) values ($1, 'prueba', $2, 'derivada', false) returning id::text as id",
            [cli, horas(creado, -1).toISOString()],
          )).rows[0].id;
          const id = (await sql.query(
            "insert into derivaciones (conversacion_id, motivo, estado, creado_at) values ($1, 'pide_persona', $2, $3) returning id::text as id",
            [conv, estado, creado.toISOString()],
          )).rows[0].id;
          return { cli, conv, id };
        };
        const pendientes = async (ahora: Date) =>
          new Set((await sql.query("select referencia::text as r from envios_pendientes('aviso_derivacion', $1, $2)", [TZ, ahora.toISOString()])).rows.map((f) => f.r));

        const reciente = await derivacion(horas(MEDIODIA, -0.5)); // 11:30
        const deNoche = await derivacion(new Date("2030-06-09T23:30:00-03:00")); // anoche: 12 h y media antes
        const vieja = await derivacion(horas(MEDIODIA, -20));
        const atendida = await derivacion(horas(MEDIODIA, -1), "atendida");

        const aLas12 = await pendientes(MEDIODIA);
        assert(aLas12.has(reciente.id), "la reciente");
        assert(aLas12.has(deNoche.id), "la de anoche sale a la mañana");
        assert(!aLas12.has(vieja.id), "la de hace 20 h ya no es noticia");
        assert(!aLas12.has(atendida.id), "la ya atendida");
        // De noche no sale nada: espera a las 9.
        assertEquals((await pendientes(new Date("2030-06-10T22:00:00-03:00"))).size, 0);

        // Reservado (salió o está saliendo): ya no le toca, así no sale dos veces.
        const envio = (await sql.query("select envio_reservar('aviso_derivacion', $1, $2, 'aviso_derivacion') as id", [reciente.id, reciente.cli])).rows[0].id;
        assert(envio);
        assert(!(await pendientes(MEDIODIA)).has(reciente.id));

        // Terminado bien: queda en la bitácora de la charla derivada y NO como mensaje de la charla.
        await sql.query("select envio_terminar($1, true, 'wamid.AVISO', 'Lucía pasó una charla al equipo.')", [envio]);
        assertEquals((await sql.query("select count(*)::int as n from mensajes where conversacion_id = $1", [reciente.conv])).rows[0].n, 0);
        const ev = (await sql.query(
          "select tipo, detalle from eventos_agente where conversacion_id = $1 and detalle->>'etapa' = 'envio_programado'",
          [reciente.conv],
        )).rows;
        assertEquals(ev.map((e) => [e.tipo, e.detalle.tipo]), [["ok", "aviso_derivacion"]]);

        // Lo que ya hacía la función sigue igual: el recordatorio saltea los días cerrados (0093).
        const fuente = (await sql.query("select prosrc from pg_proc where proname = 'envios_pendientes'")).rows[0].prosrc;
        assert(String(fuente).includes("cierres_agenda"));
        // Y el reloj quedó programado.
        assertEquals((await sql.query("select count(*)::int as n from cron.job where jobname = 'envios-aviso-derivacion'")).rows[0].n, 1);
      } finally {
        await sql.query("rollback");
      }
    }),
});
