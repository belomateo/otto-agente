// Las herramientas de consulta devuelven lo que hay en la base (nada inventado) y dejan en la
// traza lo que el modelo vio: precios, horas y huecos. Esa traza es la que después leen las
// precondiciones de las acciones y las barandillas.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { ejecutarHerramienta } from "../../supabase/functions/_shared/herramientas/index.ts";
import {
  AHORA,
  buscar,
  crearModelo,
  crearTurno,
  DOMINGO,
  esOk,
  esRechazo,
  hueco,
  JUEVES,
  local,
  LUNES,
  MARTES,
  prueba,
  SABADO,
  soloEstosFragmentos,
  soloEstosModelos,
} from "./_arnes.ts";

prueba("buscar_informacion encuentra escribiendo como cliente y suma el horario desde la tabla", async ({ ctx, sql }) => {
  await soloEstosFragmentos(sql, [
    { tema: "ubicacion-horarios", titulo: "Dónde estamos", texto: "Estamos en España 764, Rosario. Atendemos solo con turno." },
    { tema: "accesorios", titulo: "Completar el look", texto: "Alquilamos zapatos, cinturón, camisa y corbata." },
  ]);
  const r = await ejecutarHerramienta("buscar_informacion", { seccion: null, consulta: "sapatos" }, ctx);
  esOk(r);
  assertEquals((r.datos.fragmentos as { tema: string }[])[0].tema, "accesorios");
  assertEquals(r.datos.horario_del_local, undefined);

  const h = await ejecutarHerramienta("buscar_informacion", { seccion: "ubicacion-horarios", consulta: "direccion" }, ctx);
  esOk(h);
  assertEquals(
    h.datos.horario_del_local,
    "Lunes a viernes, de 10:00 a 19:00, con corte de 14:00 a 15:00. Sábados, de 9:30 a 18:30. Domingos, cerrado.",
  );
  for (const hora of ["10:00", "19:00", "14:00", "15:00", "09:30", "18:30"]) assert(ctx.traza.horasDevueltas.includes(hora));
});

prueba("buscar_informacion sin resultados lo dice y no inventa", async ({ ctx, sql }) => {
  await soloEstosFragmentos(sql, [{ tema: "talles", titulo: "Talles", texto: "Tenemos talles desde el chico hasta el grande." }]);
  const r = await ejecutarHerramienta("buscar_informacion", { seccion: null, consulta: "estacionamiento" }, ctx);
  esOk(r);
  assertEquals(r.datos.fragmentos, []);
  assertMatch(String(r.datos.nota), /dato_no_encontrado/);
});

prueba("consultar_catalogo filtra por color y talle, suma qué incluye y deja los precios en la traza", async ({ ctx, sql }) => {
  await soloEstosModelos(sql);
  await soloEstosFragmentos(sql, [{ tema: "que-incluye", titulo: "Qué incluye el precio", texto: "El precio incluye sastrería y tintorería." }]);
  await crearModelo(sql, { modelo: "Clásico", precio: 111, colores: ["Azul marino"], talles: ["48", "50"] });
  await crearModelo(sql, { modelo: "Noche", precio: 222, colores: ["Negro"], talles: ["52"], fotos: ["n.jpg"] });

  const todos = await ejecutarHerramienta("consultar_catalogo", { color: null, talle: null }, ctx);
  esOk(todos);
  assertEquals((todos.datos.modelos as { modelo: string }[]).map((m) => m.modelo), ["Clásico", "Noche"]);
  assertEquals(todos.datos.que_incluye, "El precio incluye sastrería y tintorería.");

  const azul = await ejecutarHerramienta("consultar_catalogo", { color: "azul", talle: null }, ctx);
  esOk(azul);
  assertEquals((azul.datos.modelos as { modelo: string }[]).map((m) => m.modelo), ["Clásico"]);

  const t52 = await ejecutarHerramienta("consultar_catalogo", { color: null, talle: "52" }, ctx);
  esOk(t52);
  assertEquals((t52.datos.modelos as { modelo: string; tiene_fotos: boolean }[]).map((m) => [m.modelo, m.tiene_fotos]), [["Noche", true]]);

  const nada = await ejecutarHerramienta("consultar_catalogo", { color: "bordó", talle: null }, ctx);
  esOk(nada);
  assertEquals(nada.datos.modelos, []);
  assertMatch(String(nada.datos.nota), /a secas/);

  assertEquals([...new Set(ctx.traza.preciosDevueltos)].sort((a, b) => a - b), [111, 222]);
});

prueba("consultar_catalogo sin qué incluye cargado no da precios", async ({ ctx, sql }) => {
  await soloEstosFragmentos(sql, []);
  esRechazo(await ejecutarHerramienta("consultar_catalogo", { color: null, talle: null }, ctx), "falta_que_incluye");
  assertEquals(ctx.traza.preciosDevueltos, []);
});

prueba("consultar_accesorios devuelve alquiler y compra desde la tabla y las condiciones", async ({ ctx, sql }) => {
  await sql.query("update accesorios_alquiler set activo = false where activo");
  await sql.query("insert into accesorios_alquiler (nombre, precio, precio_compra) values ('Camisa de prueba', 10, 8), ('Zapato de prueba', 20, null)");
  await soloEstosFragmentos(sql, [{ tema: "accesorios", titulo: "Accesorios", texto: "También se pueden comprar con descuento." }]);
  const r = await ejecutarHerramienta("consultar_accesorios", {}, ctx);
  esOk(r);
  assertEquals(r.datos.accesorios, [
    { nombre: "Camisa de prueba", precio_alquiler: 10, precio_compra: 8 },
    { nombre: "Zapato de prueba", precio_alquiler: 20, precio_compra: null },
  ]);
  assertEquals(r.datos.condiciones, "También se pueden comprar con descuento.");
  assertEquals(ctx.traza.preciosDevueltos.sort((a, b) => a - b), [8, 10, 20]);
});

prueba("buscar_horarios descarta lo que ya pasó o queda fuera de horario y deja en la traza lo que mostró", async ({ ctx, agenda }) => {
  agenda.lista = [
    hueco(DOMINGO, "11:00", 45), // cerrado
    hueco(MARTES, "14:15", 45), // corte
    hueco(LUNES, "10:00", 45), // ya pasó (ahora es lunes al mediodía)
    hueco(JUEVES, "11:00", 45, 1),
    hueco(JUEVES, "11:00", 45, 2),
  ];
  const r = await buscar(ctx, LUNES, DOMINGO, "invitado");
  esOk(r);
  assertEquals(r.datos.huecos, [{ fecha_hora: "2030-06-06T11:00:00-03:00", dia: "jueves 6 de junio", hora: "11:00", franja: "mañana" }]);
  assertEquals(r.datos.descartados_fuera_de_horario, 3);
  assertEquals(ctx.traza.huecosOfrecidos.map((h) => h.probador), [1, 2]);
  assert(ctx.traza.horasDevueltas.includes("11:00"));
});

prueba("buscar_horarios ofrece hasta dos por franja y por día", async ({ ctx, agenda }) => {
  agenda.lista = ["10:00", "10:15", "10:30", "10:45", "15:00", "15:15", "15:30"].map((h) => hueco(JUEVES, h, 45));
  const r = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(r);
  assertEquals((r.datos.huecos as { hora: string }[]).map((h) => h.hora), ["10:00", "10:15", "15:00", "15:15"]);
  assertEquals(ctx.traza.huecosOfrecidos.length, 4);
});

prueba("buscar_horarios busca desde hoy si le piden un día que pasó, y rechaza rangos inválidos", async ({ ctx, agenda }) => {
  const r = await buscar(ctx, "2030-05-20", JUEVES, "invitado");
  esOk(r);
  assertEquals(agenda.pedidos[0].desde, LUNES);
  assertMatch(String(r.datos.aviso), /desde hoy/);
  assertMatch(String(r.datos.nota), /turno_urgente_sin_hueco/);
  esRechazo(await buscar(ctx, JUEVES, MARTES, "invitado"), "rango_invertido");
  esRechazo(await buscar(ctx, LUNES, "2030-07-03", "invitado"), "rango_muy_largo");
  esRechazo(await buscar(ctx, LUNES, JUEVES, "casamiento" as never), "argumentos_invalidos");
});

prueba("ver_turnos_cliente devuelve los que vienen y no los cancelados ni los que pasaron", async ({ ctx, sql, clienteId }) => {
  await crearTurno(sql, { clienteId, inicio: local(SABADO, "10:00"), probador: 1 });
  await crearTurno(sql, { clienteId, inicio: local(JUEVES, "11:00"), probador: 2, estado: "cancelado" });
  await crearTurno(sql, { clienteId, inicio: new Date(AHORA.getTime() - 86400000), probador: 3, estado: "devolvio" });
  const r = await ejecutarHerramienta("ver_turnos_cliente", {}, ctx);
  esOk(r);
  const turnos = r.datos.turnos as { dia: string; hora: string; estado: string }[];
  assertEquals(turnos.map((t) => [t.dia, t.hora, t.estado]), [["sábado 8 de junio", "10:00", "sin-confirmar"]]);
});
