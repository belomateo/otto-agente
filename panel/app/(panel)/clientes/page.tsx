'use client';

// Clientes — conectada a GET /api/clientes (H1.8, paneles). Puerto de d-clientes.html (tabla +
// panel de edición) y m-clientes.html (lista simple, sin ficha: igual que Atención humana,
// el drill-in de mobile queda para más adelante). Tocar una fila en escritorio pone su id en
// la URL (?id=<id>), el mismo formato que ya usan el cartel de turno y Bandeja para enlazar acá.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { useDatos } from '@/components/api/useDatos';
import { ETIQUETA_EVENTO } from '@/lib/etiquetas';
import type { FilaCliente } from '@/lib/queries/clientes';
import { FichaEditable } from './FichaEditable';

const VACIO = { titulo: 'Todavía no hay clientes', texto: 'Cada persona que le escribe a Lucía queda acá con su ficha.' };
const SIN_CONECTAR_MES = 'El filtro por mes todavía no está conectado';

export default function ClientesPage() {
  const idSeleccionado = useSearchParams().get('id');
  const [busqueda, setBusqueda] = useState('');
  const [evento, setEvento] = useState('');
  const ruta = `/api/clientes${evento ? `?evento=${evento}` : ''}${busqueda.trim() ? `${evento ? '&' : '?'}q=${encodeURIComponent(busqueda.trim())}` : ''}`;
  const { datos, cargando, error, recargar } = useDatos<{ clientes: FilaCliente[]; total: number }>(ruta);
  const lista = datos?.clientes ?? [];

  const contenido =
    cargando && lista.length === 0 ? (
      <Cargando />
    ) : error ? (
      <EstadoError mensaje={error} onReintentar={recargar} />
    ) : lista.length === 0 && !busqueda && !evento ? (
      <EstadoVacio titulo={VACIO.titulo} texto={VACIO.texto} />
    ) : null;

  return (
    <>
      {/* Escritorio */}
      <div className="hidden flex-1 md:flex">
        <div className="flex min-w-0 flex-1 flex-col p-5.5">
          <div className="mb-4 flex items-center gap-3">
            <h1 className="flex-none font-serif text-[22px] font-semibold">Clientes</h1>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar clientes"
              className="w-[220px] rounded-otto border border-borde px-3 py-2 text-[14px] outline-none focus:border-cobre md:text-[13.5px]"
            />
            <select
              value={evento}
              onChange={(e) => setEvento(e.target.value)}
              aria-label="Filtrar por evento"
              className="rounded-pill border border-borde bg-lino px-3 py-1.5 text-[14px] font-medium text-grafito md:text-[12.5px]"
            >
              <option value="">Evento: todos</option>
              {Object.entries(ETIQUETA_EVENTO).map(([clave, texto]) => (
                <option key={clave} value={clave}>
                  {texto}
                </option>
              ))}
            </select>
            <span title={SIN_CONECTAR_MES} className="cursor-not-allowed rounded-pill border border-dashed border-borde px-3 py-1.5 text-[14px] font-medium text-[#8A8578] md:text-[12.5px]">
              Mes: todos ▾
            </span>
            <span className="ml-auto text-[14px] tabular-nums text-grafito md:text-[12.5px]">{lista.length} clientes</span>
          </div>
          {contenido ?? (
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
              {lista.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-grafito">Ningún cliente con ese filtro.</div>
              ) : (
                lista.map((c) => (
                  <Link
                    key={c.id}
                    href={`/clientes?id=${c.id}`}
                    aria-current={c.id === idSeleccionado ? 'page' : undefined}
                    className={`flex h-fila items-center gap-3 border-b border-borde-suave px-4 text-sm last:border-b-0 ${c.id === idSeleccionado ? 'bg-cobre-claro/50' : ''}`}
                  >
                    <span className="w-40 truncate font-serif text-[15px] font-semibold">{c.n}</span>
                    <span className="w-[110px] tabular-nums text-grafito">{c.tel}</span>
                    <span className="flex-1 truncate">{c.ev}</span>
                    <span className="w-16 tabular-nums">{c.f}</span>
                    <span className="w-20 text-grafito">{c.rol}</span>
                    <span className="w-[92px] text-grafito">{c.ult}</span>
                    <span className="w-[76px] tabular-nums">{c.turno}</span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
        {!contenido && idSeleccionado && <FichaEditable id={idSeleccionado} />}
      </div>

      {/* Mobile */}
      <div className="flex flex-1 flex-col bg-lino md:hidden">
        <div className="border-b border-borde-suave px-4 pb-3 pt-[18px]">
          <div className="mb-2.5 font-serif text-[22px] font-semibold">Clientes</div>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar clientes"
            className="w-full rounded-otto border border-borde bg-hueso px-3 py-2.5 text-sm outline-none focus:border-cobre"
          />
        </div>
        {contenido ?? (
          <div className="flex-1">
            {lista.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-grafito">Ningún cliente con ese filtro.</div>
            ) : (
              lista.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 border-b border-borde-suave px-4 py-[14px]">
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
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
