// Clientes — tabla + ficha completa abierta (la libreta de Lucía). Puerto de
// d-clientes.html (tabla + panel de edición) y m-clientes.html (lista simple).

import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { clientes } from '@/lib/mock-data';
import { pideVacio, type BusquedaPagina } from '../vacio';
import { FichaEditable } from './FichaEditable';

const VACIO = { titulo: 'Todavía no hay clientes', texto: 'Cada persona que le escribe a Lucía queda acá con su ficha.' };

export default async function ClientesPage({ searchParams }: { searchParams: BusquedaPagina }) {
  const vacia = await pideVacio(searchParams);
  const lista = vacia ? [] : clientes;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="flex min-w-0 flex-1 flex-col p-5.5">
          <div className="mb-4 flex items-center gap-3">
            <h1 className="flex-none font-serif text-[22px] font-semibold">Clientes</h1>
            <input
              type="search"
              placeholder="Buscar"
              aria-label="Buscar clientes"
              className="w-[220px] rounded-otto border border-borde px-3 py-2 text-[14px] outline-none focus:border-cobre md:text-[13.5px]"
            />
            <span className="rounded-pill border border-borde px-3 py-1.5 text-[14px] font-medium text-grafito md:text-[12.5px]">Evento: todos ▾</span>
            <span className="rounded-pill border border-borde px-3 py-1.5 text-[14px] font-medium text-grafito md:text-[12.5px]">Mes: todos ▾</span>
            <span className="ml-auto text-[14px] tabular-nums text-grafito md:text-[12.5px]">{lista.length} clientes</span>
          </div>
          {vacia ? (
            <div className="rounded-otto border border-borde bg-lino">
              <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
            </div>
          ) : (
            <div className="overflow-hidden rounded-otto border border-borde bg-lino">
              <div className="flex h-10 items-center gap-3 border-b border-borde bg-[#FBFAF7] px-4 text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11.5px]">
                <span className="w-40">Nombre</span>
                <span className="w-[110px]">Teléfono</span>
                <span className="flex-1">Evento</span>
                <span className="w-16">Fecha</span>
                <span className="w-20">Rol</span>
                <span className="w-[92px]">Último contacto</span>
                <span className="w-[76px]">Turno</span>
              </div>
              {lista.map((c) => (
                <div key={c.n} className="flex h-fila items-center gap-3 border-b border-borde-suave px-4 text-sm last:border-b-0">
                  <span className="w-40 truncate font-serif text-[15px] font-semibold">{c.n}</span>
                  <span className="w-[110px] tabular-nums text-grafito">{c.tel}</span>
                  <span className="flex-1 truncate">{c.ev}</span>
                  <span className="w-16 tabular-nums">{c.f}</span>
                  <span className="w-20 text-grafito">{c.rol}</span>
                  <span className="w-[92px] text-grafito">{c.ult}</span>
                  <span className="w-[76px] tabular-nums">{c.turno}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {!vacia && <FichaEditable />}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col bg-lino md:hidden">
        <div className="border-b border-borde-suave px-4 pb-3 pt-[18px]">
          <div className="mb-2.5 font-serif text-[22px] font-semibold">Clientes</div>
          <input
            type="search"
            placeholder="Buscar"
            aria-label="Buscar clientes"
            className="w-full rounded-otto border border-borde bg-hueso px-3 py-2.5 text-sm outline-none focus:border-cobre"
          />
        </div>
        {vacia ? (
          <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
        ) : (
          <div className="flex-1">
            {lista.map((c) => (
              <div key={c.n} className="flex items-center gap-2.5 border-b border-borde-suave px-4 py-[14px]">
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-[15.5px] font-semibold">{c.n}</div>
                  <div className="mt-0.5 truncate text-[14px] text-grafito">
                    {c.ev} · {c.f} · {c.rol}
                  </div>
                </div>
                <div className="flex-none text-right">
                  <div className="text-[14px] text-grafito">turno</div>
                  <div className="text-[14px] font-medium tabular-nums">{c.turno}</div>
                </div>
                <span className="text-base text-[#C9C4B9]" aria-hidden>
                  ›
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
