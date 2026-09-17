// El calendario de los turnos es el propio (decisión #13 de Mateo, 15/9): la fila en `turnos`
// es el turno, y el panel lo muestra en la pestaña Turnos y con el cartel de 30 minutos antes
// (1.16 y 1.17). No hay un calendario de afuera que sincronizar, así que crear, mover y
// cancelar no hacen nada más y el turno nunca queda con `aviso`. Google Calendar (1.12) quedó
// en pausa: si vuelve, es otra implementación de esta misma interfaz y el worker la cambia.
import type { Calendario } from "../herramientas/tipos.ts";

export const calendarioPropio: Calendario = {
  crear() {
    return Promise.resolve({ eventoId: null });
  },
  mover(eventoId) {
    return Promise.resolve({ eventoId });
  },
  cancelar() {
    return Promise.resolve();
  },
};
