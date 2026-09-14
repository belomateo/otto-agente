// Los 8 items de navegación, compartidos por Sidebar y TabbarMobile. Los
// primeros 3 son la barra inferior de mobile (Bandeja · Atención humana ·
// Turnos, más el botón «Más»); el resto vive bajo "Más" en mobile. La pestaña 7
// se llama Bitácora (ruta /bitacora): decisión de Mateo, 12/9.
export type NavKey =
  | 'bandeja'
  | 'atencion'
  | 'turnos'
  | 'clientes'
  | 'conocimiento'
  | 'catalogo'
  | 'bitacora'
  | 'configuracion';

export const NAV_ITEMS: { key: NavKey; href: string; label: string }[] = [
  { key: 'bandeja', href: '/bandeja', label: 'Bandeja' },
  { key: 'atencion', href: '/atencion', label: 'Atención humana' },
  { key: 'turnos', href: '/turnos', label: 'Turnos' },
  { key: 'clientes', href: '/clientes', label: 'Clientes' },
  { key: 'conocimiento', href: '/conocimiento', label: 'Conocimiento' },
  { key: 'catalogo', href: '/catalogo', label: 'Catálogo' },
  { key: 'bitacora', href: '/bitacora', label: 'Bitácora' },
  { key: 'configuracion', href: '/configuracion', label: 'Configuración' },
];

/** Los que entran en la barra inferior de mobile, al lado de «Más»; el resto va en la hoja. */
export const NAV_MOBILE_PRINCIPALES: NavKey[] = ['bandeja', 'atencion', 'turnos'];
