// «Es un 15 de mi hija» no es el día 15 (Darien, 17/10): el cliente dijo «marzo 2027» y «es un 15 de mi hija»
// (la fiesta de quince), Lucía no tenía el día, tomó ese «15» y puso fecha_evento = 2027-03-15 en buscar_horarios y
// agendar_turno; la ficha quedó con un día que nadie dijo. Una fecha del día 15 solo vale si el cliente no habló de
// una fiesta de 15 o si dijo ese día con todas las letras («15 de marzo», «15/3», «el 15»).

import { normalizar } from "../barandillas/texto.ts";
import type { ContextoHerramienta } from "./tipos.ts";

const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const FIESTA_DE_15 = new RegExp(
  "\\b(?:(?:es|para|por|con|seria|sera|tengo|hago|hacemos|festejamos)\\s+un\\s+(?:15|quince)\\b" +
    "|(?:15|quince)\\s+de\\s+(?:mi|mis|su|sus|la|el|una|un|nuestra|nuestro)\\b" +
    "|(?:cumple|fiesta|festejo|cumpleanos)\\s+de\\s+(?:15|quince)\\b" +
    "|(?:los|mis|sus)\\s+(?:15|quince)\\b" +
    "|quinceaner\\w*|quince\\s+anos)",
);
const DIA_15_DICHO = new RegExp(
  `\\b15\\s*(?:de|del)?\\s*(?:${MESES})\\b|\\b15\\s*[/.\\-]\\s*(?:0?\\d|1[0-2])\\b|\\b(?:el|dia)\\s+15\\b(?!\\s+de\\s+(?:mi|mis|su|sus|la|el|una|un))`,
);

// ¿Esta fecha tiene el día 15 sacado de «un 15» (la fiesta) y no de un día que el cliente dijo?
export function quinceNoEsUnDia(fecha: string | null | undefined, textoDelCliente: string): boolean {
  if (!fecha || fecha.slice(8, 10) !== "15") return false;
  const n = normalizar(textoDelCliente);
  return FIESTA_DE_15.test(n) && !DIA_15_DICHO.test(n);
}

// Para las herramientas que reciben fecha_evento del modelo: si es un día 15 que viene de «un 15», no se usa
// (queda null y la charla sigue sin fecha: Lucía le pregunta el día). Solo lee la charla si la fecha cae un 15.
export async function fechaEventoCreible(ctx: ContextoHerramienta, fecha: string | null | undefined): Promise<string | null> {
  if (!fecha) return null;
  if (fecha.slice(8, 10) !== "15") return fecha;
  const [f] = await ctx.db.consulta<{ texto: string | null }>(
    `select string_agg(concat_ws(' ', contenido, transcripcion), ' ' order by enviado_at) as texto
       from mensajes where conversacion_id = $1::uuid and direccion = 'entrante'`,
    [ctx.conversacionId],
  );
  return quinceNoEsUnDia(fecha, f?.texto ?? "") ? null : fecha;
}
