// Insistencia de confirmación (0124, Sofía 17/11), contra la base real en rollback: sale a quien no contestó el
// recordatorio en 3 horas, con el turno sin confirmar y a más de 2 horas; no a quien escribió, confirmó o ya llega.
import { assert } from "jsr:@std/assert@1.0.13";
import { conBase } from "../herramientas/_arnes.ts";

const TZ = "America/Argentina/Cordoba";
const AHORA = new Date("2030-06-11T12:00:00-03:00"); // martes al mediodía
const horas = (n: number) => new Date(AHORA.getTime() + n * 3600000).toISOString();

Deno.test({
  name: "insistencia de confirmación: a quién le sale y a quién no (0124)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      await sql.query("begin");
      try {
        await sql.query(await Deno.readTextFile(new URL("../../supabase/migrations/0124_confirmacion_asistencia.sql", import.meta.url)));
        let n = 0;
        const turno = async (o: { recordatorioHace: number; enHoras: number; escribio?: boolean; confirmado?: boolean }) => {
          n++;
          const cli = (await sql.query("insert into clientes (telefono, nombre) values ($1, $2) returning id::text as id", [`+54900000993${n}`, `C${n}`])).rows[0].id;
          const conv = (await sql.query("insert into conversaciones (cliente_id, canal) values ($1, 'prueba') returning id::text as id", [cli])).rows[0].id;
          if (o.escribio) {
            await sql.query("insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', 'ok', $2)", [conv, horas(-1)]);
          }
          const inicio = new Date(new Date(horas(o.enHoras)).getTime() + n * 2700000); // escalonados de a 45 min: no se pisan en el probador
          return (await sql.query(
            `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, confirmado, recordatorio_enviado_at, editado_por)
             values ($1, 'invitado', 45, 1, $2, $3, $4, $5, $6, 'prueba') returning id::text as id`,
            [cli, inicio.toISOString(), new Date(inicio.getTime() + 2700000).toISOString(), o.confirmado ? "confirmado" : "sin-confirmar", !!o.confirmado, horas(-o.recordatorioHace)],
          )).rows[0].id as string;
        };
        const yaLlega = await turno({ recordatorioHace: 20, enHoras: 0 }); // el turno es en 45 minutos
        const sinRespuesta = await turno({ recordatorioHace: 4, enHoras: 10 });
        const recien = await turno({ recordatorioHace: 1, enHoras: 10 }); // todavía no pasaron 3 horas
        const escribio = await turno({ recordatorioHace: 4, enHoras: 10, escribio: true });
        const confirmo = await turno({ recordatorioHace: 4, enHoras: 10, confirmado: true });

        const lista = async (ahora = AHORA) =>
          new Set((await sql.query("select referencia::text as r from envios_pendientes('confirmacion_asistencia', $1, $2)", [TZ, ahora.toISOString()])).rows.map((f) => f.r));
        const l = await lista();
        assert(l.has(sinRespuesta), "sin respuesta en 3 horas, sale");
        for (const [nombre, id] of Object.entries({ recien, escribio, confirmo, yaLlega })) assert(!l.has(id), `${nombre} no sale`);
        assert(!(await lista(new Date("2030-06-11T22:00:00-03:00"))).has(sinRespuesta), "de noche no sale");

        // Una sola vez por turno.
        const cli = (await sql.query("select cliente_id::text as c from turnos where id = $1", [sinRespuesta])).rows[0].c;
        await sql.query("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('confirmacion_asistencia', $1, $2, 'recordatorio_turno_2', 'enviado', $3)", [sinRespuesta, cli, AHORA.toISOString()]);
        assert(!(await lista()).has(sinRespuesta), "ya enviada, no se repite");
      } finally {
        await sql.query("rollback");
      }
    }),
});
