// Datos mock del panel de Lucía. Extraídos tal cual del canvas de Claude Design
// (frame "otto-tokens.tailwind.js" / sección TOKENS del archivo
// "Panel Lucía - Otto Su Misura.dc.html"), no inventados en el puerto a React.
// Fase 1 (H1.2): son datos de ejemplo para maquetar. Los reemplaza "paneles"
// en Fase 2 con datos reales de Supabase.

export type Conversacion = {
  n: string;
  m: string;
  h: string;
  chip: 'Lucía' | 'Persona' | 'Cerrada';
  cb: string;
  cf: string;
  bg: string;
  tag: string;
  hasTag: boolean;
};

export const convos: Conversacion[] = [
  { n: 'Nicolás Pereyra', m: 'invitado', h: '10:02', chip: 'Lucía', cb: '#EEF1F5', cf: '#1F2A3C', bg: '#F1E6D9', tag: 'Casamiento', hasTag: true },
  { n: 'Agustín Ferreyra', m: 'necesito el traje para hoy sí o sí, me recibo…', h: '09:48', chip: 'Persona', cb: '#F1E6D9', cf: '#A8703F', bg: 'transparent', tag: 'Urgente', hasTag: true },
  { n: 'Franco Bertolini', m: 'perfecto, confirmo el sábado a las 10', h: '09:41', chip: 'Lucía', cb: '#EEF1F5', cf: '#1F2A3C', bg: 'transparent', tag: 'Novio', hasTag: true },
  { n: 'Verónica Díaz', m: '¿tienen talle para un chico de 17? es finito', h: '09:12', chip: 'Lucía', cb: '#EEF1F5', cf: '#1F2A3C', bg: 'transparent', tag: 'Graduación', hasTag: true },
  { n: 'Litoral Seguros', m: 'somos 18 personas, ¿hacen corporativo?', h: '08:05', chip: 'Persona', cb: '#F1E6D9', cf: '#A8703F', bg: 'transparent', tag: 'Corporativo', hasTag: true },
  { n: 'Martín Sosa', m: '¡gracias! nos vemos el sábado', h: 'ayer', chip: 'Cerrada', cb: '#EFEDE8', cf: '#5C6068', bg: 'transparent', tag: '', hasTag: false },
  { n: 'Lucas Amado', m: '¿la prueba final cuánto tarda?', h: 'jue', chip: 'Cerrada', cb: '#EFEDE8', cf: '#5C6068', bg: 'transparent', tag: '', hasTag: false },
];

export type Derivacion = {
  n: string;
  hace: string;
  motivo: string;
  cb: string;
  cf: string;
  borde: string;
  resumen: string;
};

export const derivas: Derivacion[] = [
  { n: 'Agustín Ferreyra', hace: 'hace 12 min', motivo: 'Turno urgente', cb: '#F6E3DF', cf: '#A6473A', borde: '#A8703F', resumen: 'Se gradúa hoy y necesita un traje para esta noche. Lucía no encontró huecos; pide que lo llame un asesor. Talle aprox. 48.' },
  { n: 'Litoral Seguros', hace: 'hace 2 h', motivo: 'Corporativo', cb: '#EEF1F5', cf: '#1F2A3C', borde: '#E6E1D8', resumen: 'Empresa de Rosario consulta por uniformes para 18 personas, evento de fin de año. Piden presupuesto y prueba grupal.' },
];

export type TurnoDelDia = {
  h: string;
  n: string;
  t: string;
  p: string;
  e: string;
  eb: string;
  ef: string;
  borde: string;
};

export const turnosM: TurnoDelDia[] = [
  { h: '10:00', n: 'Franco Bertolini', t: 'Novio · 45’', p: 'Probador 1', e: 'Confirmado', eb: '#E7EFE7', ef: '#5E7F62', borde: '#5E7F62' },
  { h: '10:15', n: 'Nicolás Pereyra', t: 'Invitado · 45’', p: 'Probador 2', e: 'Sin confirmar', eb: '#F7EFDD', ef: '#B8862B', borde: '#B8862B' },
  { h: '11:30', n: 'Martín Sosa', t: 'Invitado · 45’', p: 'Probador 3', e: 'Confirmado', eb: '#E7EFE7', ef: '#5E7F62', borde: '#5E7F62' },
  { h: '12:15', n: 'Tomás Díaz', t: 'Graduado · 45’', p: 'Probador 1', e: 'Confirmado', eb: '#E7EFE7', ef: '#5E7F62', borde: '#5E7F62' },
  { h: '16:00', n: 'Lucas Amado', t: 'Prueba final · 15’', p: 'Probador 2', e: 'Confirmado', eb: '#E7EFE7', ef: '#5E7F62', borde: '#5E7F62' },
];

export type Cliente = {
  n: string;
  tel: string;
  ev: string;
  f: string;
  rol: string;
  ult: string;
  turno: string;
};

export const clientes: Cliente[] = [
  { n: 'Franco Bertolini', tel: '341 615-2233', ev: 'Casamiento', f: '14/11', rol: 'Novio', ult: 'hoy 09:41', turno: 'sáb 10:00' },
  { n: 'Nicolás Pereyra', tel: '341 402-7781', ev: 'Casamiento', f: '25/10', rol: 'Invitado', ult: 'hoy 10:02', turno: 'sáb 10:15' },
  { n: 'Verónica Díaz', tel: '341 528-9010', ev: 'Graduación (Tomás)', f: '28/11', rol: 'Mamá', ult: 'hoy 09:12', turno: 'sáb 12:15' },
  { n: 'Martín Sosa', tel: '341 693-4456', ev: 'Evento laboral', f: '3/10', rol: 'Invitado', ult: 'ayer', turno: 'sáb 11:30' },
  { n: 'Agustín Ferreyra', tel: '341 577-0198', ev: 'Graduación', f: 'hoy 12/9', rol: 'Graduado', ult: 'hace 12 min', turno: '—' },
];

export type ModeloCatalogo = {
  n: string;
  p: string;
  talles: string;
  foto: string;
  dots: string[];
  on: boolean;
  off: boolean;
};

export const catalogo: ModeloCatalogo[] = [
  { n: 'Ambo azul noche corte italiano', p: '$150.000', talles: '44–60', foto: 'ambo azul noche · 3:4', dots: ['#1F2A3C', '#2E3D55'], on: true, off: false },
  { n: 'Ambo gris perla', p: '$150.000', talles: '44–62', foto: 'ambo gris perla · 3:4', dots: ['#B9BCC2', '#8C9097'], on: true, off: false },
  { n: 'Smoking negro', p: '$185.000', talles: '46–58', foto: 'smoking negro · 3:4', dots: ['#17181B'], on: true, off: false },
  { n: 'Chaquet', p: '$210.000', talles: '48–56', foto: 'chaquet · 3:4', dots: ['#2B2C30', '#6E6F73'], on: false, off: true },
];

export const accesorios = [
  { n: 'Camisa + corbata', alq: '$33.500', compra: '$29.800' },
  { n: 'Zapato + cinturón', alq: '$55.000', compra: '$49.500' },
];

export const fragmentos = [
  { t: 'Reserva y garantía', txt: 'Para reservar se deja una seña del 30%. La garantía es con DNI y tarjeta; se devuelve al entregar la prenda en condiciones.', v: 'v4 · 02/09', on: true },
  { t: 'Qué incluye el alquiler', txt: 'Sastrería a medida, camisa de cortesía y tintorería antes y después del evento. El traje se retira 48 h antes.', v: 'v6 · 28/08', on: true },
  { t: 'Objeción: es caro', txt: 'Anclar el valor: a medida, sastrería incluida, tintorería incluida. Comparar con el costo de compra de un traje equivalente.', v: 'v2 · 15/08', on: true },
  { t: 'Objeción: lo voy a pensar', txt: 'Validar, no presionar. Ofrecer agendar una prueba sin compromiso: «te lo probás y decidís viéndote al espejo».', v: 'v1 · 15/08', on: false },
];

export type EventoBitacora = {
  h: string;
  tipo: string;
  n: string;
  d: string;
  tone: string;
  bg: string;
};

export const eventos: EventoBitacora[] = [
  { h: '10:03', tipo: 'Barandilla', n: 'Nicolás Pereyra', d: 'Rehecho: intentó dar un precio sin consultar el catálogo', tone: '#B8862B', bg: '#F7EFDD' },
  { h: '10:02', tipo: 'Mensaje', n: 'Nicolás Pereyra', d: 'consultar_catalogo(evento: casamiento) → respondió precio y ancló valor', tone: '#5C6068', bg: 'transparent' },
  { h: '09:48', tipo: 'Derivación', n: 'Agustín Ferreyra', d: 'Turno urgente sin hueco → pasó a Atención humana', tone: '#A6473A', bg: '#F6E3DF' },
  { h: '09:41', tipo: 'Turno', n: 'Franco Bertolini', d: 'Confirmó sáb 10:00 · Probador 1 · sincronizado con Google Calendar', tone: '#5C6068', bg: 'transparent' },
  { h: '09:12', tipo: 'Turno', n: 'Verónica Díaz', d: 'Agendó graduación de Tomás · sáb 12:15 · Probador 1', tone: '#5C6068', bg: 'transparent' },
  { h: '08:30', tipo: 'Sistema', n: '—', d: 'Análisis nocturno: 2 propuestas nuevas en Conocimiento', tone: '#5C6068', bg: 'transparent' },
];

export const reglas = [
  { i: '1', t: 'Nunca dar un precio sin consultar el catálogo.' },
  { i: '2', t: 'Después de responder un precio, proponer siempre un turno.' },
  { i: '3', t: 'Ante reclamo o prenda dañada, derivar a una persona sin discutir.' },
  { i: '4', t: 'No ofrecer descuentos: derivar a Atención humana.' },
  { i: '5', t: 'Máximo dos emojis por charla, nunca en temas de plata.' },
];

export const kpis = [
  { num: '23', l: 'Consultas', sub: 'hoy' },
  { num: '7', l: 'Turnos agendados', sub: 'hoy' },
  { num: '30%', l: 'Conversión', sub: 'consulta → turno' },
  { num: '1', l: 'Rehecho por barandilla', sub: 'hoy' },
];
