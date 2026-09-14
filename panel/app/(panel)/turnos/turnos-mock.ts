// Turnos mock (H1.2, con la agenda por franjas del 14/9). Tres días para recorrer
// con las flechas: el sábado del resto del mock (a la mañana con 3 probadores, a la
// tarde solo en los probadores 1 y 2), el domingo sin turnos y un lunes con turnos
// solo desde las 13. Cada turno entra entero en una franja de
// configuracion/agenda/agenda-mock.ts. Reemplaza a `turnosM` de lib/mock-data.ts,
// que sigue con la agenda vieja. En Fase 2 salen de `turnos` (paneles).

import type { EstadoTurno } from '@/components/ui-otto/BloqueTurno';

export type TurnoMock = {
  nombre: string;
  tipo: string;
  minutos: number;
  probador: number;
  desde: string;
  estado: EstadoTurno;
  /** Aviso de Calendar: va en una columna aparte, además del estado (decisión #2). */
  aviso?: string;
  /** Lo que muestra el turno abierto: evento y teléfono, de la ficha del cliente. */
  ficha?: { evento: string; telefono: string };
};

export type DiaTurnos = {
  fecha: string;
  titulo: string;
  /** 0 = domingo, para buscar las franjas del día en la agenda. */
  diaSemana: number;
  turnos: TurnoMock[];
  /** Turno abierto en el popover (escritorio) y en la hoja inferior (390). */
  abierto?: string;
  /** Chip del canvas «Sin confirmar para mañana · 3». */
  sinConfirmarManana?: number;
};

export const DIA_INICIAL = '2026-09-12';

export const DIAS_TURNOS: DiaTurnos[] = [
  {
    fecha: '2026-09-12',
    titulo: 'Sábado 12 de septiembre',
    diaSemana: 6,
    abierto: 'Franco Bertolini',
    sinConfirmarManana: 3,
    turnos: [
      {
        nombre: 'Franco Bertolini',
        tipo: 'Novio',
        minutos: 45,
        probador: 1,
        desde: '10:00',
        estado: 'confirmado',
        ficha: { evento: 'Casamiento 14/11 · Noche · Talle 50', telefono: '341 615-2233' },
      },
      {
        nombre: 'Nicolás Pereyra',
        tipo: 'Invitado',
        minutos: 45,
        probador: 2,
        desde: '10:15',
        estado: 'sin-confirmar',
        aviso: 'Sin sincronizar con Google Calendar',
      },
      { nombre: 'Martín Sosa', tipo: 'Invitado', minutos: 45, probador: 3, desde: '11:15', estado: 'confirmado' },
      { nombre: 'Tomás Díaz', tipo: 'Graduado', minutos: 45, probador: 1, desde: '15:00', estado: 'confirmado' },
      { nombre: 'Lucas Amado', tipo: 'Prueba final', minutos: 15, probador: 2, desde: '16:00', estado: 'confirmado' },
    ],
  },
  { fecha: '2026-09-13', titulo: 'Domingo 13 de septiembre', diaSemana: 0, turnos: [] },
  {
    fecha: '2026-09-14',
    titulo: 'Lunes 14 de septiembre',
    diaSemana: 1,
    turnos: [
      { nombre: 'Santiago Molina', tipo: 'Novio', minutos: 45, probador: 1, desde: '13:00', estado: 'confirmado' },
      { nombre: 'Bruno Acosta', tipo: 'Invitado', minutos: 45, probador: 2, desde: '13:15', estado: 'sin-confirmar' },
      { nombre: 'Ezequiel Funes', tipo: 'Graduado', minutos: 45, probador: 3, desde: '16:30', estado: 'confirmado' },
    ],
  },
];
