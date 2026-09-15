// Mock del cartel de turno (H1.17), mientras no exista GET /api/turnos/por-avisar (H1.16,
// paneles). Dos turnos con la hora de inicio calculada relativa al momento en que se abre el
// panel, para que el control se pueda hacer en cualquier momento sin que la demo quede vieja.
// No comparte estado con Configuración › Agenda: son dos mocks separados (ver Supuestos).

import type { TurnoPorAvisar } from './tipos';

const enMinutos = (base: Date, minutos: number) => new Date(base.getTime() + minutos * 60_000).toISOString();

export function turnosMock(ahora: Date): TurnoPorAvisar[] {
  return [
    {
      id: 'mock-1',
      cliente: 'Franco Bertolini',
      telefono: '341 615-2233',
      desde: enMinutos(ahora, 12),
      hasta: enMinutos(ahora, 12 + 45),
      tipo: 'Novio',
      probador: 1,
      evento: 'Casamiento',
      fechaEvento: '14/11',
      rol: 'Novio',
      talle: '50',
      color: 'Azul noche',
      notas: 'Pidió que le avisen apenas llegue.',
      confirmadoPor: 'cliente',
      charlaUrl: '/bandeja/charla',
      fichaUrl: '/clientes',
    },
    {
      id: 'mock-2',
      cliente: 'Nicolás Pereyra',
      telefono: '341 402-7781',
      desde: enMinutos(ahora, 25),
      hasta: enMinutos(ahora, 25 + 45),
      tipo: 'Invitado',
      probador: 2,
      evento: 'Casamiento',
      fechaEvento: '25/10',
      rol: 'Invitado',
      talle: '48',
      color: 'Gris perla',
      notas: '',
      confirmadoPor: null,
      charlaUrl: '/bandeja/charla',
      fichaUrl: '/clientes',
    },
  ];
}
