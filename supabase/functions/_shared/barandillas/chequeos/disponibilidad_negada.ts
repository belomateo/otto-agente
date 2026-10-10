import { normalizar, oraciones } from "../texto.ts";
import { type Barandilla, NO_SALTA } from "../tipos.ts";
// "No hacemos envíos" ya no cuenta como negativa (caso real del 4/10): no es falta de stock sino
// una política confirmada — está en el prompt («No hay envíos») y en que-no-hacemos. Con la frase
// en la lista, toda pregunta por envíos terminaba derivada aunque Lucía contestara lo correcto
// (una madre con el hijo en Reconquista; después preguntó "¿hacen envíos?" y nadie le contestó).
const NEGATIVAS = [
  /\bno\s+(?:tenemos(?!\s+que\b)|contamos con|disponemos de|manejamos|trabajamos|ofrecemos|alquilamos|vendemos)\b/,
  /\bno\s+quedan\s+(?:talles?|trajes?|turnos?|horarios?|zapatos?|camisas?|modelos?|lugares?|opciones?)\b/,
  /\b(?:sin stock|agotad[oa]s?|no (?:esta|estan) disponibles?)\b/,
  /\bno hay\s+(?:disponibilidad|stock|lugar|lugares|turnos|horarios|talles|trajes|modelos|zapatos|camisas|para ninos|para nenes)\b/,
];
// Un día cerrado tampoco es falta de disponibilidad (revisión del trabajo 1, 9/10): «el lunes 12 es
// feriado y no hay turnos», «los domingos no trabajamos» son la verdad, y el prompt le pide decirlo
// y ofrecer otro día. Antes se frenaban y, al segundo freno, terminaban en la disculpa con Lucía
// apagada. Se mira oración por oración: la que habla del día cerrado no cuenta, las demás sí.
const DIA_CERRADO = /\b(?:cerrad[oa]s?|feriados?|domingos?|cierre)\b/;

export const disponibilidadNegada: Barandilla = {
  nombre: "disponibilidad_negada", etapa: "reglas", accion: "rehacer",
  evaluar({ texto }) {
    const negativa = oraciones(texto).some(({ texto: o }) => {
      const n = normalizar(o);
      return !DIA_CERRADO.test(n) && NEGATIVAS.some((r) => r.test(n));
    });
    return negativa ? { salta: true, accion: "rehacer", motivo: "No afirmes que no tenés ni que no hay: no se confirma disponibilidad por acá. Si preguntan por un modelo, color o estilo, mandá el catálogo online (enviar_link, tipo web) y decile que la disponibilidad depende del talle y de la fecha, y se confirma en el turno con el asesor. Si es un turno que no encontró, buscá de nuevo sin la restricción o decile que le buscás otra fecha." } : NO_SALTA;
  },
};
