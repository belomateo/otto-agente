// Agenda mock (H1.2). Valores de docs/ficha-del-negocio.md § Agenda: lunes a
// viernes 10 a 19, sábado 9:30 a 18:30, corte 14 a 15 para los tres probadores
// (decisión #3 de Mateo, 12/9), escalonado de 15'. En Fase 2 salen de horarios
// y de la tabla de configuración de agenda que crea paneles (decisión #6).

export type HorarioDia = { dia: string; abierto: boolean; desde: string; hasta: string };
export type Duracion = { tipo: string; minutos: number };

export type ConfigAgenda = {
  dias: HorarioDia[];
  corte: { desde: string; hasta: string };
  probadores: number;
  escalonado: number;
  duraciones: Duracion[];
};

const SEMANA = (dia: string): HorarioDia => ({ dia, abierto: true, desde: '10:00', hasta: '19:00' });

export const AGENDA: ConfigAgenda = {
  dias: [
    SEMANA('Lunes'),
    SEMANA('Martes'),
    SEMANA('Miércoles'),
    SEMANA('Jueves'),
    SEMANA('Viernes'),
    { dia: 'Sábado', abierto: true, desde: '9:30', hasta: '18:30' },
    { dia: 'Domingo', abierto: false, desde: '', hasta: '' },
  ],
  corte: { desde: '14:00', hasta: '15:00' },
  probadores: 3,
  escalonado: 15,
  duraciones: [
    { tipo: 'Graduado', minutos: 45 },
    { tipo: 'Novio', minutos: 45 },
    { tipo: 'Invitado', minutos: 45 },
    { tipo: 'Doble (mismo probador)', minutos: 90 },
    { tipo: 'Triple', minutos: 120 },
    { tipo: 'Prueba final', minutos: 15 },
  ],
};
