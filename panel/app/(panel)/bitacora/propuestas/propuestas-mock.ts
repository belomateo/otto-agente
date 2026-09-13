// Propuestas del analista nocturno (PROCESOS.md § 6), mock de H1.2. En Fase 2
// salen de propuestas_mejora (decisión pendiente #4). Los textos sugeridos no
// inventan precios, horarios ni políticas: salen de docs/ficha-del-negocio.md y
// de las reglas de AGENTE.md § 5. Los guiones son los de AGENTE.md § 13.

export type TipoPropuesta = 'fragmento' | 'regla' | 'objecion';
export type EstadoPropuesta = 'pendiente' | 'aplicada' | 'descartada' | 'aplicada-con-alerta';

export type Propuesta = {
  id: string;
  tipo: TipoPropuesta;
  titulo: string;
  /** sección de Conocimiento donde quedaría */
  seccion: string;
  /** de dónde sale: cuántas charlas y qué pasó */
  origen: string;
  /** mensaje textual del cliente (y la respuesta de Lucía cuando se rompió una regla) */
  ejemplo: { cliente: string; lucia?: string };
  sugerido: string;
  estado: EstadoPropuesta;
  alerta?: { guion: string; detalle: string; fecha: string };
};

export const PROPUESTAS: Propuesta[] = [
  {
    id: 'aplicada-anticipacion',
    tipo: 'fragmento',
    titulo: 'Fragmento aplicado: con cuánta anticipación reservar',
    seccion: 'Anticipación',
    origen: 'Aplicada el 11/9. Venía de 5 charlas que preguntaban «con cuánto tiempo».',
    ejemplo: { cliente: 'con cuanto tiempo tengo q reservar?' },
    sugerido:
      'Lo ideal es reservar entre 60 y 7 días antes del evento. Si es para esta semana o para hoy también lo vemos: siempre buscamos la forma.',
    estado: 'aplicada-con-alerta',
    alerta: {
      guion: 'urgente-misma-semana',
      detalle: 'con el fragmento nuevo, Lucía le dijo al cliente que ya era tarde para alquilar.',
      fecha: '11/9',
    },
  },
  {
    id: 'falta-ninos',
    tipo: 'fragmento',
    titulo: 'Falta un fragmento: trajes para chicos',
    seccion: 'Talles',
    origen: '3 charlas esta semana terminaron en «dato no encontrado».',
    ejemplo: { cliente: 'tienen traje para un nene de 6? es para el casamiento de la tia' },
    sugerido: 'Sí, hay trajes para chicos desde el talle 4. Se prueban en el local, con turno, como cualquier alquiler.',
    estado: 'pendiente',
  },
  {
    id: 'regla-7-envios',
    tipo: 'regla',
    titulo: 'Se rompió la regla 7: «Nunca dice “no” a secas»',
    seccion: 'Qué no hacemos',
    origen: '2 charlas de ayer. Lucía contestó con un no y no ofreció lo que sí hay.',
    ejemplo: { cliente: 'hacen envio a funes? no llego a ir al local', lucia: 'No, no hacemos envíos.' },
    sugerido:
      'El alquiler se prueba, se retira y se devuelve en el local, en España 764, Rosario. Lo que sí podemos es buscarte un turno en el horario que te quede más cómodo.',
    estado: 'pendiente',
  },
  {
    id: 'objecion-competencia',
    tipo: 'objecion',
    titulo: 'Objeción sin guion: «en otro lado es más barato»',
    seccion: 'Objeciones',
    origen: '4 charlas frenaron después del precio y ninguna sección de Objeciones pega.',
    ejemplo: { cliente: 'en otro local me lo alquilan por menos' },
    sugerido:
      'Te entiendo. La diferencia es que acá el traje se ajusta a tu medida, con sastrería y tintorería antes y después del evento incluidas: ese día te queda perfecto. Si querés, venís, te lo probás y lo comparás viéndote al espejo.',
    estado: 'pendiente',
  },
];

export const PROPUESTAS_PENDIENTES = PROPUESTAS.filter((p) => p.estado === 'pendiente').length;
