// presentacion_repetida (formato) — hallazgo M2 del tester (informe 15/9,
// docs/informes/1-tester-agente.md): ante una pregunta que la pone a la defensiva ("quién sos",
// un intento de inyección), Lucía a veces vuelve a abrir con la presentación completa aunque no
// sea el primer mensaje de la charla (prompt.md: "EL PRIMER MENSAJE DE CADA CHARLA... ahí, y
// solo ahí, te presentás"). Es de prompt, probabilístico — un modelo económico puede volver a
// fallarlo, y no siempre con las mismas palabras: probado en vivo, una vez repitió la apertura
// tal cual ("soy Lucía, asistente de Mr Otto"), otra vez la parafraseó ("soy Lucía, asesora de
// alquiler de Otto Su Misura") — buscar solo la frase textual completa se quedaba corto. Así que,
// como con accesorio_sin_herramienta, se ataja también en código: si de las primeras oraciones
// alguna trae "soy Lucía" + "Otto" juntos (cualquiera de las dos formas del nombre lo tiene, y no
// hay otro motivo real para que las dos palabras aparezcan juntas salvo una autopresentación) y
// esta NO es la primera vez que habla en esta charla, se corta todo hasta ahí —incluido un
// "¡Hola!" suelto antes, si lo hay— y sale el resto tal cual, igual que sin_relleno corta un
// cierre de relleno.

import { contieneFrase, normalizar, oraciones, rearmar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";

// "¡Hola!" + "Soy Lucía, asistente de Mr Otto." + la pregunta de cierre: como mucho 3 oraciones
// de apertura real. Más allá de eso, "Otto" es del resto del mensaje, no de una presentación.
const VENTANA = 3;

function esLaAutopresentacion(oracion: string): boolean {
  const n = normalizar(oracion);
  return contieneFrase(n, "soy lucia") && contieneFrase(n, "otto");
}

export const presentacionRepetida: Barandilla = {
  nombre: "presentacion_repetida",
  etapa: "formato",
  accion: "cortar",
  evaluar({ texto, esPrimerMensaje }) {
    if (esPrimerMensaje) return NO_SALTA;
    const os = oraciones(texto);
    let hastaIndice = -1;
    for (let i = 0; i < Math.min(os.length, VENTANA); i++) {
      if (esLaAutopresentacion(os[i].texto)) {
        hastaIndice = i;
        break;
      }
    }
    if (hastaIndice === -1) return NO_SALTA;
    const cortadas = os.slice(0, hastaIndice + 1).map((o) => o.texto);
    return {
      salta: true,
      accion: "cortar",
      motivo: `repite la presentación («${cortadas.join(" ")}») en un mensaje que no es el primero de la charla: se cortó`,
      texto: rearmar(os.slice(hastaIndice + 1)),
    };
  },
};
