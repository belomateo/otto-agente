// fuera_ventana_meta (reglas) — regla de Meta: pasadas 24 hs desde el último mensaje del
// cliente, no se puede mandar texto libre, solo una plantilla aprobada (STACK.md § 5). Se
// bloquea en código; el que decide qué plantilla va es el turno o el cron.

import { type Barandilla, NO_SALTA } from "./tipos.ts";

const VENTANA_DE_META_MS = 24 * 60 * 60 * 1000;

export const fueraVentanaMeta: Barandilla = {
  nombre: "fuera_ventana_meta",
  etapa: "reglas",
  accion: "bloquear",
  evaluar({ ahora, ultimoMensajeClienteAt }) {
    if (ultimoMensajeClienteAt && ahora.getTime() - ultimoMensajeClienteAt.getTime() <= VENTANA_DE_META_MS) return NO_SALTA;
    return {
      salta: true,
      accion: "bloquear",
      motivo: ultimoMensajeClienteAt
        ? "pasaron más de 24 hs desde el último mensaje del cliente: solo se puede mandar una plantilla aprobada"
        : "el cliente todavía no escribió: solo se puede mandar una plantilla aprobada",
    };
  },
};
