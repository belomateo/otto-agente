// Fragmentos mock de Conocimiento (H1.2), agrupados como DISENO.md § 5 y
// AGENTE.md § 8. Los textos salen de docs/ficha-del-negocio.md: los del canvas
// decían «seña del 30%» y «se retira 48 h antes», que la ficha contradice
// (se paga completo al reservar; se retira un día antes). En Fase 2 los
// reemplaza la tabla fragmentos (paneles).

export type Fragmento = { titulo: string; texto: string; version: string; activo: boolean };
export type Seccion = { titulo: string; abierta?: boolean; fragmentos: Fragmento[] };

export const SECCIONES: Seccion[] = [
  {
    titulo: 'Qué incluye el alquiler',
    fragmentos: [
      {
        titulo: 'Qué incluye el alquiler',
        texto:
          'El precio base incluye el ambo o traje, con sastrería y tintorería antes y después del evento. Camisa, cinturón, zapatos y accesorios se alquilan aparte, según lo que necesites.',
        version: 'v6 · 28/08',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Cómo funciona: retiro y devolución',
    fragmentos: [
      {
        titulo: 'Retiro y devolución',
        texto: 'Se retira un día antes del evento, con la prueba final, y se devuelve un día hábil después. Todo en el local.',
        version: 'v3 · 20/08',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Reserva y garantía',
    abierta: true,
    fragmentos: [
      {
        titulo: 'Reserva y garantía',
        texto:
          'El alquiler se paga completo al reservarlo. La garantía es con tarjeta de crédito y se deja en el local el día de la prueba final.',
        version: 'v4 · 02/09',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Ubicación y horarios',
    fragmentos: [
      {
        titulo: 'Dónde estamos',
        texto: 'Estamos en España 764, Rosario. El alquiler es solo en el local: ahí se prueba, se retira y se devuelve.',
        version: 'v2 · 12/08',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Talles',
    fragmentos: [
      {
        titulo: 'Talles: del XS al 68',
        texto: 'Hay talles del XS al 68 de saco. Fuera de ese rango se puede confeccionar con tiempo, pero solo para la venta.',
        version: 'v2 · 15/08',
        activo: true,
      },
    ],
  },
  {
    titulo: 'A medida',
    fragmentos: [
      {
        titulo: 'Por qué a medida',
        texto:
          'No alquilamos cualquier traje: se ajusta a tu medida para que el día del evento te quede perfecto. La sastrería está incluida.',
        version: 'v1 · 12/09',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Anticipación',
    fragmentos: [
      {
        titulo: 'Con cuánta anticipación reservar',
        texto:
          'Lo ideal es reservar entre 60 y 7 días antes del evento. Si es para esta semana o para hoy también lo vemos: siempre buscamos la forma.',
        version: 'v1 · 11/09',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Accesorios',
    fragmentos: [
      {
        titulo: 'Accesorios',
        texto: 'Camisa, corbata, cinturón y zapatos se alquilan aparte. Si alquilás, también los podés comprar con descuento.',
        version: 'v2 · 28/08',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Objeciones',
    abierta: true,
    fragmentos: [
      {
        titulo: 'Objeción: es caro',
        texto:
          'Anclar el valor antes que el precio: se ajusta a tu medida, con sastrería y tintorería antes y después del evento. Precio, calidad y servicio, lo mejor del mercado.',
        version: 'v2 · 15/08',
        activo: true,
      },
      {
        titulo: 'Objeción: lo voy a pensar',
        texto: 'Validar, no presionar. Ofrecer una prueba en el local: «te lo probás y decidís viéndote al espejo».',
        version: 'v1 · 15/08',
        activo: false,
      },
    ],
  },
  {
    titulo: 'Qué no hacemos',
    fragmentos: [
      {
        titulo: 'Corporativo y uniformes',
        texto:
          'Los pedidos corporativos y de uniformes los atiende el equipo. Antes de pasarlos, Lucía pide cantidad de personas, rubro, prendas actuales, si tienen logo y proveedor actual.',
        version: 'v1 · 12/09',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Descuentos',
    fragmentos: [
      {
        titulo: 'Descuentos',
        texto: 'Los descuentos los decide una persona del equipo. Lucía no los ofrece ni los confirma: pasa la charla.',
        version: 'v1 · 12/09',
        activo: true,
      },
    ],
  },
  {
    titulo: 'Guiones: novio · graduado · invitado',
    fragmentos: [
      {
        titulo: 'Guion: novio',
        texto: 'Felicitar. Preguntar fecha del casamiento y si es de día o de noche antes de hablar de modelos. El valor va antes que el precio.',
        version: 'v1 · 12/09',
        activo: true,
      },
      {
        titulo: 'Guion: graduado',
        texto: 'Preguntar la fecha de la graduación y quién consulta: muchas veces escribe la mamá o el papá. Proponer el turno.',
        version: 'v1 · 12/09',
        activo: true,
      },
      {
        titulo: 'Guion: invitado',
        texto: 'Preguntar el evento, la fecha y si es de día o de noche. Mostrar opciones recién con eso.',
        version: 'v1 · 12/09',
        activo: true,
      },
    ],
  },
];
