import { normalizar } from "../texto.ts";
import { type Barandilla, NO_SALTA } from "../tipos.ts";
// "No hacemos envíos" ya no cuenta como negativa (caso real del 4/10): no es falta de stock sino
// una política confirmada — está en el prompt («No hay envíos») y en que-no-hacemos. Con la frase
// en la lista, toda pregunta por envíos terminaba derivada aunque Lucía contestara lo correcto
// (una madre con el hijo en Reconquista; después preguntó "¿hacen envíos?" y nadie le contestó).
export const disponibilidadNegada: Barandilla = {
  nombre: "disponibilidad_negada", etapa: "reglas", accion: "rehacer",
  evaluar({ texto }) {
    const n = normalizar(texto);
    const negativa = /\bno\s+(?:tenemos(?!\s+que\b)|contamos con|disponemos de|manejamos|trabajamos|ofrecemos|alquilamos|vendemos)\b/.test(n) ||
      /\bno\s+quedan\s+(?:talles?|trajes?|turnos?|horarios?|zapatos?|camisas?|modelos?|lugares?|opciones?)\b/.test(n) ||
      /\b(?:sin stock|agotad[oa]s?|no (?:esta|estan) disponibles?)\b/.test(n) ||
      /\bno hay\s+(?:disponibilidad|stock|lugar|lugares|turnos|horarios|talles|trajes|modelos|zapatos|camisas|para ninos|para nenes)\b/.test(n);
    return negativa ? { salta: true, accion: "rehacer", motivo: "No afirmes que no tenés ni que no hay: no se confirma disponibilidad por acá. Si preguntan por un modelo, color o estilo, mandá el catálogo online (enviar_link, tipo web) y decile que la disponibilidad depende del talle y de la fecha, y se confirma en el turno con el asesor. Si es un turno que no encontró, buscá de nuevo sin la restricción o decile que le buscás otra fecha." } : NO_SALTA;
  },
};
