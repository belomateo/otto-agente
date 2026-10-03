// Ensayo del modelo real y agenda real, sin WhatsApp; cada caso termina en rollback.
// deno test --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=.env scripts/probar-reserva-minima.ts
import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { correrTurno } from "../supabase/functions/_shared/turno/turno.ts";
import { calendarioDeEnsayo } from "../supabase/functions/_shared/herramientas/tipos.ts";
import { AHORA, contar, fila, iso, JUEVES, prueba, TZ } from "../tests/herramientas/_arnes.ts";

for (const caso of [
  { mensaje: "Quiero reservar para el jueves 6 de junio a las 12 del mediodía.", reserva: true, esperado: "reserva" },
  { mensaje: "Quiero reservar para el jueves 6 de junio.", reserva: false, esperado: "hora" },
  { mensaje: "¿Trabajan talles para niños? ¿Qué rango de talles tienen?", reserva: false, esperado: "infantil" },
  { mensaje: "Quiero alquilar un traje de astronauta, ¿tienen?", reserva: false, esperado: "derivacion" },
  // Casos reales de la semana del 29/9 que terminaron derivados sin motivo.
  { mensaje: "Hola buen día, con cuánta antelación tengo que sacar turno?", reserva: false, esperado: "sigue" },
  { mensaje: "Es para una graduación en dic.. a partir de qué precio y con cuánto tiempo de anticipación debo reservar", reserva: false, esperado: "sigue" },
  { mensaje: "Horario y con que antelación debo alquilarlo", reserva: false, esperado: "sigue" },
  // Caso real del 2/10 (Alessandro): ya tenía turno y quería sumar a otra persona; derivó.
  { mensaje: "Quiero consultarte si podés agregar a mi turno a otra persona que también quiere alquilar, así vamos juntos. Es para el mismo evento", reserva: false, esperado: "sumar", turnoPrevio: true },
  // Casos reales del 3/10: Larisa ("turno para el lunes", dentro de la reserva y sin fecha de
  // evento) y los que pedían la tarde ("después de las 16"); los dos terminaban derivados.
  { mensaje: "Hola! Quisiera sacar turno para el miércoles", reserva: false, esperado: "pregunta_evento", reservaDias: 3 },
  { mensaje: "Hola, quiero un turno el jueves después de las 16", reserva: false, esperado: "franja" },
] as { mensaje: string; reserva: boolean; esperado: string; turnoPrevio?: boolean; reservaDias?: number }[]) {
  prueba(`Lucía real: ${caso.mensaje}`, async ({ sql, ctx, clienteId, conversacionId }) => {
    await sql.query("set local lock_timeout = '5s'");
    await sql.query("set local otto.sin_disparo = 'on'");
    // 0074–0079 ya están en producción (2/10). Se prueba la plantilla del repo tal cual está, sin
    // cargarla: dentro de esta transacción, que termina en rollback.
    await sql.query("update prompt_base set texto = $1 where unica", [await Deno.readTextFile(new URL("../plantilla-agente/02-prompt.md", import.meta.url))]);
    await sql.query("update configuracion_agenda set dias_reserva_urgencia = $1", [caso.reservaDias ?? null]);
    await sql.query("update clientes set nombre = null, evento = null, fecha_evento = null, rol = null, email = null where id = $1", [clienteId]);
    if (caso.turnoPrevio) {
      await sql.query("insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin) values ($1, 'invitado', 45, 1, $2::timestamptz, $2::timestamptz + interval '45 minutes')", [clienteId, iso(JUEVES, "12:00")]);
    }
    await sql.query("insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'entrante', 'texto', $2, $3::timestamptz)", [conversacionId, caso.mensaje, AHORA.toISOString()]);
    const { prompt } = await fila(sql, "select prompt_vigente() as prompt");
    const r = await correrTurno(ctx.db, {
      clienteId, telefono: ctx.cliente.telefono, conversacionId, ahora: AHORA, tz: TZ,
      calendario: calendarioDeEnsayo, derivacionTel: null, prompt,
    });
    console.log(JSON.stringify({ mensajes: r.mensajesAlCliente, derivo: r.derivo }));
    if (r.derivo) console.log(JSON.stringify((await sql.query("select tipo, detalle from eventos_agente where conversacion_id=$1 order by creado_at", [conversacionId])).rows));
    assertEquals(r.derivo, caso.esperado === "derivacion");
    assertEquals(await contar(sql, "select count(*)::int n from turnos where cliente_id = $1", [clienteId]), (caso.reserva ? 1 : 0) + (caso.turnoPrevio ? 1 : 0));
    if (caso.reserva) {
      const t = await fila(sql, "select inicio from turnos where cliente_id = $1", [clienteId]);
      assertEquals(new Date(t.inicio).getTime(), new Date(iso(JUEVES, "12:00")).getTime());
      assertMatch(r.mensajesAlCliente.join("\n"), /Nombre: No especificado/);
      assertEquals((r.mensajesAlCliente.join("\n").match(/Nombre:/g) ?? []).length, 1);
      const antes = await fila(sql, "select id, inicio, fin from turnos where cliente_id=$1", [clienteId]);
      // Ordenar el reloj de los mensajes ficticios en la fecha del ensayo, no en la del equipo.
      const continuar = async (texto: string, segundos: number) => {
        const fecha = new Date(AHORA.getTime() + segundos * 1000);
        await sql.query(`with orden as (select id, row_number() over(order by enviado_at,id) n from mensajes where conversacion_id=$1 and direccion='saliente' and enviado_at < $2)
          update mensajes m set enviado_at=$3::timestamptz + orden.n * interval '1 millisecond' from orden where m.id=orden.id`,
          [conversacionId, AHORA.toISOString(), new Date(fecha.getTime()-1000).toISOString()]);
        await sql.query("insert into mensajes(conversacion_id,direccion,tipo,contenido,enviado_at) values ($1,'entrante','texto',$2,$3)", [conversacionId,texto,fecha.toISOString()]);
        return correrTurno(ctx.db, {clienteId, telefono:ctx.cliente.telefono, conversacionId, ahora:fecha, tz:TZ, calendario:calendarioDeEnsayo, derivacionTel:null, prompt});
      };
      const completado = await continuar("Me llamo Aldo Lera y mi correo es aldo@ejemplo.com", 60);
      console.log(JSON.stringify({etapa:"datos posteriores", mensajes:completado.mensajesAlCliente,derivo:completado.derivo}));
      assertEquals(completado.derivo, false);
      assertMatch(completado.mensajesAlCliente.join("\n"), /Nombre: Aldo Lera/);
      assertMatch(completado.mensajesAlCliente.join("\n"), /Gmail: aldo@ejemplo.com/);
      assertEquals((completado.mensajesAlCliente.join("\n").match(/Nombre:/g) ?? []).length, 1);
      assertEquals(await contar(sql, "select count(*)::int n from turnos where cliente_id=$1", [clienteId]),1);
      assertEquals(await fila(sql,"select id,inicio,fin from turnos where cliente_id=$1",[clienteId]), antes);
      const ficha = await fila(sql,"select fecha_evento, dia_o_noche from clientes where id=$1",[clienteId]);
      assertEquals(ficha.fecha_evento,null);
      assertEquals(ficha.dia_o_noche,null);
      const gracias = await continuar("Muchas gracias por tu atención.",120);
      assertEquals(gracias.mensajesAlCliente, []);
    } else if (caso.esperado === "hora") {
      // Pregunta la hora u ofrece horas concretas de buscar_horarios: las dos están bien.
      assertMatch(r.mensajesAlCliente.join("\n"), /hora|horario|\d{1,2}:\d{2}/i);
      assertEquals(/cerrad|no hay|no tenemos/i.test(r.mensajesAlCliente.join("\n")), false);
    } else if (caso.esperado === "infantil") {
      assertMatch(r.mensajesAlCliente.join("\n"), /4\s*(?:al|a|hasta|–|-)\s*16/);
    } else if (caso.esperado === "pregunta_evento") {
      assertMatch(r.mensajesAlCliente.join("\n"), /evento|fecha|para cu[aá]ndo/i);
      assertEquals(/no hay|no tenemos|no quedan/i.test(r.mensajesAlCliente.join("\n")), false);
    } else if (caso.esperado === "franja") {
      assertMatch(r.mensajesAlCliente.join("\n"), /\b1[6-8][:.]\d{2}/);
      assertEquals(/\b13[:.](00|15)\b/.test(r.mensajesAlCliente.join("\n")), false);
    } else if (caso.esperado === "sumar") {
      assertMatch(r.mensajesAlCliente.join("\n"), /mismo turno|pueden venir|vengan|sumar/i);
      assertEquals(/no se puede|no hay|no tenemos/i.test(r.mensajesAlCliente.join("\n")), false);
    } else if (caso.esperado === "sigue") {
      assertEquals(/no tenemos|no hay|no trabajamos/i.test(r.mensajesAlCliente.join("\n")), false);
    } else {
      assertEquals(/no tenemos|no hay|no trabajamos/i.test(r.mensajesAlCliente.join("\n")), false);
    }
  });
}
