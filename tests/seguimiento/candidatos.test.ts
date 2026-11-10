// Seguimiento de 23 horas (0111), contra la base real en rollback: se aplica la migración adentro de la
// transacción y se arman las charlas que sí y las que no, y cómo convive con el recontacto.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { conBase } from "../herramientas/_arnes.ts";

const TZ = "America/Argentina/Cordoba";
const AHORA = new Date("2030-06-11T12:00:00-03:00"); // martes al mediodía
const horas = (n: number) => new Date(AHORA.getTime() - n * 3600 * 1000);

Deno.test({
  name: "seguimiento 23 hs: la lista de charlas, y el recontacto no se pisa con él (0111)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    conBase(async (sql) => {
      await sql.query("begin");
      try {
        // 0114 le cambia las columnas a seguimiento_candidatos: la base ya la tiene así, y 0111 no puede reemplazarla.
        await sql.query("drop function if exists public.seguimiento_candidatos(timestamptz)");
        await sql.query(await Deno.readTextFile(new URL("../../supabase/migrations/0111_seguimiento_23h.sql", import.meta.url)));
        await sql.query(await Deno.readTextFile(new URL("../../supabase/migrations/0114_seguimiento_sin_doble_aviso.sql", import.meta.url)));
        let n = 0;
        const charla = async (nombre: string, o: {
          entrante?: Date; luciaActiva?: boolean; ultimo?: "lucia" | "mostrador" | "demora"; turnoPorVenir?: boolean; canal?: string;
        } = {}) => {
          n++;
          const cli = (await sql.query("insert into clientes (telefono, nombre) values ($1, $2) returning id::text as id", [`+54900000991${n}`, nombre])).rows[0].id;
          const conv = (await sql.query(
            "insert into conversaciones (cliente_id, canal, iniciado_at, lucia_activa) values ($1, $2, $3, $4) returning id::text as id",
            [cli, o.canal ?? "whatsapp", horas(48).toISOString(), o.luciaActiva ?? true],
          )).rows[0].id;
          const entrante = o.entrante ?? horas(22);
          await sql.query("insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', 'Hola, quiero alquilar un traje', $2)", [conv, entrante.toISOString()]);
          const texto = o.ultimo === "mostrador" ? "[mostrador] Hola, te escribo yo" : o.ultimo === "demora" ? "Perdón la demora, repetime" : "Para qué fecha es el evento?";
          await sql.query("insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'saliente', 'texto', $2, $3)", [conv, texto, new Date(entrante.getTime() + 60000).toISOString()]);
          if (o.turnoPorVenir) {
            await sql.query(
              "insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin, estado, editado_por) values ($1, 'invitado', 45, 1, $2, $3, 'sin-confirmar', 'prueba')",
              [cli, new Date(AHORA.getTime() + 86400000).toISOString(), new Date(AHORA.getTime() + 86400000 + 2700000).toISOString()],
            );
          }
          return { cli, conv };
        };
        const candidatos = async () =>
          new Set((await sql.query("select referencia::text as r from seguimiento_candidatos($1)", [AHORA.toISOString()])).rows.map((f) => f.r));

        const normal = await charla("Normal");
        const mostrador = await charla("Mostrador", { ultimo: "mostrador" });
        const apagada = await charla("Apagada", { luciaActiva: false });
        const conTurno = await charla("ConTurno", { turnoPorVenir: true });
        const reciente = await charla("Reciente", { entrante: horas(5) });
        const vencida = await charla("Vencida", { entrante: horas(25) });
        const demora = await charla("Demora", { ultimo: "demora" });
        const prueba = await charla("Prueba", { canal: "prueba" });
        const yaMirada = await charla("YaMirada");
        await sql.query("insert into eventos_agente (conversacion_id, tipo, detalle, creado_at) values ($1, 'pensamiento', '{\"etapa\":\"seguimiento\",\"interes\":false}', $2)", [yaMirada.conv, horas(1).toISOString()]);
        const yaEnviada = await charla("YaEnviada");
        await sql.query("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('seguimiento_23h', $1, $2, 'texto_sin_fecha', 'enviado', $3)", [yaEnviada.conv, yaEnviada.cli, horas(1).toISOString()]);

        const lista = await candidatos();
        assertEquals([...lista], [normal.conv], "solo la charla normal entra en la lista");
        for (const x of [mostrador, apagada, conTurno, reciente, vencida, demora, prueba, yaMirada, yaEnviada]) assert(!lista.has(x.conv));

        // Con la fecha en la ficha y horarios buscados, la lista lo informa (el texto sale de eso).
        await sql.query("update clientes set fecha_evento = '2030-12-01' where id = $1", [normal.cli]);
        await sql.query("insert into eventos_agente (conversacion_id, tipo, detalle) values ($1, 'herramienta', '{\"herramienta\":\"buscar_horarios\",\"ok\":true}')", [normal.conv]);
        const fila = (await sql.query("select busco_horarios, tiene_fecha, fecha_evento::text as fecha from seguimiento_candidatos($1) where referencia = $2", [AHORA.toISOString(), normal.conv])).rows[0];
        assertEquals([fila.busco_horarios, fila.tiene_fecha, fila.fecha], [true, true, "2030-12-01"]);

        // 10/11: sin doble aviso. Si el recontacto ya salió después del último mensaje del cliente, no hay seguimiento.
        const conRecontacto = await charla("ConRecontacto");
        await sql.query("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('recontacto_1', $1, $2, 'recontacto_1', 'enviado', $3)", [conRecontacto.conv, conRecontacto.cli, horas(1).toISOString()]);
        assert(!(await candidatos()).has(conRecontacto.conv), "un recontacto ya enviado saca la charla de la lista");
        // …pero uno de antes del último mensaje del cliente no cuenta.
        const viejo = await charla("RecontactoViejo");
        await sql.query("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('recontacto_1', $1, $2, 'recontacto_1', 'enviado', $3)", [viejo.conv, viejo.cli, horas(60).toISOString()]);
        assert((await candidatos()).has(viejo.conv), "un recontacto anterior a su último mensaje no impide el seguimiento");

        // Convivencia con el recontacto: el cliente escribió ayer; si el seguimiento ya salió, no sale el primero.
        const ayer = new Date(AHORA.getTime() - 26 * 3600 * 1000);
        const a = await charla("Ayer1", { entrante: ayer });
        const b = await charla("Ayer2", { entrante: ayer });
        await sql.query("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('seguimiento_23h', $1, $2, 'texto_sin_fecha', 'enviado', $3)", [b.conv, b.cli, horas(2).toISOString()]);
        const rec1 = new Set((await sql.query("select referencia::text as r from envios_pendientes('recontacto_1', $1, $2)", [TZ, AHORA.toISOString()])).rows.map((f) => f.r));
        assert(rec1.has(a.conv), "sin seguimiento, el primer recontacto sale como siempre");
        assert(!rec1.has(b.conv), "con el seguimiento ya enviado, no sale el primer recontacto");

        // Y el segundo recontacto, a los 3 días, sigue al seguimiento.
        const tres = new Date(AHORA.getTime() - 76 * 3600 * 1000);
        const c = await charla("Tres", { entrante: tres });
        await sql.query("insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('seguimiento_23h', $1, $2, 'texto_sin_fecha', 'enviado', $3)", [c.conv, c.cli, new Date(tres.getTime() + 23 * 3600 * 1000).toISOString()]);
        const rec2 = new Set((await sql.query("select referencia::text as r from envios_pendientes('recontacto_2', $1, $2)", [TZ, AHORA.toISOString()])).rows.map((f) => f.r));
        assert(rec2.has(c.conv), "el segundo recontacto sigue al seguimiento");

        // envio_terminar: el seguimiento queda en la charla como texto de Lucía.
        const id = (await sql.query("select envio_reservar('seguimiento_23h', $1, $2, 'texto_sin_fecha') as id", [a.conv, a.cli])).rows[0].id;
        await sql.query("select envio_terminar($1, true, 'wamid.TEST', 'Hola! Pudiste pensarlo?')", [id]);
        const m = (await sql.query("select direccion, tipo, contenido from mensajes where conversacion_id = $1 and wa_message_id = 'wamid.TEST'", [a.conv])).rows[0];
        assertEquals([m.direccion, m.tipo, m.contenido], ["saliente", "text", "Hola! Pudiste pensarlo?"]);
      } finally {
        await sql.query("rollback");
      }
    }),
});
