// Los 8 items de navegación, compartidos por Sidebar y TabbarMobile. Los
// primeros 4 son la barra inferior de mobile (Bandeja · Atención humana ·
// Turnos · Más); el resto vive bajo "Más" en mobile. Ver ARRANQUE.md H1.2.
export type NavKey =
  | 'bandeja'
  | 'atencion'
  | 'turnos'
  | 'clientes'
  | 'conocimiento'
  | 'catalogo'
  | 'estadisticas'
  | 'configuracion';

export const NAV_ITEMS: { key: NavKey; href: string; label: string }[] = [
  { key: 'bandeja', href: '/bandeja', label: 'Bandeja' },
  { key: 'atencion', href: '/atencion', label: 'Atención humana' },
  { key: 'turnos', href: '/turnos', label: 'Turnos' },
  { key: 'clientes', href: '/clientes', label: 'Clientes' },
  { key: 'conocimiento', href: '/conocimiento', label: 'Conocimiento' },
  { key: 'catalogo', href: '/catalogo', label: 'Catálogo' },
  { key: 'estadisticas', href: '/estadisticas', label: 'Estadísticas' },
  { key: 'configuracion', href: '/configuracion', label: 'Configuración' },
];

/** Los 4 que entran en la barra inferior de mobile; el resto va en "Más". */
export const NAV_MOBILE_PRINCIPALES: NavKey[] = ['bandeja', 'atencion', 'turnos'];
