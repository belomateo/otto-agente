// Reseña tras la prueba final (0112), contra la base real en rollback: sale el día siguiente al evento
// (o 3 días después de la prueba si no hay fecha), una sola vez, y no a quien canceló o no vino.
import { assert } from "jsr:@std/assert@1.0.13";
import { conBase } from "../herramientas/_arnes.ts";

const TZ = "America/Argentina/Cordoba";
const AHORA = new Date("2030-06-11T12:00:00-03:00"); // martes al mediodía
const dias = (n: number) => new Date(AHORA.getTime() + n * 86400000);

Deno.test({
  name: "reseña tras la prueba final: cuándo sale y a quién no (0112)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      await sql.query("begin");
      try {
        await sql.query(await Deno.readTextFile(new URL("../../supabase/migrations/0111_seguimiento_23h.sql", import.meta.url)));
        await sql.query(await Deno.readTextFile(new URL("../../supabase/migrations/0112_resena_tras_prueba_final.sql", import.meta.url)));
        let n = 0;
        const prueba = async (o: { pruebaHace: number; evento?: number | null; estado?: string; tipo?: string }) => {
          n++;
          const evento = o.evento === undefined || o.evento === null ? null : dias(o.evento).toISOString().slice(0, 10);
          const cli = (await sql.query("insert into clientes (telefono, nombre, fecha_evento) values ($1, $2, $3) returning id::text as id", [`+54900000992${n}`, `C${n}`, evento])).rows[0].id;
          const inicio = new Date(dias(-o.pruebaHace).getTime() - n * 3600000); // escalonados: no se pisan en el probador
          const t = (await sql.query(
            "insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, editado_por) values ($1, $2, 45, 1, $3, $4, $5, 'prueba') returning id::text as id",
            [cli, o.tipo ?? "prueba_final", inicio.toISOString(), new Date(inicio.getTime() + 2700000).toISOString(), o.estado ?? "confirmado"],
          )).rows[0].id;
          return t as string;
        };
        const conEventoAyer = await prueba({ pruebaHace: 10, evento: -1 }); // evento ayer → hoy toca
        const eventoHoy = await prueba({ pruebaHace: 10, evento: 0 }); // el evento es hoy → mañana
        const eventoAntes = await prueba({ pruebaHace: 20, evento: -9 }); // pasó hace 9 días: la ventana de 6 ya cerró
        const sinFecha = await prueba({ pruebaHace: 3 }); // sin evento: 3 días después de la prueba
        const sinFechaReciente = await prueba({ pruebaHace: 1 });
        const cancelado = await prueba({ pruebaHace: 10, evento: -1, estado: "cancelado" });
        const noVino = await prueba({ pruebaHace: 10, evento: -1, estado: "no-vino" });
        const otroTipo = await prueba({ pruebaHace: 10, evento: -1, tipo: "invitado" });

        const lista = async () =>
          new Set(
            (await sql.query("select referencia::text as r from envios_pendientes('agradecimiento_resena', $1, $2)", [TZ, AHORA.toISOString()])).rows.map((f) => f.r),
          );
        const l = await lista();
        assert(l.has(conEventoAyer), "el día siguiente al evento sale");
        assert(l.has(sinFecha), "sin fecha de evento, 3 días después de la prueba");
        for (const [nombre, id] of Object.entries({ eventoHoy, eventoAntes, sinFechaReciente, cancelado, noVino, otroTipo })) {
          assert(!l.has(id), `${nombre} no sale hoy`);
        }

        // Una sola vez por turno.
        const cli = (await sql.query("select cliente_id::text as c from turnos where id = $1", [conEventoAyer])).rows[0].c;
        await sql.query("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('agradecimiento_resena', $1, $2, 'agradecimiento', 'enviado', $3)", [conEventoAyer, cli, AHORA.toISOString()]);
        assert(!(await lista()).has(conEventoAyer), "ya enviado, no se repite");
      } finally {
        await sql.query("rollback");
      }
    }),
});
