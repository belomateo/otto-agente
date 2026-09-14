// Derivaciones mock de Atención humana (H1.2). El motivo es el enum de
// `derivaciones` (PROCESOS.md § 4) y lo que se ve es su etiqueta. Agustín se gradúa
// hoy: desde la decisión #8 (14/9) eso es `evento_inminente` y no
// `turno_urgente_sin_hueco`, porque para un evento de hoy o mañana Lucía no busca
// huecos, deriva. Reemplaza a `derivas` de lib/mock-data.ts, que sigue con el motivo
// viejo. En Fase 2 sale de `derivaciones` (paneles).

export type MotivoDerivacion =
  | 'reclamo'
  | 'prenda_danada'
  | 'corporativo'
  | 'turno_urgente_sin_hueco'
  | 'evento_inminente'
  | 'descuento'
  | 'dato_no_encontrado'
  | 'pide_persona'
  | 'barandilla_doble'
  | 'sin_respuesta'
  | 'timeout';

export const ETIQUETA_MOTIVO: Record<MotivoDerivacion, string> = {
  reclamo: 'Reclamo',
  prenda_danada: 'Prenda dañada',
  corporativo: 'Corporativo',
  turno_urgente_sin_hueco: 'Turno urgente',
  evento_inminente: 'Evento hoy o mañana',
  descuento: 'Descuento',
  dato_no_encontrado: 'Dato no encontrado',
  pide_persona: 'Pidió una persona',
  barandilla_doble: 'Rehecho dos veces',
  sin_respuesta: 'Lucía no respondió',
  timeout: 'Lucía tardó demasiado',
};

// Chip del motivo: Ladrillo lo que no puede esperar, Noche lo corporativo, neutro el resto.
const URGENTES: MotivoDerivacion[] = ['reclamo', 'prenda_danada', 'turno_urgente_sin_hueco', 'evento_inminente'];

export function coloresMotivo(motivo: MotivoDerivacion): { bg: string; fg: string } {
  if (URGENTES.includes(motivo)) return { bg: '#F6E3DF', fg: '#A6473A' };
  if (motivo === 'corporativo') return { bg: '#EEF1F5', fg: '#1F2A3C' };
  return { bg: '#EFEDE8', fg: '#5C6068' };
}

export type Derivacion = { cliente: string; hace: string; motivo: MotivoDerivacion; resumen: string };

export const DERIVACIONES: Derivacion[] = [
  {
    cliente: 'Agustín Ferreyra',
    hace: 'hace 12 min',
    motivo: 'evento_inminente',
    resumen: 'Se gradúa hoy y necesita un traje para esta noche. Como el evento es hoy, Lucía lo pasó sin ofrecer turnos. Talle aprox. 48.',
  },
  {
    cliente: 'Litoral Seguros',
    hace: 'hace 2 h',
    motivo: 'corporativo',
    resumen: 'Empresa de Rosario consulta por uniformes para 18 personas, evento de fin de año. Piden presupuesto y prueba grupal.',
  },
];
