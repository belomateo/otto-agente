// confirmar_turno(turno_id) — decisión de Mateo (16/9): se saca el botón "Confirmo" de la
// plantilla del recordatorio. El turno se confirma cuando Lucía ENTIENDE que el cliente confirma
// —venga como venga: "sí", "dale", "ahí voy a estar", respondiendo al recordatorio con cualquier
// frase que lo diga— no cuando toca un botón exacto. AGENTE.md § 4.
//
// Reusa turno_confirmar_por_boton (0021, logica): la misma función que resolvía el botón, ahora
// también la llama esta herramienta — mismas precondiciones (turno de este cliente, no vencido,
// sin-confirmar o ya confirmado) y la misma marca confirmado_por = 'cliente'. El nombre de la
// función sigue diciendo "por_boton" por ahora (no se tocó: atender.ts, de logica, todavía la
// llama desde el camino del botón que Mateo va a sacar); vale la pena renombrarla el día que ese
// camino ya no exista, pero no es de acá.
//
// El texto que recibe el cliente es el fijo de contexto_agente (texto_turno_confirmado, mismo
// que usaba el botón, supuesto #30), armado en código y aparte del texto del modelo — igual que
// agendar_turno y reprogramar_turno: confirmacion_doble recorta si el modelo repite la
// confirmación con sus propias palabras.

import { textoDeContexto } from "./derivacion.ts";
import { type Herramienta, objeto, rechazo } from "./tipos.ts";
import { leerTurno } from "./turnos.ts";

type Args = { turno_id: string };

const CLAVE_TEXTO_CONFIRMADO = "texto_turno_confirmado";

export const confirmarTurno: Herramienta<Args> = {
  nombre: "confirmar_turno",
  tipo: "accion",
  descripcion: "Confirmá el turno cuando el cliente te dice que sí, que confirma, que ahí va a estar, o cualquier " +
    "forma de decir que sigue en pie — aunque no use la palabra 'confirmar', y aunque sea respondiendo al " +
    "recordatorio que le llegó. No preguntes de más: si entendiste que confirma, ejecutá.",
  parametros: objeto({
    turno_id: { type: "string", format: "uuid", description: "El turno_id que figura en sus turnos." },
  }),
  async ejecutar(args, ctx) {
    const t = await leerTurno(ctx.db, args.turno_id.toLowerCase());
    if (!t) return rechazo("turno_inexistente", "Ese turno_id no existe. Usá el que figura en sus turnos del contexto.");
    if (t.clienteId !== ctx.cliente.id) {
      return rechazo(
        "turno_de_otro_cliente",
        "Ese turno no es de este cliente: solo se confirman los turnos de la persona con la que hablás.",
      );
    }
    const [f] = await ctx.db.consulta<{ r: string }>(
      "select turno_confirmar_por_boton($1::uuid, $2::uuid) as r",
      [t.id, ctx.conversacionId],
    );
    const resultado = f?.r;
    if (resultado !== "confirmado" && resultado !== "ya_estaba") {
      return rechazo(
        "turno_no_confirmable",
        "Ese turno ya no se puede confirmar (venció, o no está sin confirmar ni confirmado). Si necesita otro, buscá horarios.",
      );
    }
    const texto = await textoDeContexto(ctx.db, CLAVE_TEXTO_CONFIRMADO);
    return {
      ok: true,
      datos: {
        turno_id: t.id,
        nota: resultado === "ya_estaba" ? "Ya estaba confirmado; igual sale el mensaje de siempre." : "Confirmado.",
      },
      efectos: { mensajesAlCliente: texto ? [texto] : [] },
    };
  },
};
