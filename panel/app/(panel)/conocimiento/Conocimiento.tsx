'use client';

// Conocimiento — buscador de prueba, aviso de propuestas y secciones plegables.
// Puerto de d-conocimiento.html y m-conocimiento.html, en un solo layout
// responsive. El buscador es una aproximación local por palabras para que la
// pantalla se pueda probar; el de verdad es buscar_informacion (Fase 2).

import Link from 'next/link';
import { useState } from 'react';
import { Switch } from '@/components/ui-otto/Switch';
import { PROPUESTAS_PENDIENTES } from '../bitacora/propuestas/propuestas-mock';
import { SECCIONES, type Fragmento } from './fragmentos-mock';

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ');

const PALABRAS_VACIAS = new Set(['de', 'la', 'el', 'que', 'se', 'un', 'una', 'los', 'las', 'y', 'a', 'en', 'es', 'por', 'para', 'con', 'lo', 'me', 'si', 'cuanto', 'como']);

// Algunas palabras de cliente que no aparecen en los textos (AGENTE.md § 8, «se dispara con»).
const SINONIMOS: Record<string, string> = { sena: 'reservarlo paga', garantia: 'garantia tarjeta', retiro: 'retira', devuelvo: 'devuelve' };

function buscar(consulta: string): { seccion: string; fragmento: Fragmento } | null {
  const palabras = normalizar(consulta)
    .split(/\s+/)
    .flatMap((p) => (SINONIMOS[p] ? SINONIMOS[p].split(' ') : [p]))
    .filter((p) => p.length > 2 && !PALABRAS_VACIAS.has(p));
  let mejor: { seccion: string; fragmento: Fragmento; puntos: number } | null = null;
  for (const s of SECCIONES) {
    for (const f of s.fragmentos) {
      if (!f.activo) continue;
      const texto = normalizar(`${f.titulo} ${f.texto}`);
      const puntos = palabras.filter((p) => texto.includes(p)).length;
      if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { seccion: s.titulo, fragmento: f, puntos };
    }
  }
  return mejor;
}

function Buscador() {
  const [consulta, setConsulta] = useState('cuanto se paga de seña');
  const [resultado, setResultado] = useState(() => buscar('cuanto se paga de seña'));

  return (
    <div className="rounded-otto border border-borde bg-lino p-3.5 md:p-4">
      <label htmlFor="probar-busqueda" className="mb-2 block text-[14px] font-medium text-grafito md:text-[13px]">
        Probá cómo lo encontraría un cliente
      </label>
      <form
        className="flex gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setResultado(buscar(consulta));
        }}
      >
        <input
          id="probar-busqueda"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          className="min-w-0 flex-1 rounded-otto border border-borde bg-hueso px-3 py-2.5 text-[14.5px] outline-none"
        />
        <button type="submit" className="flex-none rounded-otto border border-cobre bg-lino px-4 py-2.5 text-[14px] font-medium text-cobre md:text-[13.5px]">
          Probar
        </button>
      </form>
      <div className="mt-3 flex items-baseline gap-2.5 border-t border-borde-suave pt-3 text-sm leading-[1.5]">
        {resultado ? (
          <>
            <span className="flex-none rounded-pill bg-salvia-suave px-2.5 py-0.5 text-[14px] font-medium text-salvia md:text-[11.5px]">
              Encontrado
            </span>
            <span className="min-w-0">
              <span className="font-serif text-[14px] font-semibold">{resultado.fragmento.titulo}</span> — «{resultado.fragmento.texto}»
            </span>
          </>
        ) : (
          <>
            <span className="flex-none rounded-pill bg-ladrillo-suave px-2.5 py-0.5 text-[14px] font-medium text-ladrillo md:text-[11.5px]">
              No encontrado
            </span>
            <span className="text-grafito">Lucía no tendría qué contestar: falta un fragmento para esto.</span>
          </>
        )}
      </div>
    </div>
  );
}

function AvisoPropuestas() {
  return (
    <Link
      href="/bitacora/propuestas"
      className="flex items-center gap-3 rounded-otto border border-cobre bg-lino px-3.5 py-3 text-[14px] md:px-4"
    >
      <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-pill bg-noche font-serif text-[14px] font-semibold text-hueso">
        L
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-serif font-semibold">Propuestas de Lucía</span>
        <span className="text-grafito"> · {PROPUESTAS_PENDIENTES} pendientes</span>
      </span>
      <span className="flex-none font-medium text-cobre">
        <span className="hidden md:inline">Revisar en Bitácora </span>›
      </span>
    </Link>
  );
}

function FragmentoCard({ f }: { f: Fragmento }) {
  const [activo, setActivo] = useState(f.activo);
  return (
    <div className={`rounded-otto border border-borde p-3.5 ${activo ? 'bg-lino' : 'bg-[#FBFAF7]'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`min-w-0 flex-1 basis-full font-serif text-[15px] font-semibold md:basis-auto ${activo ? '' : 'text-grafito'}`}>
          {f.titulo}
        </span>
        <span className="text-[14px] tabular-nums text-grafito md:text-[11.5px]">{f.version}</span>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-grafito md:text-xs">
          {activo ? 'Activo' : 'Inactivo'}
          <Switch defaultChecked={f.activo} onChange={setActivo} />
        </span>
        <button type="button" className="ml-auto rounded-[7px] border border-borde bg-lino px-3 py-1.5 text-[14px] font-medium text-cobre md:ml-0 md:text-[12.5px]">
          Editar
        </button>
      </div>
      <div className="mt-2 text-sm leading-[1.55] text-grafito">{f.texto}</div>
    </div>
  );
}

function Secciones() {
  const [abiertas, setAbiertas] = useState(() => new Set(SECCIONES.filter((s) => s.abierta).map((s) => s.titulo)));
  const alternar = (titulo: string) =>
    setAbiertas((prev) => {
      const sig = new Set(prev);
      if (sig.has(titulo)) sig.delete(titulo);
      else sig.add(titulo);
      return sig;
    });

  return (
    <div className="overflow-hidden rounded-otto border border-borde bg-lino">
      {SECCIONES.map((s) => {
        const abierta = abiertas.has(s.titulo);
        return (
          <div key={s.titulo} className="border-b border-borde-suave last:border-b-0">
            <button
              type="button"
              onClick={() => alternar(s.titulo)}
              aria-expanded={abierta}
              className={`flex w-full items-center gap-2.5 px-3.5 py-3.5 text-left text-[14.5px] font-medium md:px-4.5 ${abierta ? 'bg-[#FBFAF7]' : ''}`}
            >
              <span className={abierta ? 'text-cobre' : 'text-grafito'} aria-hidden>
                {abierta ? '▾' : '▸'}
              </span>
              {s.titulo}
              <span className="ml-auto text-[14px] tabular-nums text-grafito md:text-xs">{s.fragmentos.length}</span>
            </button>
            {abierta && (
              <div className="flex flex-col gap-2.5 px-3.5 pb-4 pt-1 md:pl-9.5 md:pr-4.5">
                {s.fragmentos.map((f) => (
                  <FragmentoCard key={f.titulo} f={f} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Conocimiento() {
  return (
    <>
      <Buscador />
      <AvisoPropuestas />
      <Secciones />
    </>
  );
}
