// El contexto con que corren las herramientas en un turno de verdad (AGENTE.md § 3, paso 6).
// Lo arman acá el turno de Lucía (el worker, en Fase 2) y el emulador probar-agente (H1.7),
// así los dos usan exactamente lo mismo.
//
// La agenda es la real: agendaDesdeBase de logica (H1.13, _shared/agenda/huecos.ts), que lee de
// la base las franjas, las duraciones, el escalonado, la reserva de urgencia y los turnos
// tomados. Las pruebas de herramientas no pasan por acá: siguen usando AgendaDoble.
//
// Google Calendar se elige afuera: el emulador pasa calendarioDeEnsayo (no toca nada) y el
// worker, el de logica (H1.12). No tiene valor por defecto a propósito.

import { agendaDesdeBase } from "../agenda/huecos.ts";
import type { Db } from "../db.ts";
import type { Calendario, ContextoHerramienta } from "../herramientas/tipos.ts";
import { type Traza, trazaNueva } from "../traza.ts";

export function contextoDeHerramientas(p: {
  db: Db;
  tz: string;
  cliente: { id: string; telefono: string };
  conversacionId: string;
  ahora: Date;
  calendario: Calendario;
  derivacionTel?: string | null;
  traza?: Traza;
}): ContextoHerramienta {
  return {
    db: p.db,
    cliente: p.cliente,
    conversacionId: p.conversacionId,
    ahora: p.ahora,
    tz: p.tz,
    traza: p.traza ?? trazaNueva(),
    agenda: agendaDesdeBase(p.db, p.tz),
    calendario: p.calendario,
    derivacionTel: p.derivacionTel ?? null,
  };
}
