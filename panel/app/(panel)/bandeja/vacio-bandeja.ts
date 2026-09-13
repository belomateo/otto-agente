// Texto del estado vacío de Bandeja. Vive en un módulo común (sin 'use client')
// porque lo usan la página (servidor) y la lista (cliente): exportado desde un
// archivo 'use client', la página recibía una referencia de cliente y no el texto.

export const VACIO_BANDEJA = {
  titulo: 'Todavía no hay charlas',
  texto: 'Cuando un cliente escriba al WhatsApp de alquiler, la charla aparece acá.',
};
