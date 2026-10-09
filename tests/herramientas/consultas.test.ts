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
  fila,
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
  // El horario del local sale de la tabla (decisión #7). Desde el 5/10 (Mateo: abre de corrido)
  // las franjas de turnos ya no van: Lucía las recitaba como si el local cortara al mediodía.
  assertEquals(h.datos.horario_del_local, "Lunes a viernes, de 10:00 a 19:00. Sábados, de 9:30 a 18:30. Domingos, cerrado.");
  assertEquals(h.datos.horario_de_turnos, undefined);
  assertMatch(String(h.datos.nota_horarios), /de corrido/);
  assertMatch(String(h.datos.nota_horarios), /buscar_horarios/);
  for (const hora of ["10:00", "19:00", "09:30", "18:30"]) assert(ctx.traza.horasDevueltas.includes(hora));
  for (const hora of ["14:00", "15:00"]) assert(!ctx.traza.horasDevueltas.includes(hora), `${hora} es de una franja de turnos, no del local`);
});

prueba("buscar_informacion sin resultados lo dice y no inventa", async ({ ctx, sql }) => {
  await soloEstosFragmentos(sql, [{ tema: "talles", titulo: "Talles", texto: "Tenemos talles desde el chico hasta el grande." }]);
  const r = await ejecutarHerramienta("buscar_informacion", { seccion: null, consulta: "estacionamiento" }, ctx);
  esOk(r);
  assertEquals(r.datos.fragmentos, []);
  assertMatch(String(r.datos.nota), /dato_no_encontrado/);
});

// Pedido de Mateo, 5/10: Lucía no asesora sobre modelos. consultar_catalogo da el precio y qué
// incluye; nombres, colores, talles y fotos se ven en el catálogo online.
prueba("consultar_catalogo da el precio y qué incluye, sin modelos, colores ni talles (5/10)", async ({ ctx, sql }) => {
  await soloEstosModelos(sql);
  await soloEstosFragmentos(sql, [{ tema: "que-incluye", titulo: "Qué incluye el precio", texto: "El precio incluye sastrería y tintorería." }]);
  await crearModelo(sql, { modelo: "Clásico", precio: 111, colores: ["Azul marino"], talles: ["48", "50"] });
  await crearModelo(sql, { modelo: "Noche", precio: 111, colores: ["Negro"], talles: ["52"], fotos: ["n.jpg"] });

  const r = await ejecutarHerramienta("consultar_catalogo", { modelo: null }, ctx);
  esOk(r);
  // Mateo, 5/10: siempre "a partir de", aunque todos los cargados salgan lo mismo.
  assertEquals(r.datos.precio_desde, 111);
  assertEquals(r.datos.precio, undefined);
  assertMatch(String(r.datos.nota_precios), /a partir de/);
  assertEquals(r.datos.que_incluye, "El precio incluye sastrería y tintorería.");
  for (const clave of ["modelos", "colores", "talles"]) assertEquals(r.datos[clave], undefined, `no devuelve ${clave}`);
  assert(!JSON.stringify(r.datos).includes("Clásico"), "no nombra los modelos");
  assertMatch(String(r.datos.nota), /catálogo online/);
  assertMatch(String(r.datos.nota), /talle y de la fecha/);
  assertEquals([...new Set(ctx.traza.preciosDevueltos)], [111]);

  // Color y talle ya no son parámetros: eran filtros para recomendar.
  esRechazo(await ejecutarHerramienta("consultar_catalogo", { modelo: null, color: "azul" }, ctx), "argumentos_invalidos");
});

prueba("consultar_catalogo con precios distintos según el modelo da el más bajo, como «a partir de» (5/10)", async ({ ctx, sql }) => {
  await soloEstosModelos(sql);
  await soloEstosFragmentos(sql, [{ tema: "que-incluye", titulo: "Qué incluye el precio", texto: "El precio incluye sastrería y tintorería." }]);
  await crearModelo(sql, { modelo: "Clásico", precio: 111 });
  await crearModelo(sql, { modelo: "Noche", precio: 222 });
  const r = await ejecutarHerramienta("consultar_catalogo", { modelo: null }, ctx);
  esOk(r);
  assertEquals([r.datos.precio, r.datos.precio_desde, r.datos.precio_hasta], [undefined, 111, undefined]);
  assertMatch(String(r.datos.nota_precios), /a partir de/);
  assertEquals([...new Set(ctx.traza.preciosDevueltos)].sort((a, b) => a - b), [111, 222]);
});

prueba("consultar_catalogo: un modelo con precio_base en 0 no tiene precio, y no entra en la traza", async ({ ctx, sql }) => {
  // El 0 no es un precio: es "todavía no lo cargaron". La columna es not null con check >= 0, así
  // que 0 es lo que queda cuando se activa un modelo sin ponerle precio. Antes se devolvía tal
  // cual y Lucía le decía "$0" a un cliente — pasó en el red-team del 24/9 con los cinco modelos
  // reales activos en 0. Si esta afirmación se cae, volvió ese bug.
  await soloEstosModelos(sql);
  await soloEstosFragmentos(sql, [{ tema: "que-incluye", titulo: "Qué incluye el precio", texto: "El precio incluye sastrería y tintorería." }]);
  await crearModelo(sql, { modelo: "Sin precio", precio: 0, colores: ["Negro"], talles: ["50"] });
  await crearModelo(sql, { modelo: "Con precio", precio: 333, colores: ["Gris"], talles: ["50"] });

  const r = await ejecutarHerramienta("consultar_catalogo", { modelo: null }, ctx);
  esOk(r);
  assertEquals(r.datos.precio_desde, 333);
  assertEquals(ctx.traza.preciosDevueltos.includes(0), false);

  // Si el único que coincide no tiene precio: la nota le dice que no invente ni diga que sale cero.
  const sinPrecio = await ejecutarHerramienta("consultar_catalogo", { modelo: "sin precio" }, ctx);
  esOk(sinPrecio);
  assertEquals(sinPrecio.datos.precio_desde, undefined);
  assertMatch(String(sinPrecio.datos.nota_precios), /NO des ningún precio/);
  assertEquals([...new Set(ctx.traza.preciosDevueltos)], [333]);
});

prueba("consultar_catalogo: el precio de un modelo puntual, y si no está cargado no lo niega (16/9 y 5/10)", async ({ ctx, sql }) => {
  await soloEstosModelos(sql);
  await soloEstosFragmentos(sql, [{ tema: "que-incluye", titulo: "Qué incluye el precio", texto: "El precio incluye sastrería y tintorería." }]);
  await crearModelo(sql, { modelo: "Clásico azul marino", precio: 111, colores: ["Azul marino"], talles: ["48"] });
  await crearModelo(sql, { modelo: "Slim gris oxford", precio: 222, colores: ["Gris"], talles: ["50"] });

  const puntual = await ejecutarHerramienta("consultar_catalogo", { modelo: "slim" }, ctx);
  esOk(puntual);
  assertEquals(puntual.datos.precio_desde, 222);
  assertEquals(puntual.datos.nota_modelo, undefined);

  // Un modelo que no está cargado con ese nombre: desde cuánto arranca el alquiler, sin negarlo ni
  // cambiarlo por otro.
  const sinCoincidencia = await ejecutarHerramienta("consultar_catalogo", { modelo: "esmoquin" }, ctx);
  esOk(sinCoincidencia);
  assertEquals(sinCoincidencia.datos.precio_desde, 111);
  assertMatch(String(sinCoincidencia.datos.nota_modelo), /no digas que no lo tenemos/);
  assertMatch(String(sinCoincidencia.datos.nota_modelo), /catálogo online/);
});

prueba("consultar_catalogo y buscar_informacion anotan en la traza los accesorios que nombran sus textos (25/9)", async ({ ctx, sql }) => {
  // Es lo que lee accesorio_sin_herramienta para dejar que Lucía repita «la camisa y los zapatos
  // se alquilan aparte» sin frenarla: lo dijo la casa, en este turno.
  await soloEstosModelos(sql);
  await soloEstosFragmentos(sql, [
    { tema: "que-incluye", titulo: "Qué incluye el precio", texto: "Incluye sastrería. La camisa y los zapatos se alquilan aparte." },
    { tema: "accesorios", titulo: "Completar el look", texto: "También hay cinturones." },
  ]);
  await crearModelo(sql, { modelo: "Clásico", precio: 111, colores: ["Azul"], talles: ["48"] });
  esOk(await ejecutarHerramienta("consultar_catalogo", { modelo: null }, ctx));
  assertEquals([...ctx.traza.accesoriosDevueltos].sort(), ["camisa", "zapato"]);

  esOk(await ejecutarHerramienta("buscar_informacion", { seccion: "accesorios", consulta: "cinturon" }, ctx));
  assert(ctx.traza.accesoriosDevueltos.includes("cinturon"), "el fragmento nombraba cinturones");
  assertEquals(ctx.traza.accesoriosDevueltos.includes("corbata"), false, "la corbata no la nombró ningún texto");
});

prueba("consultar_catalogo sin qué incluye cargado no da precios", async ({ ctx, sql }) => {
  await soloEstosFragmentos(sql, []);
  esRechazo(await ejecutarHerramienta("consultar_catalogo", { modelo: null }, ctx), "falta_que_incluye");
  assertEquals(ctx.traza.preciosDevueltos, []);
});

prueba("consultar_catalogo con accesorios=true devuelve alquiler y compra desde la tabla y las condiciones (era consultar_accesorios, 9/10)", async ({ ctx, sql }) => {
  await sql.query("update accesorios_alquiler set activo = false where activo");
  await sql.query("insert into accesorios_alquiler (nombre, precio, precio_compra) values ('Camisa de prueba', 10, 8), ('Zapato de prueba', 20, null)");
  await soloEstosFragmentos(sql, [{ tema: "accesorios", titulo: "Accesorios", texto: "También se pueden comprar con descuento." }]);
  const r = await ejecutarHerramienta("consultar_catalogo", { modelo: null, accesorios: true }, ctx);
  esOk(r);
  assertEquals(r.datos.accesorios, [
    { nombre: "Camisa de prueba", precio_alquiler: 10, precio_compra: 8 },
    { nombre: "Zapato de prueba", precio_alquiler: 20, precio_compra: null },
  ]);
  assertEquals(r.datos.condiciones_accesorios, "También se pueden comprar con descuento.");
  assert([8, 10, 20].every((p) => ctx.traza.preciosDevueltos.includes(p)), "los precios de los accesorios quedan en la traza");
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

prueba("buscar_horarios busca desde hoy si le piden un día que pasó, y rechaza rangos inválidos", async ({ ctx, sql, agenda }) => {
  // Sin reserva de urgencia: con reserva y sin fecha de evento, el vacío pide la fecha del evento
  // en vez de derivar (reserva_urgencia.test.ts); acá se prueba el vacío de siempre.
  await sql.query("update configuracion_agenda set dias_reserva_urgencia = null");
  const r = await buscar(ctx, "2030-05-20", JUEVES, "invitado");
  esOk(r);
  assertEquals(agenda.pedidos[0].desde, LUNES);
  assertMatch(String(r.datos.aviso), /desde hoy/);
  assertMatch(String(r.datos.nota), /dato_no_encontrado/);
  esRechazo(await buscar(ctx, JUEVES, MARTES, "invitado"), "rango_invertido");
  // Más de dos semanas ya no se rechaza: se recorta a dos semanas y se avisa (4/10).
  const largo = await buscar(ctx, LUNES, "2030-07-03", "invitado");
  esOk(largo);
  assertMatch(String(largo.datos.aviso), /se buscó hasta 2030-06-16/);
  esRechazo(await buscar(ctx, LUNES, JUEVES, "casamiento" as never), "argumentos_invalidos");
});

prueba("buscar_horarios no pide mail antes de reservar aunque falte en la ficha", async ({ ctx, agenda }) => {
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  const r = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(r);
  assertEquals(r.datos.pedir_mail, undefined);
});

prueba("buscar_horarios no pide el mail si ya lo tenemos, ni si no hay huecos", async ({ ctx, sql, clienteId, agenda }) => {
  await sql.query("update clientes set email = $2 where id = $1", [clienteId, "juan@gmail.com"]);
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  const conMail = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(conMail);
  assertEquals(conMail.datos.pedir_mail, undefined);

  await sql.query("update clientes set email = null where id = $1", [clienteId]);
  agenda.lista = [];
  const sinHuecos = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(sinHuecos);
  assertEquals(sinHuecos.datos.pedir_mail, undefined);
});

prueba("buscar_horarios no vuelve a pedir el mail en esta charla, ni en el mismo turno ni en uno después (hallazgo de logica, 16/9)", async ({ ctx, sql, conversacionId, agenda }) => {
  // En vivo, Lucía volvió a pedir el mail justo cuando el cliente estaba confirmando, y como
  // nunca llegó a agendar_turno, el cliente se quedó sin turno (supuesto #35 violado). Antes
  // dependía solo de que el prompt no insistiera leyendo el historial; ahora queda marcado en
  // código, para que ni el prompt más flojo pueda insistir.
  agenda.lista = [hueco(JUEVES, "11:00", 45)];
  const primera = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(primera);
  assertEquals(primera.datos.pedir_mail, undefined);

  // Segunda llamada en el MISMO turno (como hace el prompt, justo antes de agendar_turno):
  // ya no lo vuelve a pedir, aunque el mail siga sin estar en la ficha.
  const segunda = await buscar(ctx, JUEVES, JUEVES, "invitado");
  esOk(segunda);
  assertEquals(segunda.datos.pedir_mail, undefined);

  const eventos = await fila(
    sql,
    "select detalle->>'etapa' as etapa from eventos_agente where conversacion_id = $1 and detalle->>'etapa' = 'pedir_mail'",
    [conversacionId],
  );
  assertEquals(eventos, undefined, "no se marca un pedido de correo antes de reservar");
});

