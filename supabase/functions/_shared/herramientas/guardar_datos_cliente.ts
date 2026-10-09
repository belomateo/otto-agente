// guardar_datos_cliente({...}) — la ficha del cliente (AGENTE.md § 4 y § 7). Toca el mundo.
// Solo los campos de la ficha que dice el cliente; los de código (turno, recordatorio,
// confirmado) no están en el schema. Los enums se validan contra el schema, que es el mismo de los
// checks de clientes (logica 0023).
//
// Desde el 9/10 (pedido de Mateo: menos herramientas) también la nota libre de la libreta, que era
// la herramienta anotar (26 usos en 30 días): `nota` va a la tabla notas con autor 'lucia', al lado
// de las que escribe el equipo.

import { AUTOR_LUCIA, DIA_O_NOCHE, ESTADOS_TURNO_ACTIVO, EVENTOS, ROLES_CLIENTE } from "../enums.ts";
import { fechaLocal, horaLocal } from "../tiempo.ts";
import { resumenTurno } from "./confirmacion.ts";
import { actualizarFicha, CAMPOS_FICHA, formatoDeEmailValido, leerFicha, type Ficha } from "./ficha.ts";
import { type Herramienta, limpio, objeto, rechazo } from "./tipos.ts";

type Args = Ficha & { nota: string | null };

export const guardarDatosCliente: Herramienta<Args> = {
  nombre: "guardar_datos_cliente",
  tipo: "accion",
  descripcion: "Guarda en la ficha del cliente lo que te dijo, en el mismo turno en que te lo dice: nombre, " +
    "evento, fecha del evento, si es novio, invitado, graduado o padre, si es de día o de noche, talle " +
    "aproximado, ciudad, color preferido, lo que dijo del presupuesto y su mail. Mandá solo lo que dijo; lo " +
    "demás, null. Nunca lo que suponés. En `nota`, algo que conviene recordar y no entra en la ficha (una " +
    "preferencia, una duda, algo que contó del evento). Si ya reservó y ahora da nombre o correo, usá esta " +
    "herramienta: actualiza el cliente vinculado a la misma reserva y manda su resumen actualizado. No crees " +
    "otro turno ni repitas la lista o la pregunta que manda el sistema.",
  parametros: objeto({
    nombre: { type: ["string", "null"], maxLength: 80, description: "Nombre, como lo dijo." },
    evento: { type: ["string", "null"], enum: [...EVENTOS, null], description: "Para qué evento es." },
    fecha_evento: { type: ["string", "null"], format: "date", description: "Fecha del evento, AAAA-MM-DD." },
    // Revisión del 4/10: "es para mi novio" (la pareja, que se gradúa) quedó como novio, y a un
    // invitado de un casamiento de noche le guardó novio sin que lo dijera.
    rol: {
      type: ["string", "null"],
      enum: [...ROLES_CLIENTE, null],
      description: "Quién se viste, solo si lo dijo. novio es el que se casa, no la pareja de quien escribe.",
    },
    dia_o_noche: { type: ["string", "null"], enum: [...DIA_O_NOCHE, null], description: "Si el evento es de día o de noche." },
    talle_aprox: { type: ["string", "null"], maxLength: 20, description: "Talle aproximado, como lo dijo." },
    ciudad: { type: ["string", "null"], maxLength: 60, description: "De dónde es." },
    color_preferido: { type: ["string", "null"], maxLength: 40, description: "Color que prefiere." },
    presupuesto_mencionado: { type: ["string", "null"], maxLength: 80, description: "Lo que dijo del presupuesto, con sus palabras." },
    email: { type: ["string", "null"], maxLength: 120, description: "Mail que dio, como lo escribió." },
    nota: {
      type: ["string", "null"],
      maxLength: 500,
      description: "Una nota corta para la libreta del cliente, con algo que no entra en la ficha. Si no hay, null.",
    },
  }),
  async ejecutar(args, ctx) {
    const nota = limpio(args.nota);
    if (!CAMPOS_FICHA.some((c) => limpio(args[c])) && !nota) {
      return rechazo("sin_datos", "No mandaste ningún dato para guardar.");
    }
    let notaId: string | null = null;
    if (nota) {
      const [f] = await ctx.db.consulta<{ id: string }>(
        "insert into notas (cliente_id, autor, texto) values ($1::uuid, $2, $3) returning id::text as id",
        [ctx.cliente.id, AUTOR_LUCIA, nota],
      );
      notaId = f ? String(f.id) : null;
    }
    if (!CAMPOS_FICHA.some((c) => limpio(args[c]))) {
      return { ok: true, datos: { nota_id: notaId, nota: "Anotado en la libreta." } };
    }
    if (args.fecha_evento && args.fecha_evento < fechaLocal(ctx.ahora, ctx.tz)) {
      return rechazo("fecha_evento_pasada", `La fecha del evento (${args.fecha_evento}) ya pasó. Confirmala con el cliente antes de guardarla.`);
    }
    if (limpio(args.email) && !formatoDeEmailValido(args.email as string)) {
      return rechazo("email_invalido", `"${args.email}" no tiene forma de mail. Confirmalo con el cliente antes de guardarlo.`);
    }
    const escritos = await actualizarFicha(ctx.db, ctx.cliente.id, args);
    if (escritos.includes("nombre") || escritos.includes("email")) {
      const [turno] = await ctx.db.consulta<{ id: string; inicio: string }>(
        `select id::text as id, inicio from turnos
         where cliente_id = $1 and estado = any($2::text[]) and fin > $3::timestamptz
         order by creado_at desc, inicio desc, id limit 1`,
        [ctx.cliente.id, [...ESTADOS_TURNO_ACTIVO], ctx.ahora.toISOString()],
      );
      if (turno) {
        const ficha = await leerFicha(ctx.db, ctx.cliente.id);
        const inicio = new Date(turno.inicio);
        ctx.traza.horasDevueltas.push(horaLocal(inicio, ctx.tz));
        ctx.traza.resumenTurnoEmitido = true;
        return {
          ok: true,
          datos: { guardado: escritos, turno_id: turno.id, nota: "Datos actualizados en la misma reserva. El resumen y la pregunta por datos faltantes salen solos; no los repitas ni agendes otro turno." },
          efectos: { resumenTurnoId: turno.id, mensajesAlCliente: [resumenTurno({ nombre: ficha.nombre, email: ficha.email, telefono: ctx.cliente.telefono, inicio, tz: ctx.tz, actualizado: true })] },
        };
      }
    }
    return { ok: true, datos: { guardado: escritos, nota: escritos.length ? "Guardado." : "Ya estaba así en la ficha." } };
  },
};
