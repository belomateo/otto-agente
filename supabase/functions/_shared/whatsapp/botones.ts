// Las respuestas a los botones de las plantillas (hito 1.14). Cada botón sale con un payload
// propio por mensaje, "CLAVE:<id>", y el id dice a qué turno o charla se refiere. Solo la
// respuesta a un BOTÓN cuenta: si el cliente escribe "confirmo" a mano, eso no confirma nada
// en código; lo atiende Lucía (PROCESOS.md § 2).

export const PAYLOAD = {
  confirmar: "CONFIRMO",
  reprogramar: "REPROGRAMAR",
  recontactoSi: "RECONTACTO_SI",
  recontactoLuego: "RECONTACTO_LUEGO",
} as const;

export type BotonDeTurno = { accion: "confirmar" | "reprogramar"; turnoId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const payload = (clave: string, id: string) => `${clave}:${id}`;

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function botonDeTurno(crudo: unknown): BotonDeTurno | null {
  if (!esObj(crudo) || crudo.type !== "button" || !esObj(crudo.button)) return null;
  const valor = crudo.button.payload;
  if (typeof valor !== "string") return null;
  const corte = valor.indexOf(":");
  if (corte < 0) return null;
  const clave = valor.slice(0, corte);
  const id = valor.slice(corte + 1);
  if (!UUID.test(id)) return null;
  if (clave === PAYLOAD.confirmar) return { accion: "confirmar", turnoId: id };
  if (clave === PAYLOAD.reprogramar) return { accion: "reprogramar", turnoId: id };
  return null;
}
