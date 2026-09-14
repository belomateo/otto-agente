// Agenda mock (H1.2, con las decisiones #7 y #9 del 14/9). El horario del local
// (lunes a viernes 10 a 19, sábado 9:30 a 18:30, domingo cerrado) queda para la
// atención humana y los avisos fuera de horario. Los turnos van por franjas, cada
// una con su cantidad de probadores (notas de Otto España, 14/9): lunes a viernes de
// 13 a 19 con 3, sábado de 9:30 a 12 con 3 y de 13:30 a 18:30 con 2, domingo sin
// turnos. Reserva para urgencias: 7 días (supuesto #21). En Fase 2 salen de
// `horarios`, `franjas_turnos` y `configuracion_agenda`, que crea paneles.

export type Franja = { desde: string; hasta: string; probadores: number };

export type DiaAgenda = {
  dia: string;
  /** 0 = domingo, como `horarios` y `franjas_turnos`. */
  diaSemana: number;
  abierto: boolean;
  desde: string;
  hasta: string;
  franjas: Franja[];
};

export type Duracion = { tipo: string; minutos: number };

export type ConfigAgenda = {
  dias: DiaAgenda[];
  probadores: number;
  escalonado: number;
  /** Días que quedan para eventos cercanos; null = sin reserva. */
  reservaUrgencia: number | null;
  duraciones: Duracion[];
};

const SEMANA = (dia: string, diaSemana: number): DiaAgenda => ({
  dia,
  diaSemana,
  abierto: true,
  desde: '10:00',
  hasta: '19:00',
  franjas: [{ desde: '13:00', hasta: '19:00', probadores: 3 }],
});

export const AGENDA: ConfigAgenda = {
  dias: [
    SEMANA('Lunes', 1),
    SEMANA('Martes', 2),
    SEMANA('Miércoles', 3),
    SEMANA('Jueves', 4),
    SEMANA('Viernes', 5),
    {
      dia: 'Sábado',
      diaSemana: 6,
      abierto: true,
      desde: '9:30',
      hasta: '18:30',
      franjas: [
        { desde: '9:30', hasta: '12:00', probadores: 3 },
        { desde: '13:30', hasta: '18:30', probadores: 2 },
      ],
    },
    { dia: 'Domingo', diaSemana: 0, abierto: false, desde: '', hasta: '', franjas: [] },
  ],
  probadores: 3,
  escalonado: 15,
  reservaUrgencia: 7,
  duraciones: [
    { tipo: 'Graduado', minutos: 45 },
    { tipo: 'Novio', minutos: 45 },
    { tipo: 'Invitado', minutos: 45 },
    { tipo: 'Doble (mismo probador)', minutos: 90 },
    { tipo: 'Triple', minutos: 120 },
    { tipo: 'Prueba final', minutos: 15 },
  ],
};
