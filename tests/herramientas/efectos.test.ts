// Control 5 del hito 1.4: las herramientas de acción escriben lo que dicen, verificado contra
// la base real adentro de una transacción con rollback. La verdad es lo que quedó en la base,
// no lo que devolvió la herramienta (principio 9).

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import {
  agendar,
  buscar,
  contar,
  crearCliente,
  crearTurno,
  esOk,
  esRechazo,
  FECHA_EVENTO,
  fila,
  hueco,
  iso,
  JUEVES,
  local,
  prueba,
  SABADO,
  soloEstosEnlaces,
  soloEstosFragmentos,
} from "./_arnes.ts";

const CONDICIONES = "Te esperamos en España 764, Rosario. Se permite un acompañante por persona y hay tolerancia de unos minutos.";

prueba("agendar_turno escribe el turno en el primer probador libre, la ficha y arma la confirmación", async ({ ctx, sql, clienteId, agenda, calendario }) => {
  await soloEstosFragmentos(sql, [{ tema: "como-funciona", titulo: "El turno en el local", texto: CONDICIONES }]);
  await soloEstosEnlaces(sql, [{ nombre: "Mapa", url: "mapa.ejemplo.invalid/otto" }]);
  // El probador 1 está ocupado a esa hora por otro cliente: tiene que caer en el 2.
  await crearTurno(sql, { clienteId: await crearCliente(sql), inicio: local(JUEVES, "11:00"), probador: 1, tipo: "novio" });
  agenda.lista = [hueco(JUEVES, "11:00", 45, 1), hueco(JUEVES, "11:00", 45, 2)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));

  const r = await agendar(ctx, JUEVES, "11:00", "invitado", { nombre: "Juan Pérez", evento: "casamiento", fecha_evento: FECHA_EVENTO });
  esOk(r);
  const t = await fila(
    sql,
    "select cliente_id::text, tipo, probador, inicio, fin, duracion_min, estado, confirmado, editado_por, google_event_id, aviso from turnos where id = $1",
    [r.datos.turno_id],
  );
  assertEquals(t.cliente_id, clienteId);
  assertEquals(t.tipo, "invitado");
  assertEquals(t.probador, 2);
  assertEquals(new Date(t.inicio).getTime(), local(JUEVES, "11:00").getTime());
  assertEquals(new Date(t.fin).getTime(), local(JUEVES, "11:45").getTime());
  assertEquals(t.duracion_min, 45);
  assertEquals(t.estado, "sin-confirmar");
  assertEquals(t.confirmado, false);
  assertEquals(t.editado_por, "lucia");
  assertEquals(t.google_event_id, "evento-prueba-1");
  assertEquals(t.aviso, null);
  assertEquals(calendario.llamadas.map((l) => l.accion), ["crear"]);

  const c = await fila(sql, "select nombre, evento, fecha_evento::text as fecha_evento, editado_por from clientes where id = $1", [clienteId]);
  assertEquals([c.nombre, c.evento, c.fecha_evento, c.editado_por], ["Juan Pérez", "casamiento", FECHA_EVENTO, "lucia"]);

  const confirmacion = r.efectos?.mensajesAlCliente?.[0] ?? "";
  assertMatch(confirmacion, /^¡Listo, Juan! Tu turno quedó agendado para el jueves 6 de junio a las 11:00\./);
  assert(confirmacion.includes(CONDICIONES));
  assert(confirmacion.includes("📍 mapa.ejemplo.invalid/otto"));
  assertEquals(r.datos.faltan_en_la_confirmacion, undefined);
});

prueba("agendar_turno: si Calendar falla, el turno queda igual en la base, con aviso", async ({ ctx, sql, clienteId, agenda, calendario }) => {
  await sql.query("update clientes set nombre = 'Ana', fecha_evento = $2 where id = $1", [clienteId, FECHA_EVENTO]);
  calendario.falla = true;
  agenda.lista = [hueco(JUEVES, "16:00", 45, 3)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "graduado"));
  const r = await agendar(ctx, JUEVES, "16:00", "graduado");
  esOk(r);
  const t = await fila(sql, "select google_event_id, aviso from turnos where id = $1", [r.datos.turno_id]);
  assertEquals(t.google_event_id, null);
  assertMatch(t.aviso, /^Google Calendar: no se pudo crear el evento/);
});

prueba("agendar_turno: sin fragmento de condiciones ni mapa, la confirmación sale igual y avisa qué falta", async ({ ctx, sql, clienteId, agenda }) => {
  await soloEstosFragmentos(sql, []);
  await soloEstosEnlaces(sql, []);
  await sql.query("update clientes set nombre = 'Ana', fecha_evento = $2 where id = $1", [clienteId, FECHA_EVENTO]);
  agenda.lista = [hueco(SABADO, "09:30", 45, 1)];
  esOk(await buscar(ctx, SABADO, SABADO, "invitado"));
  const r = await agendar(ctx, SABADO, "09:30", "invitado");
  esOk(r);
  assertEquals(r.efectos?.mensajesAlCliente, ["¡Listo, Ana! Tu turno quedó agendado para el sábado 8 de junio a las 09:30."]);
  assertEquals((r.datos.faltan_en_la_confirmacion as string[]).length, 2);
});

prueba("reprogramar_turno mueve la misma fila, vuelve a sin confirmar y mueve el evento", async ({ ctx, sql, clienteId, agenda, calendario }) => {
  await sql.query("update clientes set nombre = 'Juan', fecha_evento = $2 where id = $1", [clienteId, FECHA_EVENTO]);
  const turno = await crearTurno(sql, {
    clienteId, inicio: local(SABADO, "10:00"), probador: 1, estado: "confirmado", confirmado: true, googleEventId: "evento-viejo",
  });
  agenda.lista = [hueco(JUEVES, "16:00", 45, 3)];
  esOk(await buscar(ctx, JUEVES, JUEVES, "invitado"));
  const r = await ejecutarHerramienta("reprogramar_turno", { turno_id: turno, fecha_hora: iso(JUEVES, "16:00") }, ctx);
  esOk(r);
  const t = await fila(
    sql,
    "select inicio, fin, probador, estado, confirmado, confirmado_at, recordatorio_enviado_at, google_event_id, editado_por, version from turnos where id = $1",
    [turno],
  );
  assertEquals(new Date(t.inicio).getTime(), local(JUEVES, "16:00").getTime());
  assertEquals(new Date(t.fin).getTime(), local(JUEVES, "16:45").getTime());
  assertEquals(t.probador, 3);
  assertEquals([t.estado, t.confirmado, t.confirmado_at, t.recordatorio_enviado_at], ["sin-confirmar", false, null, null]);
  assertEquals(t.google_event_id, "evento-viejo");
  assertEquals(t.editado_por, "lucia");
  assertEquals(t.version, 2);
  assertEquals(await contar(sql, "select count(*)::int as n from turnos where cliente_id = $1", [clienteId]), 1);
  assertEquals(calendario.llamadas, [{ accion: "mover", eventoId: "evento-viejo", turnoId: turno }]);
  assertMatch(r.efectos?.mensajesAlCliente?.[0] ?? "", /jueves 6 de junio a las 16:00/);
});

prueba("confirmar_turno marca confirmado y arma el mensaje fijo, aparte del texto del modelo (decisión de Mateo, 16/9: sin botón)", async ({ ctx, sql, clienteId }) => {
  const turno = await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00"), probador: 1 });
  const r = await ejecutarHerramienta("confirmar_turno", { turno_id: turno }, ctx);
  esOk(r);
  const t = await fila(sql, "select estado, confirmado, confirmado_at, confirmado_por from turnos where id = $1", [turno]);
  assertEquals([t.estado, t.confirmado, t.confirmado_por], ["confirmado", true, "cliente"]);
  assert(t.confirmado_at !== null);
  assertEquals(r.efectos?.mensajesAlCliente, ["¡Gracias por confirmar! Te esperamos en el local."]);
});

prueba("confirmar_turno es idempotente: confirmar de nuevo no rompe, y sigue mandando el mensaje (caso parecido)", async ({ ctx, sql, clienteId }) => {
  const turno = await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00"), probador: 1, estado: "confirmado", confirmado: true });
  const r = await ejecutarHerramienta("confirmar_turno", { turno_id: turno }, ctx);
  esOk(r);
  assertEquals(r.datos.nota, "Ya estaba confirmado; igual sale el mensaje de siempre.");
  assertEquals(r.efectos?.mensajesAlCliente, ["¡Gracias por confirmar! Te esperamos en el local."]);
});

prueba("confirmar_turno rechaza un turno de otro cliente, uno inexistente y uno vencido", async ({ ctx, sql, clienteId }) => {
  const deOtro = await crearTurno(sql, { clienteId: await crearCliente(sql), inicio: local(SABADO, "10:00"), probador: 1 });
  esRechazo(await ejecutarHerramienta("confirmar_turno", { turno_id: deOtro }, ctx), "turno_de_otro_cliente");

  esRechazo(await ejecutarHerramienta("confirmar_turno", { turno_id: "00000000-0000-0000-0000-000000000000" }, ctx), "turno_inexistente");

  // turno_confirmar_por_boton (0021) usa el now() real de la base, no el "ahora" simulado de la
  // prueba (2030): tiene que ser una fecha vencida de verdad, no solo anterior a ctx.ahora.
  const vencido = await crearTurno(sql, { clienteId, inicio: new Date("2020-01-01T10:00:00-03:00"), probador: 2 });
  esRechazo(await ejecutarHerramienta("confirmar_turno", { turno_id: vencido }, ctx), "turno_no_confirmable");
});

prueba("cancelar_turno marca cancelado con motivo, no borra, libera el hueco y saca el evento", async ({ ctx, sql, clienteId, calendario }) => {
  const turno = await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00"), probador: 1, googleEventId: "evento-a-cancelar" });
  const r = await ejecutarHerramienta("cancelar_turno", { turno_id: turno, motivo: "se postergó el casamiento" }, ctx);
  esOk(r);
  const t = await fila(sql, "select estado, motivo_cancelacion, cancelado_at, editado_por from turnos where id = $1", [turno]);
  assertEquals([t.estado, t.motivo_cancelacion, t.editado_por], ["cancelado", "se postergó el casamiento", "lucia"]);
  assert(t.cancelado_at !== null);
  assertEquals(calendario.llamadas, [{ accion: "cancelar", eventoId: "evento-a-cancelar" }]);
  // El hueco quedó libre: otro cliente entra en el mismo probador a la misma hora.
  await crearTurno(sql, { clienteId: await crearCliente(sql), inicio: local(SABADO, "10:00"), probador: 1 });
});

prueba("guardar_datos_cliente capitaliza el nombre al guardarlo (hallazgo B1 del tester, 15/9)", async ({ ctx, sql, clienteId }) => {
  esOk(await ejecutarHerramienta("guardar_datos_cliente", { nombre: "denise gomez", evento: null, fecha_evento: null, rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null, color_preferido: null, presupuesto_mencionado: null }, ctx));
  assertEquals((await fila(sql, "select nombre from clientes where id = $1", [clienteId])).nombre, "Denise Gomez");
});

prueba("guardar_datos_cliente escribe solo lo que vino y deja historial de la versión anterior", async ({ ctx, sql, clienteId }) => {
  await sql.query("update clientes set ciudad = 'Rosario' where id = $1", [clienteId]);
  const antes = await contar(sql, "select count(*)::int as n from historial_ediciones where tabla = 'clientes' and fila_id = $1", [clienteId]);
  const r = await ejecutarHerramienta(
    "guardar_datos_cliente",
    {
      nombre: "Verónica", evento: "graduacion", fecha_evento: "2030-11-20", rol: "padre", dia_o_noche: "noche",
      talle_aprox: null, ciudad: "Roldán", color_preferido: null, presupuesto_mencionado: null,
    },
    ctx,
  );
  esOk(r);
  const c = await fila(
    sql,
    "select nombre, evento, fecha_evento::text as fecha_evento, rol, dia_o_noche, ciudad, talle_aprox, editado_por from clientes where id = $1",
    [clienteId],
  );
  assertEquals(
    [c.nombre, c.evento, c.fecha_evento, c.rol, c.dia_o_noche, c.ciudad, c.talle_aprox, c.editado_por],
    ["Verónica", "graduacion", "2030-11-20", "padre", "noche", "Roldán", null, "lucia"],
  );
  const despues = await contar(sql, "select count(*)::int as n from historial_ediciones where tabla = 'clientes' and fila_id = $1", [clienteId]);
  assertEquals(despues, antes + 1);
  const previa = await fila(
    sql,
    // Adentro de una transacción now() es el mismo para todo: se ordena por versión, no por fecha.
    "select datos_anteriores->>'ciudad' as ciudad from historial_ediciones where tabla = 'clientes' and fila_id = $1 order by version desc limit 1",
    [clienteId],
  );
  assertEquals(previa.ciudad, "Rosario");

  // Mandar lo mismo otra vez no escribe nada nuevo.
  esOk(await ejecutarHerramienta("guardar_datos_cliente", { ciudad: "Roldán" }, ctx));
  assertEquals(await contar(sql, "select count(*)::int as n from historial_ediciones where tabla = 'clientes' and fila_id = $1", [clienteId]), despues);
});

prueba("guardar_datos_cliente guarda el mail en minúscula (hito 2.3)", async ({ ctx, sql, clienteId }) => {
  esOk(await ejecutarHerramienta("guardar_datos_cliente", { email: "Juan@Gmail.com" }, ctx));
  assertEquals((await fila(sql, "select email from clientes where id = $1", [clienteId])).email, "juan@gmail.com");

  // Uno nuevo y válido reemplaza al anterior (supuesto #35: se corrigió).
  esOk(await ejecutarHerramienta("guardar_datos_cliente", { email: "juan.otro@hotmail.com" }, ctx));
  assertEquals((await fila(sql, "select email from clientes where id = $1", [clienteId])).email, "juan.otro@hotmail.com");
});

prueba("guardar_datos_cliente rechaza un mail sin forma de mail y no toca la ficha", async ({ ctx, sql, clienteId }) => {
  await sql.query("update clientes set email = 'valido@otto.com' where id = $1", [clienteId]);
  esRechazo(await ejecutarHerramienta("guardar_datos_cliente", { email: "no es un mail" }, ctx), "email_invalido");
  assertEquals((await fila(sql, "select email from clientes where id = $1", [clienteId])).email, "valido@otto.com");
});

prueba("anotar deja la nota en la libreta del cliente", async ({ ctx, sql, clienteId }) => {
  esOk(await ejecutarHerramienta("anotar", { texto: "Quiere algo azul para un casamiento de día." }, ctx));
  const n = await fila(sql, "select autor, texto from notas where cliente_id = $1", [clienteId]);
  assertEquals([n.autor, n.texto], ["lucia", "Quiere algo azul para un casamiento de día."]);
});

prueba("derivar_a_persona escribe la derivación, pausa la charla y corta el turno", async ({ ctx, sql, conversacionId }) => {
  const r = await ejecutarHerramienta(
    "derivar_a_persona",
    { motivo: "corporativo", mensaje_al_cliente: "Le paso tu consulta a alguien del equipo y te escriben en un rato." },
    ctx,
  );
  esOk(r);
  const d = await fila(sql, "select id::text as id, motivo, estado from derivaciones where conversacion_id = $1", [conversacionId]);
  assertEquals([d.motivo, d.estado], ["corporativo", "pendiente"]);
  assertEquals((await fila(sql, "select estado from conversaciones where id = $1", [conversacionId])).estado, "derivada");
  assertEquals(r.efectos?.cortaTurno, true);
  assertEquals(r.efectos?.mensajesAlCliente, ["Le paso tu consulta a alguien del equipo y te escriben en un rato."]);
  assertEquals(r.efectos?.avisoEquipo, { motivo: "corporativo", derivacionId: d.id });

  // Derivar otra vez en la misma charla no crea otra fila.
  esOk(await ejecutarHerramienta("derivar_a_persona", { motivo: "pide_persona", mensaje_al_cliente: null }, ctx));
  assertEquals(await contar(sql, "select count(*)::int as n from derivaciones where conversacion_id = $1", [conversacionId]), 1);
});

prueba("derivar_a_persona con motivo descuento o reclamo no manda la despedida", async ({ ctx }) => {
  const r = await ejecutarHerramienta("derivar_a_persona", { motivo: "descuento", mensaje_al_cliente: "Le paso tu consulta al equipo." }, ctx);
  esOk(r);
  assertEquals(r.efectos?.mensajesAlCliente, []);
});
