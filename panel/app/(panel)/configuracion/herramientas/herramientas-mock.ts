// Las 13 herramientas de Lucía (AGENTE.md § 4), mock de H1.2. La descripción es
// lo que el modelo lee y el dueño la puede reescribir; el schema y las
// precondiciones son código del rol agente y no se tocan desde el panel.

export type Herramienta = { nombre: string; tipo: 'consulta' | 'accion'; descripcion: string; activa: boolean };

export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: 'buscar_informacion',
    tipo: 'consulta',
    descripcion: 'Busca en la base de conocimiento por tema. Usala antes de afirmar cualquier política, horario, condición o qué incluye el alquiler.',
    activa: true,
  },
  {
    nombre: 'consultar_catalogo',
    tipo: 'consulta',
    descripcion:
      'Devuelve los modelos de alquiler con colores, talles, precio base y fotos. Usala antes de decir un precio o describir un modelo; el precio va siempre con «incluye sastrería y tintorería».',
    activa: true,
  },
  {
    nombre: 'consultar_accesorios',
    tipo: 'consulta',
    descripcion: 'Devuelve camisa, corbata, cinturón y zapatos con precio de alquiler y de compra con descuento. Usala cuando el cliente pregunta o al ofrecer el look completo.',
    activa: true,
  },
  {
    nombre: 'buscar_horarios',
    tipo: 'consulta',
    descripcion: 'Devuelve los huecos reales por probador, ya dentro del horario del local. Usala antes de ofrecer un horario y ofrecé dos, nunca más de tres.',
    activa: true,
  },
  {
    nombre: 'ver_turnos_cliente',
    tipo: 'consulta',
    descripcion: 'Devuelve los turnos del cliente. Ya vienen en el contexto: usala solo si acabás de crear o mover uno.',
    activa: true,
  },
  {
    nombre: 'agendar_turno',
    tipo: 'accion',
    descripcion: 'Agenda el turno en el local. Necesita nombre, fecha del evento, tipo de turno y un hueco que haya salido de buscar_horarios.',
    activa: true,
  },
  {
    nombre: 'reprogramar_turno',
    tipo: 'accion',
    descripcion: 'Mueve un turno del cliente a otro hueco válido. Nunca crea uno nuevo encima.',
    activa: true,
  },
  {
    nombre: 'cancelar_turno',
    tipo: 'accion',
    descripcion: 'Cancela un turno del cliente y anota el motivo.',
    activa: true,
  },
  {
    nombre: 'guardar_datos_cliente',
    tipo: 'accion',
    descripcion: 'Guarda en la ficha lo que el cliente dijo: nombre, evento, fecha, rol, día o noche, talle, ciudad, color. Usala en el mismo turno en que te enterás.',
    activa: true,
  },
  {
    nombre: 'anotar',
    tipo: 'accion',
    descripcion: 'Anota en la libreta del cliente algo que sirva después y no entre en la ficha.',
    activa: true,
  },
  {
    nombre: 'enviar_fotos',
    tipo: 'accion',
    descripcion: 'Manda hasta 3 fotos de modelos del catálogo.',
    activa: true,
  },
  {
    nombre: 'enviar_link',
    tipo: 'accion',
    descripcion: 'Manda el link del mapa, de la reseña de Google o de la web.',
    activa: true,
  },
  {
    nombre: 'derivar_a_persona',
    tipo: 'accion',
    descripcion: 'Pasa la charla al equipo con el motivo. Corta el turno: no preguntes nada en el mismo mensaje.',
    activa: true,
  },
];
