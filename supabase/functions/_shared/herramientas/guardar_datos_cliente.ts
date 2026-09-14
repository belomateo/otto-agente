// guardar_datos_cliente({...}) — la ficha del cliente (AGENTE.md § 4 y § 7). Toca el mundo.
// Solo los campos de la ficha que dice el cliente; los de código (turno, recordatorio,
// confirmado) no están en el schema. Las notas libres van por anotar. Los enums se validan
// contra el schema, que es el mismo de los checks de clientes (logica 0023).

import { DIA_O_NOCHE, EVENTOS, ROLES_CLIENTE } from "../enums.ts";
import { fechaLocal } from "../tiempo.ts";
import { actualizarFicha, CAMPOS_FICHA, type Ficha } from "./ficha.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

export const guardarDatosCliente: Herramienta<Ficha> = {
  nombre: "guardar_datos_cliente",
  tipo: "accion",
  descripcion: "Guarda en la ficha del cliente lo que te dijo, en el mismo turno en que te lo dice: nombre, " +
    "evento, fecha del evento, si es novio, invitado, graduado o padre, si es de día o de noche, talle " +
    "aproximado, ciudad, color preferido y lo que dijo del presupuesto. Mandá solo lo que dijo; lo demás, null. " +
    "Nunca lo que suponés.",
  parametros: objeto({
    nombre: { type: ["string", "null"], maxLength: 80, description: "Nombre, como lo dijo." },
    evento: { type: ["string", "null"], enum: [...EVENTOS, null], description: "Para qué evento es." },
    fecha_evento: { type: ["string", "null"], format: "date", description: "Fecha del evento, AAAA-MM-DD." },
    rol: { type: ["string", "null"], enum: [...ROLES_CLIENTE, null], description: "Quién es en el evento." },
    dia_o_noche: { type: ["string", "null"], enum: [...DIA_O_NOCHE, null], description: "Si el evento es de día o de noche." },
    talle_aprox: { type: ["string", "null"], maxLength: 20, description: "Talle aproximado, como lo dijo." },
    ciudad: { type: ["string", "null"], maxLength: 60, description: "De dónde es." },
    color_preferido: { type: ["string", "null"], maxLength: 40, description: "Color que prefiere." },
    presupuesto_mencionado: { type: ["string", "null"], maxLength: 80, description: "Lo que dijo del presupuesto, con sus palabras." },
  }),
  async ejecutar(args, ctx) {
    if (!CAMPOS_FICHA.some((c) => limpio(args[c]))) {
      return rechazo("sin_datos", "No mandaste ningún dato para guardar.");
    }
    if (args.fecha_evento && args.fecha_evento < fechaLocal(ctx.ahora, ctx.tz)) {
      return rechazo("fecha_evento_pasada", `La fecha del evento (${args.fecha_evento}) ya pasó. Confirmala con el cliente antes de guardarla.`);
    }
    const escritos = await actualizarFicha(ctx.db, ctx.cliente.id, args);
    return { ok: true, datos: { guardado: escritos, nota: escritos.length ? "Guardado." : "Ya estaba así en la ficha." } };
  },
};
