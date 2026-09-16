// confirmacion_doble (formato) — hallazgo de Mateo probando en vivo con el worker real (H2.1,
// 15/9): al agendar o reprogramar, el cliente recibía DOS confirmaciones — la que escribe el
// modelo en su propio texto ("¡Listo, Lucas! Te reservé...") y la que arma agendar_turno /
// reprogramar_turno en código (fecha, hora, dirección, mapa y condiciones, AGENTE.md § 4), que
// sale aparte, en un mensaje propio. La de código ya alcanza (y es la que Mateo puede editar de
// verdad); la del modelo es puro texto redundante, no una falla de contenido que valga la pena
// "rehacer" — se descarta apenas agendar_turno o reprogramar_turno salió bien en este turno. El
// prompt ya decía "no la repitas ni la reescribas" (regla 9): no alcanzaba, mismo patrón que
// accesorio_sin_herramienta y presentacion_repetida con un modelo económico — hace falta la
// guarda en código.
//
// Hallazgo de Mateo, 16/9: descartaba el texto ENTERO, no solo la frase repetida. Si el cliente
// preguntó otra cosa en el mismo mensaje, esa respuesta se perdía con la confirmación. Se
// arregló recortando por ORACIÓN (como presentacion_repetida) — pero logica encontró el
// siguiente escalón, 16/9 más tarde: cuando la confirmación y lo agregado comparten UNA sola
// oración, unidas con "y", "; ", " pero " o " aparte " (que es como se escribe normalmente, sin
// poner un punto en el medio), la oración entera se seguía descartando. "Te confirmo el turno
// del martes a las 13 y te cuento que también alquilamos chalecos y moños" perdía el aviso de
// los chalecos. Ahora se corta más fino: cada oración se parte en cláusulas por esos separadores,
// se prueba cada cláusula por separado, y se reconstruye la oración con las que sobreviven (con
// mayúscula si la que arranca ahora no era la que arrancaba antes).

import { llamoA } from "../traza.ts";
import { contieneFrase, normalizar, oraciones, rearmar, type Oracion } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

const HERRAMIENTAS_CON_CONFIRMACION_PROPIA = ["agendar_turno", "reprogramar_turno", "confirmar_turno"];

// "Te reservé/agendé/reprogramé/confirmé el turno...", "Tu turno quedó agendado...": mismo
// vocabulario que usa la confirmación de código (AGENTE.md § 4), así que si el modelo escribe
// algo parecido justo en el turno en que ya se armó una, es la misma frase, no información nueva.
function esConfirmacionDeReserva(clausula: string): boolean {
  const n = normalizar(clausula);
  return contieneFrase(n, "turno") && /\b(agend|reserv|confirm|anot|qued|reprogram)/.test(n);
}

// Un saludo corto pegado justo antes de la confirmación ("¡Listo, Lucas!", "¡Perfecto!") es
// parte de ella, no contenido propio — se saca junto, nunca solo (si no hay una confirmación
// justo después, no se toca: podría ser el arranque de otra cosa).
function esSaludoDeApertura(clausula: string): boolean {
  const n = normalizar(clausula).replace(/^[¡!¿?\s]+/, "");
  return n.length <= 40 && /^(listo|perfecto|genial|excelente|dale)\b/.test(n);
}

const SEPARADOR_CLAUSULA = /(;\s*| y | pero | aparte )/;

type Clausula = { oracionIdx: number; texto: string; separadorPrevio: string };

function partirEnClausulas(os: readonly Oracion[]): Clausula[] {
  const clausulas: Clausula[] = [];
  os.forEach((o, oi) => {
    const trozos = o.texto.split(SEPARADOR_CLAUSULA);
    for (let i = 0; i < trozos.length; i += 2) {
      clausulas.push({ oracionIdx: oi, texto: trozos[i], separadorPrevio: i > 0 ? trozos[i - 1] : "" });
    }
  });
  return clausulas;
}

function capitalizarPrimera(s: string): string {
  return s.length ? s.charAt(0).toLocaleUpperCase("es") + s.slice(1) : s;
}

export const confirmacionDoble: Barandilla = {
  nombre: "confirmacion_doble",
  etapa: "formato",
  accion: "cortar",
  evaluar({ texto, traza }) {
    if (!texto) return NO_SALTA;
    const cual = HERRAMIENTAS_CON_CONFIRMACION_PROPIA.find((h) => llamoA(traza, h));
    if (!cual) return NO_SALTA;

    const os = oraciones(texto);
    const clausulas = partirEnClausulas(os);
    const esConfirmacion = clausulas.map((c) => esConfirmacionDeReserva(c.texto));
    const mantener = clausulas.map((c, i) => !esConfirmacion[i] && !(esSaludoDeApertura(c.texto) && esConfirmacion[i + 1] === true));
    if (mantener.every(Boolean)) return NO_SALTA;

    const cortadas = clausulas.filter((_, i) => !mantener[i]).map((c) => c.texto).join(" ");

    const nuevasOraciones: Oracion[] = [];
    for (let oi = 0; oi < os.length; oi++) {
      const indices = clausulas.map((c, i) => (c.oracionIdx === oi ? i : -1)).filter((i) => i !== -1);
      const partes: string[] = [];
      let esPrimera = true;
      for (const i of indices) {
        if (!mantener[i]) continue;
        partes.push(esPrimera ? clausulas[i].texto : clausulas[i].separadorPrevio + clausulas[i].texto);
        esPrimera = false;
      }
      let reconstruida = partes.join("").trim();
      if (reconstruida && !mantener[indices[0]]) reconstruida = capitalizarPrimera(reconstruida);
      if (reconstruida) nuevasOraciones.push({ parrafo: os[oi].parrafo, texto: reconstruida });
    }

    return {
      salta: true,
      accion: "cortar",
      motivo: `${cual} ya armó su propia confirmación en código: se recorta la frase repetida del modelo («${cortadas}») y se deja el resto`,
      texto: rearmar(nuevasOraciones),
    };
  },
};
