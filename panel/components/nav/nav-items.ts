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

// Bandeja, Atención humana y Turnos son del día a día del mostrador (rol 'equipo': Turnos es
// donde se marca retiró/devolvió); el resto es solo-admin (decisión de Mateo 16/9, reconfirmada
// con logica el mismo día para dejar Turnos afuera del filtro). El filtro de acá es nomás para
// no mostrar el link: la base tiene que devolver 403 si igual se pide la ruta o la API a mano
// (paneles ya lo hizo para clientes/catálogo/conocimiento/bitácora/configuración; turnos queda
// abierto a cualquier aprobado a propósito).
export const NAV_ITEMS: { key: NavKey; href: string; label: string; soloAdmin?: boolean }[] = [
  { key: 'bandeja', href: '/bandeja', label: 'Bandeja' },
  { key: 'atencion', href: '/atencion', label: 'Atención humana' },
  { key: 'turnos', href: '/turnos', label: 'Turnos' },
  { key: 'clientes', href: '/clientes', label: 'Clientes', soloAdmin: true },
  { key: 'conocimiento', href: '/conocimiento', label: 'Conocimiento', soloAdmin: true },
  { key: 'catalogo', href: '/catalogo', label: 'Catálogo', soloAdmin: true },
  { key: 'bitacora', href: '/bitacora', label: 'Bitácora', soloAdmin: true },
  { key: 'configuracion', href: '/configuracion', label: 'Configuración', soloAdmin: true },
];

/** Los que entran en la barra inferior de mobile, al lado de «Más»; el resto va en la hoja. */
export const NAV_MOBILE_PRINCIPALES: NavKey[] = ['bandeja', 'atencion', 'turnos'];

/** Sin usuario (todavía cargando) se asume lo más restrictivo: nada de solo-admin. */
export function navVisibles(rol: string | undefined) {
  return NAV_ITEMS.filter((i) => !i.soloAdmin || rol === 'admin');
}
