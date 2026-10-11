// Ayudas de las pruebas del analista de charlas (0102, 10/10): charlas armadas a mano y una base en
// memoria que cumple el mismo contrato que base.ts. Nada de red ni de base real.

import type { CharlaDelDia, EventoCharla, MensajeCharla } from "../../supabase/functions/analista/pedido.ts";
import { type Consumo, puedeTomarse, type Repositorio, type Revision, TOPES } from "../../supabase/functions/analista/noche.ts";
import type { Hallazgo } from "../../supabase/functions/analista/respuesta.ts";

export const TZ = "America/Argentina/Cordoba";
export const FECHA = "2026-10-09"; // viernes
/** Un instante del 9/10 en hora de Argentina. */
export const a = (hm: string, ymd = FECHA) => new Date(`${ymd}T${hm}:00-03:00`);

let n = 0;
export function mensaje(direccion: "entrante" | "saliente", contenido: string | null, hm: string, extra: Partial<MensajeCharla> = {}): MensajeCharla {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    at: a(hm),
    direccion,
    tipo: "texto",
    contenido,
    transcripcion: null,
    noEnviado: null,
    ...extra,
  };
}
export const cliente = (t: string | null, hm: string, extra: Partial<MensajeCharla> = {}) => mensaje("entrante", t, hm, extra);
export const lucia = (t: string | null, hm: string, extra: Partial<MensajeCharla> = {}) => mensaje("saliente", t, hm, extra);
export const evento = (tipo: string, detalle: Record<string, unknown>, hm: string): EventoCharla => ({ at: a(hm), tipo, detalle });

export function charla(id: string, delDia: MensajeCharla[], extra: Partial<CharlaDelDia> = {}): CharlaDelDia {
  return {
    conversacionId: id,
    cliente: "Colo",
    estado: "activa",
    luciaActiva: true,
    libreta: { nombre: "Colo", evento: "casamiento", fecha_evento: "2026-11-20" },
    antes: [],
    delDia,
    eventos: [],
    turnos: [],
    ...extra,
  };
}

/** Una charla corta y común: precio, fecha, turno. */
export function charlaTipica(id: string): CharlaDelDia {
  return charla(id, [
    cliente("Hola! Queria averiguar por precio para alquiler de ambo para un casamiento", "11:34"),
    lucia("Hola, Colo. El alquiler del ambo es *a partir de $150.000*.", "11:34"),
    lucia("Incluye saco y pantalón, ajustes de sastrería y tintorería. ¿Para qué fecha es el casamiento?", "11:34"),
    cliente("20/11", "11:35"),
    lucia("Perfecto, Colo. ¿Querés que te busque un turno en el local?", "11:35"),
  ]);
}

/** Base en memoria con el contrato de base.ts: tomar() usa la misma regla (puedeTomarse). */
export class RepoEnMemoria implements Repositorio {
  revisiones = new Map<string, Revision>();
  guardados: { id: string; hallazgos: Hallazgo[]; consumo: Consumo }[] = [];
  fallos: { id: string; detalle: string; consumo: Consumo | null }[] = [];
  salteadas: { id: string; detalle: string }[] = [];
  referenciaLeida = 0;
  fallarGuardar = new Set<string>();

  constructor(public charlas: CharlaDelDia[], public reloj: () => number = () => Date.now()) {}

  candidatas() {
    return Promise.resolve(this.charlas.map((c) => c.conversacionId));
  }
  prepararNoche() {
    return Promise.resolve([...this.revisiones.values()].map((r) => ({ ...r })));
  }
  tomar(_fecha: string, id: string): Promise<number | null> {
    const r = this.revisiones.get(id);
    if (!r) {
      this.revisiones.set(id, { conversacionId: id, estado: "analizando", intentos: 1, costoUsd: 0, tomadaAt: new Date(this.reloj()) });
      return Promise.resolve(1);
    }
    if (!puedeTomarse(r, this.reloj(), TOPES)) return Promise.resolve(null);
    r.estado = "analizando";
    r.intentos++;
    r.tomadaAt = new Date(this.reloj());
    return Promise.resolve(r.intentos);
  }
  cargarCharla(_fecha: string, id: string) {
    const c = this.charlas.find((x) => x.conversacionId === id);
    return c ? Promise.resolve(c) : Promise.reject(new Error("la charla no existe"));
  }
  datosDeReferencia() {
    this.referenciaLeida++;
    return Promise.resolve({
      fragmentos: [{ tema: "que-incluye", titulo: "Qué incluye", texto: "Saco y pantalón, sastrería y tintorería." }],
      catalogo: [{ modelo: "Ambo Liso", precio: 150000 }],
      accesorios: [],
      calendario: "- viernes 9/10 (el día de las charlas): abre de 10:00 a 19:00",
    });
  }
  guardar(_fecha: string, id: string, hallazgos: Hallazgo[], consumo: Consumo) {
    if (this.fallarGuardar.has(id)) return Promise.reject(new Error("se cayó la base"));
    this.guardados.push({ id, hallazgos, consumo });
    const r = this.revisiones.get(id)!;
    r.estado = "analizada";
    r.costoUsd += consumo.costoUsd;
    return Promise.resolve();
  }
  fallo(_fecha: string, id: string, detalle: string, consumo: Consumo | null) {
    this.fallos.push({ id, detalle, consumo });
    const r = this.revisiones.get(id)!;
    r.estado = "fallo";
    r.costoUsd += consumo?.costoUsd ?? 0;
    return Promise.resolve();
  }
  saltear(_fecha: string, ids: string[], detalle: string) {
    for (const id of ids) {
      if (this.revisiones.has(id)) continue;
      this.revisiones.set(id, { conversacionId: id, estado: "salteada", intentos: 0, costoUsd: 0, tomadaAt: new Date(this.reloj()) });
      this.salteadas.push({ id, detalle });
    }
    return Promise.resolve();
  }
}

/** La respuesta del modelo, ya como JSON. */
export const respuestaJson = (r: { errores?: unknown[]; mejoras?: unknown[] }) => JSON.stringify({ errores: r.errores ?? [], mejoras: r.mejoras ?? [] });

/** Uso de tokens que con gpt-6.1-sol cuesta exactamente `usd` dólares (solo salida, US$ 10 por millón). */
export const usoQueCuesta = (usd: number) => ({ tokensIn: 0, tokensOut: Math.round(usd * 100_000), tokensCacheados: 0 });
