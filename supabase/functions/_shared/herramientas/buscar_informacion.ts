// buscar_informacion(seccion, consulta) — la base de conocimiento (AGENTE.md § 4 y § 8).
// Consulta: no toca el mundo. Si la sección es ubicacion-horarios, o sale un fragmento de esa
// sección, suma dos horarios leídos de las tablas y no de un fragmento (decisión #7): el del
// local (horarios) y el de los turnos de alquiler (franjas_turnos). Los horarios concretos de
// un turno salen siempre de buscar_horarios.

import { buscarFragmentos } from "../conocimiento/busqueda.ts";
import { SECCIONES, type Seccion } from "../enums.ts";
import { describirHorarios, leerFranjas, leerHorarioDelLocal } from "./horario_laboral.ts";
import { type Herramienta, objeto } from "./tipos.ts";

type Args = { seccion: Seccion | null; consulta: string };

export const buscarInformacion: Herramienta<Args> = {
  nombre: "buscar_informacion",
  tipo: "consulta",
  descripcion: "Busca en la base de conocimiento de la casa. Obligatoria antes de afirmar cualquier política, " +
    "horario, condición o qué incluye el alquiler. seccion: el tema, de la lista de tu índice; si ninguno " +
    "pega, null y se busca en todos. consulta: uno o dos sustantivos del tema (por ejemplo \"zapatos noche\"), " +
    "nunca la frase entera del cliente. Devuelve hasta tres fragmentos. Si no devuelve ninguno, eso no está " +
    "cargado: no lo supongas.",
  parametros: objeto({
    seccion: {
      type: ["string", "null"],
      enum: [...SECCIONES, null],
      description: "Tema de la base de conocimiento, o null para buscar en todos.",
    },
    consulta: { type: "string", minLength: 1, maxLength: 80, description: "Uno o dos sustantivos del tema." },
  }),
  async ejecutar(args, ctx) {
    const { encontrados } = await buscarFragmentos(ctx.db, {
      seccion: args.seccion,
      consulta: args.consulta,
      limite: 3,
    });
    const datos: Record<string, unknown> = {
      fragmentos: encontrados.map(({ tema, titulo, texto }) => ({ tema, titulo, texto })),
    };
    if (args.seccion === "ubicacion-horarios" || encontrados.some((f) => f.tema === "ubicacion-horarios")) {
      const local = await leerHorarioDelLocal(ctx.db);
      const { franjas } = await leerFranjas(ctx.db);
      const h = describirHorarios(local, franjas);
      datos.horario_del_local = h.local;
      datos.horario_de_turnos = h.turnos;
      datos.nota_horarios = "El local abre más horas que las de turnos. Para un turno, los horarios concretos salen siempre de buscar_horarios.";
      ctx.traza.horasDevueltas.push(...h.horas);
    }
    if (encontrados.length === 0) {
      datos.nota = "No hay nada cargado sobre eso. No lo supongas: si el cliente lo necesita, derivá con motivo dato_no_encontrado.";
    }
    return { ok: true, datos };
  },
};
