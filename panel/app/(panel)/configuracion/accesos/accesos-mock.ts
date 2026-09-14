// Accesos mock (H1.2). Nombres y emails ficticios con dominio example.com: el
// repo es público y no van los nombres reales de los asesores. En H1.10
// (paneles) salen de solicitudes_acceso y perfiles.

export type Solicitud = { id: string; nombre: string; email: string; fecha: string };
export type Usuario = { id: string; nombre: string; email: string; rol: 'admin' | 'equipo' };

export const SOLICITUDES: Solicitud[] = [
  { id: 'sol-1', nombre: 'Ignacio Romero', email: 'ignacio.romero@example.com', fecha: '12/9 · 18:40' },
  { id: 'sol-2', nombre: 'Paula Gómez', email: 'paula.gomez@example.com', fecha: '13/9 · 09:15' },
];

export const USUARIOS: Usuario[] = [
  { id: 'usr-1', nombre: 'Carla Méndez', email: 'carla.mendez@example.com', rol: 'admin' },
  { id: 'usr-2', nombre: 'Julián Ríos', email: 'julian.rios@example.com', rol: 'equipo' },
  { id: 'usr-3', nombre: 'Valeria Paz', email: 'valeria.paz@example.com', rol: 'equipo' },
];
