// ?vacio=1 — muestra el estado vacío de una pestaña mientras es mock (H1.2).
// Es la única forma de verlo sin base. En Fase 2 el vacío sale de 0 filas y
// este parámetro se quita (ver Supuestos de docs/hitos/1.2-pestanas.md).

export type BusquedaPagina = Promise<{ [clave: string]: string | string[] | undefined }>;

export async function pideVacio(searchParams: BusquedaPagina) {
  return (await searchParams).vacio === '1';
}
