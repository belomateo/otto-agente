import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import { mensajesDeEfectos } from "../../supabase/functions/_shared/herramientas/efectos.ts";
import { contar, esOk, esRechazo, fila, hueco, iso, JUEVES, prueba } from "./_arnes.ts";

const pedido = { desde: JUEVES, hasta: JUEVES, tipo_turno: null, fecha_evento: null, fecha_hora: iso(JUEVES, "12:00") };
const reserva = { fecha_hora: pedido.fecha_hora, tipo: null, nombre: null, evento: null, fecha_evento: null };

prueba("sin nombre ni correo reserva y después actualiza la misma visita", async ({ ctx, sql, clienteId, agenda }) => {
  agenda.lista = [hueco(JUEVES, "12:00", 45)];
  esOk(await ejecutarHerramienta("buscar_horarios", pedido, ctx));
  const agendado = await ejecutarHerramienta("agendar_turno", reserva, ctx);
  esOk(agendado);
  const inicial = agendado.efectos?.mensajesAlCliente?.[0] ?? "";
  assertMatch(inicial, /Nombre: No especificado/);
  assertMatch(inicial, /Gmail: No especificado/);
  assertMatch(inicial, /tu nombre y correo electrónico/);
  const antes = await fila(sql, "select id, inicio, fin, estado, probador from turnos where cliente_id = $1", [clienteId]);

  const nombre = await ejecutarHerramienta("guardar_datos_cliente", { nombre: "aldo lera" }, ctx);
  esOk(nombre);
  assertMatch(nombre.efectos?.mensajesAlCliente?.[0] ?? "", /Nombre: Aldo Lera/);
  assertMatch(nombre.efectos?.mensajesAlCliente?.[0] ?? "", /tu correo electrónico\?/);
  const correo = await ejecutarHerramienta("guardar_datos_cliente", { email: "ALDO@ejemplo.com" }, ctx);
  esOk(correo);
  assertEquals(correo.datos.turno_id, agendado.datos.turno_id);
  const actualizado = correo.efectos?.mensajesAlCliente?.[0] ?? "";
  assertMatch(actualizado, /Ya actualicé los datos de tu reserva/);
  assertMatch(actualizado, /Gmail: aldo@ejemplo.com/);
  assertEquals(actualizado.includes("No especificado"), false);
  assertEquals(actualizado.includes("¿"), false);
  assertEquals(await fila(sql, "select id, inicio, fin, estado, probador from turnos where cliente_id = $1", [clienteId]), antes);
  assertEquals(await contar(sql, "select count(*)::int n from turnos where cliente_id = $1", [clienteId]), 1);
  assertEquals(mensajesDeEfectos([agendado.efectos!, nombre.efectos!, correo.efectos!]), [actualizado]);
});

prueba("nombre y correo juntos completan una reserva sin duplicarla", async ({ ctx, sql, clienteId, agenda }) => {
  agenda.lista = [hueco(JUEVES, "12:00", 45)];
  esOk(await ejecutarHerramienta("buscar_horarios", pedido, ctx));
  esOk(await ejecutarHerramienta("agendar_turno", reserva, ctx));
  const r = await ejecutarHerramienta("guardar_datos_cliente", { nombre: "Aldo Lera", email: "aldo@ejemplo.com" }, ctx);
  esOk(r);
  assertMatch(r.efectos?.mensajesAlCliente?.[0] ?? "", /Nombre: Aldo Lera/);
  assertMatch(r.efectos?.mensajesAlCliente?.[0] ?? "", /Gmail: aldo@ejemplo.com/);
  assertEquals(await contar(sql, "select count(*)::int n from turnos where cliente_id = $1", [clienteId]), 1);
});

prueba("guardar nombre sin reserva no anuncia un turno inexistente", async ({ ctx }) => {
  const r = await ejecutarHerramienta("guardar_datos_cliente", { nombre: "Aldo Lera" }, ctx);
  esOk(r);
  assertEquals(r.efectos, undefined);
});

prueba("reserva mínima guarda nombre, teléfono y horario exacto sin evento, rol ni mail", async ({ ctx, sql, clienteId, agenda }) => {
  await sql.query("update clientes set nombre = 'Ana', evento = null, fecha_evento = null, rol = null, email = null where id = $1", [clienteId]);
  // La hora elegida es la tercera: antes quedaba fuera de las dos opciones por franja.
  agenda.lista = [hueco(JUEVES, "10:00", 45), hueco(JUEVES, "11:00", 45), hueco(JUEVES, "12:00", 45)];
  const horarios = await ejecutarHerramienta("buscar_horarios", pedido, ctx);
  esOk(horarios);
  assertEquals(horarios.datos.horario_elegido_disponible, true);
  assertEquals(horarios.datos.pedir_mail, undefined);
  assertEquals((horarios.datos.huecos as unknown[]).length, 1);
  const resultado = await ejecutarHerramienta("agendar_turno", reserva, ctx);
  esOk(resultado);
  const guardado = await fila(sql, `select c.nombre, c.telefono, c.evento, c.fecha_evento, c.rol, c.email,
    t.inicio, t.tipo from turnos t join clientes c on c.id = t.cliente_id where c.id = $1`, [clienteId]);
  assertEquals(guardado.nombre, "Ana");
  assertEquals(guardado.telefono, ctx.cliente.telefono);
  assertEquals(new Date(guardado.inicio).getTime(), new Date(pedido.fecha_hora).getTime());
  assertEquals([guardado.evento, guardado.fecha_evento, guardado.rol, guardado.email], [null, null, null, null]);
  assertEquals(guardado.tipo, "invitado");
  assertMatch(resultado.efectos?.mensajesAlCliente?.[0] ?? "", /Ana/);
});

prueba("horario elegido ocupado no se sustituye por otra hora", async ({ ctx, sql, clienteId, agenda }) => {
  await sql.query("update clientes set nombre = 'Ana' where id = $1", [clienteId]);
  agenda.lista = [hueco(JUEVES, "10:00", 45)];
  const horarios = await ejecutarHerramienta("buscar_horarios", pedido, ctx);
  esOk(horarios);
  assertEquals(horarios.datos.horario_elegido_disponible, false);
  esRechazo(await ejecutarHerramienta("agendar_turno", reserva, ctx), "hueco_no_ofrecido");
  assertEquals(await contar(sql, "select count(*)::int n from turnos where cliente_id = $1", [clienteId]), 0);
});

prueba("reserva mínima rechaza teléfono vacío", async ({ ctx, sql, clienteId, agenda }) => {
  await sql.query("update clientes set nombre = 'Ana' where id = $1", [clienteId]);
  ctx.cliente.telefono = " ";
  agenda.lista = [hueco(JUEVES, "12:00", 45)];
  esOk(await ejecutarHerramienta("buscar_horarios", pedido, ctx));
  esRechazo(await ejecutarHerramienta("agendar_turno", reserva, ctx), "falta_telefono");
  assertEquals(await contar(sql, "select count(*)::int n from turnos where cliente_id = $1", [clienteId]), 0);
});

prueba("horario exacto fuera del rango se rechaza", async ({ ctx }) => {
  esRechazo(await ejecutarHerramienta("buscar_horarios", { ...pedido, fecha_hora: "2030-06-07T12:00:00-03:00" }, ctx), "fecha_hora_fuera_de_rango");
});

prueba("horario exacto sin zona se rechaza", async ({ ctx }) => {
  esRechazo(await ejecutarHerramienta("buscar_horarios", { ...pedido, fecha_hora: "2030-06-06T12:00:00" }, ctx), "argumentos_invalidos");
});
