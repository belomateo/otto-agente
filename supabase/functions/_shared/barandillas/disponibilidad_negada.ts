import { normalizar } from "./texto.ts";
import { type Barandilla, NO_SALTA } from "./tipos.ts";
// "No hacemos envíos" ya no cuenta como negativa (caso real del 4/10): no es falta de stock sino
// una política confirmada — está en el prompt («No hay envíos») y en que-no-hacemos. Con la frase
// en la lista, toda pregunta por envíos terminaba derivada aunque Lucía contestara lo correcto
// (una madre con el hijo en Reconquista; después preguntó "¿hacen envíos?" y nadie le contestó).
export const disponibilidadNegada: Barandilla = {
  nombre: "disponibilidad_negada", etapa: "reglas", accion: "ejecutar_derivacion",
  evaluar({ texto }) {
    const n = normalizar(texto);
    const negativa = /\bno\s+(?:tenemos(?!\s+que\b)|contamos con|disponemos de|manejamos|trabajamos|ofrecemos|alquilamos|vendemos|quedan)\b/.test(n) ||
      /\b(?:sin stock|agotad[oa]s?|no (?:esta|estan) disponibles?)\b/.test(n) ||
      /\bno hay\s+(?:disponibilidad|stock|lugar|lugares|turnos|horarios|talles|trajes|modelos|zapatos|camisas|para ninos|para nenes)\b/.test(n);
    return negativa ? { salta: true, accion: "ejecutar_derivacion", motivo: "No enviar una negativa comercial: el equipo debe confirmar disponibilidad.", texto: "Le paso tu consulta al equipo del local para que te lo confirme." } : NO_SALTA;
  },
};
