// Placeholder mientras una pestaña pide sus datos reales a panel/app/api/**. Nada de
// spinners: un texto quieto, para no competir con el resto de la interfaz mientras carga.

export function Cargando() {
  return <div className="flex flex-1 items-center justify-center px-5 py-9 text-[14px] text-grafito md:text-sm">Cargando…</div>;
}
