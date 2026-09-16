// Las 14 herramientas de Lucía (AGENTE.md § 4), en el orden del índice del prompt.
//
// ejecutarHerramienta es la única puerta de entrada: valida los argumentos contra el schema
// en código, corre la herramienta, atrapa cualquier error sin mostrárselo al cliente y deja la
// llamada en la traza del turno. definicionesParaElModelo arma lo que se le pasa al modelo con
// lo que el dueño edita en Configuración › Herramientas (herramientas_agente, paneles 0013):
// si una está desactivada no se ofrece, y si tiene descripción, esa es la que lee el modelo.
// El schema y las precondiciones no se editan desde el panel.

import type { Db } from "../db.ts";
import { agendarTurno } from "./agendar_turno.ts";
import { anotar } from "./anotar.ts";
import { buscarHorarios } from "./buscar_horarios.ts";
import { buscarInformacion } from "./buscar_informacion.ts";
import { cancelarTurno } from "./cancelar_turno.ts";
import { confirmarTurno } from "./confirmar_turno.ts";
import { consultarAccesorios } from "./consultar_accesorios.ts";
import { consultarCatalogo } from "./consultar_catalogo.ts";
import { derivarAPersona } from "./derivar_a_persona.ts";
import { enviarFotos } from "./enviar_fotos.ts";
import { enviarLink } from "./enviar_link.ts";
import { guardarDatosCliente } from "./guardar_datos_cliente.ts";
import { reprogramarTurno } from "./reprogramar_turno.ts";
import type { ContextoHerramienta, EsquemaJson, Herramienta, Resultado } from "./tipos.ts";
import { rechazo } from "./tipos.ts";
import { completarNulos, validarContraEsquema } from "./validar.ts";
import { verTurnosCliente } from "./ver_turnos_cliente.ts";

export const HERRAMIENTAS: readonly Herramienta[] = [
  buscarInformacion,
  consultarCatalogo,
  consultarAccesorios,
  buscarHorarios,
  verTurnosCliente,
  agendarTurno,
  reprogramarTurno,
  cancelarTurno,
  confirmarTurno,
  guardarDatosCliente,
  anotar,
  enviarFotos,
  enviarLink,
  derivarAPersona,
] as readonly Herramienta[];

export function buscarHerramienta(nombre: string): Herramienta | null {
  return HERRAMIENTAS.find((h) => h.nombre === nombre) ?? null;
}

// Formato de function calling de OpenAI (Responses API) en modo estricto.
export type DefinicionParaModelo = {
  type: "function";
  name: string;
  description: string;
  parameters: EsquemaJson;
  strict: true;
};

function definicion(h: Herramienta, descripcion: string): DefinicionParaModelo {
  return { type: "function", name: h.nombre, description: descripcion, parameters: h.parametros, strict: true };
}

export function definicionesPorDefecto(): DefinicionParaModelo[] {
  return HERRAMIENTAS.map((h) => definicion(h, h.descripcion));
}

export async function definicionesParaElModelo(db: Db): Promise<DefinicionParaModelo[]> {
  const filas = await db.consulta("select nombre, activa, descripcion from herramientas_agente");
  const porNombre = new Map(filas.map((f) => [String(f.nombre), f]));
  return HERRAMIENTAS
    .filter((h) => porNombre.get(h.nombre)?.activa !== false)
    .map((h) => definicion(h, String(porNombre.get(h.nombre)?.descripcion ?? "").trim() || h.descripcion));
}

export async function ejecutarHerramienta(
  nombre: string,
  argumentos: unknown,
  ctx: ContextoHerramienta,
): Promise<Resultado> {
  let args = argumentos;
  if (typeof args === "string") {
    try {
      args = args.trim() === "" ? {} : JSON.parse(args);
    } catch {
      args = undefined;
    }
  }
  const h = buscarHerramienta(nombre);
  let resultado: Resultado;
  let error: string | undefined;
  if (!h) {
    resultado = rechazo("herramienta_desconocida", `No existe la herramienta ${nombre}.`);
  } else if (args === undefined || args === null || typeof args !== "object" || Array.isArray(args)) {
    resultado = rechazo("argumentos_invalidos", "Los argumentos tienen que ser un objeto JSON.");
  } else {
    const errores = validarContraEsquema(args, h.parametros);
    if (errores.length) {
      resultado = rechazo("argumentos_invalidos", `Revisá los parámetros: ${errores.join("; ")}.`);
    } else {
      try {
        resultado = await h.ejecutar(completarNulos(args, h.parametros), ctx);
      } catch (e) {
        error = String((e as Error)?.stack ?? e).slice(0, 2000);
        resultado = rechazo(
          "error_interno",
          "No se pudo completar. No le cuentes al cliente que hubo un error técnico: si no podés seguir sin esto, derivá.",
        );
      }
    }
  }
  ctx.traza.llamadas.push({
    herramienta: nombre,
    argumentos: args,
    ok: resultado.ok,
    ...(resultado.ok ? {} : { rechazo: resultado.rechazo }),
    ...(error ? { error } : {}),
  });
  return resultado;
}
