// «Cuando piden información en general, que no les mande todo junto: que salga el mensaje de cómo funciona el
// alquiler» (pedido de Mateo, 15/10; el texto es el que ya mandaba Sofía a mano).
//
// Si el PRIMER mensaje de una charla es un pedido de información general («quisiera más información sobre
// alquiler de trajes») o pregunta cómo es el procedimiento («¿cómo funciona el alquiler?»), Lucía contesta con un
// saludo corto y, aparte, el texto de siempre con los tres pasos. Sale en código, sin pasar por el modelo, así no
// cambia una palabra ni un emoji. El texto se edita en el panel (contexto_agente.texto_como_funciona); si la fila
// está vacía o no existe, vale el respaldo de acá.
//
// Lo que no es información general sigue como siempre, directo: una pregunta puntual (precio, dirección, horario,
// turno, venta, talle, color) o alguien que ya cuenta su evento o su fecha.

import { normalizar } from "../barandillas/texto.ts";

export const CLAVE_TEXTO_COMO_FUNCIONA = "texto_como_funciona";

export const TEXTO_COMO_FUNCIONA_RESPALDO = `😊 Te contamos cómo funciona el alquiler en OTTO:

1️⃣ Reservás tu turno para venir a probarte los trajes.

2️⃣ Elegís tu look con el asesoramiento de nuestro equipo. Realizamos los ajustes de sastrería necesarios para que te quede impecable.

3️⃣ Prueba final y retiro: retirás el traje listo para usar el día anterior al evento y lo devolvés el día hábil siguiente.

✨ Te recomendamos venir entre 7 y 60 días antes del evento para elegir con tranquilidad.

Para qué fecha necesitás el traje? Así podemos coordinar tu turno. 🤵‍♂️`;

// «Hola, Walter! Soy Lucía, del equipo de Mr Otto.» Sin el nombre si no hay uno que sirva (solo emojis, un punto).
export function saludoDeLucia(nombre: string | null): string {
  const n = (nombre ?? "").trim();
  const sirve = /\p{L}{2,}/u.test(n) && n.length <= 40;
  return sirve ? `Hola, ${n}! Soy Lucía, del equipo de Mr Otto.` : "Hola! Soy Lucía, del equipo de Mr Otto.";
}

const PIDE_INFORMACION = /\b(?:informacion|info|informes?)\b/;
const PREGUNTA_EL_PROCEDIMIENTO = new RegExp(
  [
    "como (?:es|son|funciona|funcionan|se hace|hago|hacemos|puedo|podemos|se alquila|se alquilan|alquilo|alquilamos)\\b[^?.!]{0,40}\\b(?:alquil\\w*|procedimiento|proceso|tramite|funciona\\w*|reserv\\w*)",
    "como es (?:el|la) (?:alquiler|procedimiento|proceso|tramite)",
    "cual es (?:el|la) (?:procedimiento|proceso|tramite|forma)",
    "(?:procedimiento|proceso|pasos|requisitos) (?:para|de|del) (?:alquil\\w*|el alquiler|reserv\\w*)",
    "que (?:hay|tengo|tenemos|hace falta) que hacer para alquil\\w*",
    "como (?:trabajan|trabajamos|laburan|es la modalidad|es el servicio)",
  ].join("|"),
);

// Si nombra algo puntual, no es «información en general»: se contesta eso, directo.
const ALGO_PUNTUAL = new RegExp(
  [
    "cuant\\w*|precio\\w*|sale\\b|salen\\b|cuesta\\w*|costo\\w*|valor\\w*|\\$|presupuesto",
    "direccion|donde (?:estan|queda|quedan|es)|ubicacion|como llego|horario\\w*|abren|cierran|hasta que hora|atienden",
    "turno\\w*|agend\\w*|reserv\\w*|cita\\b|disponibilidad|disponible\\w*|hoy|manana|sabado|domingo|lunes|martes|miercoles|jueves|viernes",
    "comprar|compra|venta|vender|vend\\w+|usado\\w*",
    "talle\\w*|color\\w*|modelo\\w*|accesorio\\w*|zapato\\w*|camisa\\w*|corbata\\w*|chaleco\\w*|cinturon|mono|descuento\\w*|garantia|devol\\w+",
    "\\d{1,2}\\s*(?:/|-)\\s*\\d{1,2}",
    "\\d{1,2}\\s+de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)",
    "(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)",
  ].join("|"),
);

const MAXIMO_DE_PALABRAS = 22;

export function pideInformacionGeneral(mensaje: string): boolean {
  const n = normalizar(mensaje).replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (n.split(" ").length > MAXIMO_DE_PALABRAS) return false; // un mensaje largo cuenta algo: se contesta eso
  if (ALGO_PUNTUAL.test(n)) return false;
  return PIDE_INFORMACION.test(n) || PREGUNTA_EL_PROCEDIMIENTO.test(n);
}
