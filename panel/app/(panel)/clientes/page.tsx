// Clientes — tabla + ficha completa abierta (la libreta de Lucía). Puerto de
// d-clientes.html (tabla + panel de edición) y m-clientes.html (lista simple).

import { clientes } from '@/lib/mock-data';

const CAMPOS_FICHA: [string, string][] = [
  ['Evento', 'Casamiento'],
  ['Fecha', '14/11'],
  ['Rol', 'Novio'],
  ['Día / Noche', 'Noche'],
  ['Talle', '50'],
  ['Ciudad', 'Rosario'],
];

export default function ClientesPage() {
  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="flex flex-1 flex-col p-5.5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-none font-serif text-[22px] font-semibold">Clientes</div>
            <input placeholder="Buscar" className="w-[220px] rounded-otto border border-borde px-3 py-2 text-[13.5px] outline-none" />
            <span className="rounded-pill border border-borde px-3 py-1.5 text-[12.5px] font-medium text-grafito">Evento: todos ▾</span>
            <span className="rounded-pill border border-borde px-3 py-1.5 text-[12.5px] font-medium text-grafito">Mes: todos ▾</span>
            <span className="ml-auto text-[12.5px] text-grafito">{clientes.length} clientes</span>
          </div>
          <div className="overflow-hidden rounded-otto border border-borde">
            <div className="flex h-10 items-center gap-3 border-b border-borde bg-[#FBFAF7] px-4 text-[11.5px] font-semibold uppercase tracking-[.05em] text-grafito">
              <span className="w-40">Nombre</span>
              <span className="w-[110px]">Teléfono</span>
              <span className="flex-1">Evento</span>
              <span className="w-16">Fecha</span>
              <span className="w-20">Rol</span>
              <span className="w-[92px]">Último contacto</span>
              <span className="w-[76px]">Turno</span>
            </div>
            {clientes.map((c) => (
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
        </div>

        <div className="flex w-drawer flex-none flex-col border-l border-borde bg-lino">
          <div className="flex items-baseline gap-2.5 border-b border-borde-suave px-5.5 pb-3.5 pt-5">
            <span className="flex-1 font-serif text-xl font-semibold">Franco Bertolini</span>
            <span className="cursor-pointer text-xs text-grafito">✕ cerrar</span>
          </div>
          <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5.5 py-4.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {CAMPOS_FICHA.map(([label, valor]) => (
                <label key={label} className="flex flex-col gap-1 text-[11.5px] font-medium text-grafito">
                  {label}
                  <input defaultValue={valor} className="w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none" />
                </label>
              ))}
              <label className="col-span-2 flex flex-col gap-1 text-[11.5px] font-medium text-grafito">
                Color preferido
                <input defaultValue="Azul noche" className="w-full rounded-otto border border-borde px-2.5 py-2 text-sm text-tinta outline-none" />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-[11.5px] font-medium text-grafito">
                Notas
                <textarea
                  defaultValue="Quiere moño, no corbata. La novia eligió paleta terracota."
                  className="min-h-[56px] w-full resize-none rounded-otto border border-borde px-2.5 py-2 text-sm leading-[1.5] text-tinta outline-none"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 rounded-otto bg-hueso px-3 py-2.5 text-[12.5px] text-grafito">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-pill bg-noche font-serif text-[10px] font-semibold text-hueso">
                L
              </span>
              Lucía usa esta ficha en cada mensaje.
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-grafito">Historial</div>
              {[
                ['hoy 09:41', 'Charla con Lucía · confirmó el turno'],
                ['sáb 10:00', 'Turno · Novio · Probador 1 · Confirmado'],
                ['02/09', 'Primera consulta por WhatsApp'],
              ].map(([fecha, texto]) => (
                <div key={fecha} className="flex gap-2 border-t border-borde-suave py-2.5 text-[13.5px]">
                  <span className="w-[76px] flex-none text-grafito">{fecha}</span>
                  {texto}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-t border-borde-suave px-5.5 py-3.5">
            <button className="rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino">Guardar</button>
            <button className="rounded-otto border border-borde bg-lino px-3.5 py-2.5 text-sm font-medium text-grafito">Deshacer</button>
            <a className="ml-auto cursor-pointer text-[13px]">Ver versión anterior</a>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col bg-lino md:hidden">
        <div className="border-b border-borde-suave px-4 pb-3 pt-[18px]">
          <div className="mb-2.5 font-serif text-[22px] font-semibold">Clientes</div>
          <input placeholder="Buscar" className="w-full rounded-otto border border-borde bg-hueso px-3 py-2.5 text-sm outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {clientes.map((c) => (
            <div key={c.n} className="flex items-center gap-2.5 border-b border-borde-suave px-4 py-[14px]">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[15.5px] font-semibold">{c.n}</div>
                <div className="mt-0.5 truncate text-[13px] text-grafito">
                  {c.ev} · {c.f} · {c.rol}
                </div>
              </div>
              <div className="flex-none text-right">
                <div className="text-xs text-grafito">turno</div>
                <div className="text-[13px] font-medium tabular-nums">{c.turno}</div>
              </div>
              <span className="text-base text-[#C9C4B9]">›</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
