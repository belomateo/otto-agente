// Arreglos de la revisión del 8/10 (charlas desde la actualización del 7/10). Cada uno con el caso
// real que lo disparó y el caso parecido que NO tiene que cambiar.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { aplicarBarandillas } from "../../supabase/functions/_shared/barandillas/index.ts";
import { montos, precioSinHerramienta } from "../../supabase/functions/_shared/barandillas/precio_sin_herramienta.ts";
import { sinRelleno } from "../../supabase/functions/_shared/barandillas/sin_relleno.ts";
import { ventaSinResolver } from "../../supabase/functions/_shared/barandillas/venta_sin_resolver.ts";
import { horasNombradas, ofertasEn } from "../../supabase/functions/_shared/herramientas/eleccion.ts";
import { esSoloCierreOAsentimiento } from "../../supabase/functions/_shared/turno/cierre_cortes.ts";
import { entrada, traza } from "./_ayuda.ts";

const conPrecios = (texto: string, precios: number[]) => {
  const e = entrada(texto);
  e.traza.preciosDevueltos.push(...precios);
  e.traza.llamadas.push({ herramienta: "consultar_accesorios", argumentos: {}, ok: true });
  return e;
};

// Suma: la primera vez se rehace; si el segundo intento vuelve a sumar, el total se saca en código
// y el mensaje sale, sin derivar.
const segundoIntento = (texto: string, precios: number[]) => ({ ...conPrecios(texto, precios), saltosPrevios: 1 });

Deno.test("un total armado con precios respaldados se rehace una vez y, si vuelve, se saca sin derivar («serían 240»)", async () => {
  const texto = "El traje es *a partir de $150.000*; camisa y corbata, $33.500; zapato con cinturón, $55.000. Serían $238.500 en total.";
  const primero = await precioSinHerramienta.evaluar(conPrecios(texto, [150000, 33500, 55000]));
  assertEquals(primero.salta && primero.accion, "rehacer");
  assertMatch((primero.salta && primero.motivo) || "", /ni se confirma la cuenta/);
  const r = await precioSinHerramienta.evaluar(segundoIntento(texto, [150000, 33500, 55000]));
  assert(r.salta);
  assertEquals(r.salta && r.accion, "cortar");
  const queda = (r.salta && r.texto) || "";
  assertMatch(queda, /\$55\.000/);
  assert(!queda.includes("238.500"), queda);
  // Y por el camino completo: sale, sin derivar.
  const todo = await aplicarBarandillas(conPrecios(texto, [150000, 33500, 55000]), { saltosPrevios: 1 });
  assertEquals(todo.decision, "enviar");
});

Deno.test("al sacar el total no quedan frases truncas (repetición de la charla, 8/10)", async () => {
  const precios = [150000, 33500, 55000];
  // Sin precios antes del total: se va la oración entera (quedaba «…de referencia, el total.»).
  const r1 = await precioSinHerramienta.evaluar(segundoIntento(
    "Sí: tomando esos valores de referencia, el total sería $238.500.\n\nEl alquiler incluye sastrería y tintorería.",
    precios,
  ));
  assertEquals(r1.salta && r1.texto, "El alquiler incluye sastrería y tintorería.");
  // Con los precios antes, pero arrancando con «Sí»: confirma la cuenta del cliente, se va entera.
  const r2 = await precioSinHerramienta.evaluar(segundoIntento(
    "Sí, tomando los valores desde, el traje a partir de $150.000, el zapato con cinturón $55.000 y camisa con corbata " +
      "$33.500, el total de referencia sería $238.500.\n\nEs un alquiler a medida, con sastrería y tintorería incluidas.",
    precios,
  ));
  assertEquals(r2.salta && r2.texto, "Es un alquiler a medida, con sastrería y tintorería incluidas.");
  // El total agregado al final de los precios: quedan los precios.
  const r3 = await precioSinHerramienta.evaluar(segundoIntento(
    "El traje sale $150.000 y los zapatos con cinturón $55.000, en total $205.000.",
    precios,
  ));
  assertEquals(r3.salta && r3.texto, "El traje sale $150.000 y los zapatos con cinturón $55.000.");
});

Deno.test("si la oración del total también trae un precio válido, se saca solo la parte del total", async () => {
  const texto = "El alquiler es a partir de $150.000 por traje, o sea $300.000 los dos. Te mando el catálogo.";
  const r = await precioSinHerramienta.evaluar(segundoIntento(texto, [150000]));
  assertEquals(r.salta && r.accion, "cortar");
  const queda = (r.salta && r.texto) || "";
  assertMatch(queda, /\$150\.000 por traje\./);
  assert(!queda.includes("300.000"), queda);
});

Deno.test("un monto que no es suma de nada sigue rehaciéndose (caso parecido)", async () => {
  const r = await precioSinHerramienta.evaluar(conPrecios("Ese modelo sale $199.000.", [150000, 33500, 55000]));
  assertEquals(r.salta && r.accion, "rehacer");
});

Deno.test("si el total es todo el mensaje: se rehace, y si vuelve, recién ahí deriva (caso parecido)", async () => {
  const precios = [150000, 33500, 55000];
  assertEquals((await aplicarBarandillas(conPrecios("Serían $238.500 en total.", precios))).decision, "rehacer");
  const r = await aplicarBarandillas(conPrecios("Serían $238.500 en total.", precios), { saltosPrevios: 1 });
  assertEquals(r.decision, "derivar");
  assertEquals(r.motivoDerivacion, "barandilla_doble");
});

Deno.test("una lista de turnos con la fecha «Sábado 10/10» no es un precio de $10 (8/10)", async () => {
  const t = "Perfecto. Tengo estos turnos disponibles:\nSábado 10/10 a las 11:45\nSábado 10/10 a las 12:30\n¿Cuál preferís?";
  assertEquals(montos(t), []);
  assertEquals((await precioSinHerramienta.evaluar(entrada(t))).salta, false);
  // Caso parecido: un precio suelto al lado de la fecha sigue saltando.
  assertEquals((await precioSinHerramienta.evaluar(entrada("El sábado 10/10 te sale 90."))).salta, true);
});

Deno.test("un link anunciado que no se mandó se corta; si se mandó, queda (8/10)", async () => {
  const t = "Para comprar, podés ver los modelos en nuestra tienda online. Te paso el catálogo de venta:";
  const r = await sinRelleno.evaluar(entrada(t));
  assertEquals(r.salta && r.accion, "cortar");
  assertEquals(r.salta && r.texto, "Para comprar, podés ver los modelos en nuestra tienda online.");
  // Casos parecidos: con enviar_link en el turno el link sale aparte; ofrecerlo no es anunciarlo.
  assertEquals((await sinRelleno.evaluar(entrada(t, { traza: traza({ herramientas: ["enviar_link"] }) }))).salta, false);
  assertEquals((await sinRelleno.evaluar(entrada("Si querés, te paso el catálogo online."))).salta, false);
});

Deno.test("talles de saco en número no son precios («hasta el 68», «el 62 entra»)", async () => {
  for (const t of ["En número de saco llegamos hasta el 68.", "Sí, el 62 entra: el talle justo se confirma en la prueba.", "Te puede ir un 56."]) {
    assertEquals((await precioSinHerramienta.evaluar(entrada(t))).salta, false, t);
  }
  assertEquals((await precioSinHerramienta.evaluar(entrada("Sale el 60 mil."))).salta, true);
});

Deno.test("venta_sin_resolver no obliga a repetir el link de venta si ya le llegó antes en la charla", async () => {
  const e = { ...entrada("Los trajes para compra arrancan desde $540.000."), intencion: "venta" };
  assertEquals((await ventaSinResolver.evaluar(e)).salta, true); // sin link en ningún lado: salta
  e.traza.linksPrevios = ["web-venta"];
  assertEquals((await ventaSinResolver.evaluar(e)).salta, false);
});

Deno.test("despedida o asentimiento: solo si el mensaje entero lo es", () => {
  for (const t of ["A listo", "Dale", "Ok gracias x la info. Saludos", "Muchas gracias!!", "Buenísimo, gracias Lucía"]) {
    assertEquals(esSoloCierreOAsentimiento(t), true, t);
  }
  for (const t of ["Dale, el martes a las 15", "Gracias, ¿cuánto sale?", "Ok el viernes", "Listo, mi mail es a@b.com", ""]) {
    assertEquals(esSoloCierreOAsentimiento(t), false, t);
  }
});

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
Deno.test("horasNombradas entiende cómo escriben los clientes la hora (casos reales del 8/10)", () => {
  const casos: [string, string][] = [
    ["Para estar en rosario.13.15 13.30", "13:15"],
    ["1530", "15:30"],
    ["15.15", "15:15"],
    ["El lunes 12 a las 13 hs.", "13:00"],
    ["Te puedo pedir el que me habías dicho antes por favor? 10.45", "10:45"],
    ["a las 3 está bien", "15:00"],
    ["mejor 3 y media", "15:30"],
  ];
  for (const [t, h] of casos) assert(horasNombradas(t).map(hm).includes(h), `${t} → ${horasNombradas(t).map(hm)}`);
  for (const t of ["Ah perdón, el lunes 12 me dijiste por la mañana, pero es feriado, trabajan igual?", "Llegaron a instalar una maquina en el galpón", "somos las 2 personas", "el 2026 fue duro"]) {
    assertEquals(horasNombradas(t), [], t);
  }
});

Deno.test("ofertasEn lee cada hora con su día, en el orden en que Lucía las ofreció (8/10)", () => {
  const ver = (t: string) => ofertasEn(t).map((o) => `${o.dia ?? "-"} ${o.numero ?? "-"} ${hm(o.minutos)}`);
  assertEquals(ver("Por la tarde tengo el lunes 12 a las 14:00 o el martes 13 a las 13:00. Cuál te queda mejor?"), ["lunes 12 14:00", "martes 13 13:00"]);
  assertEquals(ver("Tengo el jueves 6 a las 11:00 o a las 17:00. ¿Cuál preferís?"), ["jueves 6 11:00", "jueves 6 17:00"]);
  assertEquals(ver("Tengo estos turnos: Sábado 10/10 a las 11:45 y Sábado 10/10 a las 12:30."), ["sabado 10 11:45", "sabado 10 12:30"]);
  assertEquals(ver("Tengo a las 17:00, ¿te lo reservo?"), ["- - 17:00"]);
});
