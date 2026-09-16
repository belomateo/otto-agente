'use client';

// Conocimiento — buscador real y secciones plegables con los fragmentos reales (H1.8,
// paneles). El buscador consume GET /api/conocimiento/buscar: una aproximación provisoria de
// buscar_informacion (texto completo en español, sin tildes), no la búsqueda que usa Lucía —
// eso es de agente (Fase 2). Activar/desactivar un fragmento guarda de verdad.
//
// El aviso de Propuestas que había acá se sacó: esa pantalla (bitacora/propuestas) todavía no
// tiene datos reales (no existe el analista nocturno de PROCESOS.md § 6), así que no hay de
// dónde traer un número real para avisar.

import { useState } from 'react';
import { Switch } from '@/components/ui-otto/Switch';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { enviar, obtener, ErrorApi } from '@/components/api/cliente';
import { useEdicion } from '@/components/api/useEdicion';
import type { FilaFragmento, ResultadoBusqueda, SeccionConocimiento } from '@/lib/queries/conocimiento';

const SIN_CONECTAR = 'Todavía no conectado';

function Buscador() {
  const [consulta, setConsulta] = useState('cuanto se paga de seña');
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!consulta.trim()) return;
    setBuscando(true);
    setError(null);
    try {
      const r = await obtener<{ resultados: ResultadoBusqueda[] }>(`/api/conocimiento/buscar?q=${encodeURIComponent(consulta)}`);
      setResultados(r.resultados ?? []);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo buscar');
    } finally {
      setBuscando(false);
    }
  }

  const encontrado = resultados?.find((r) => r.activo) ?? null;

  return (
    <div className="rounded-otto border border-borde bg-lino p-3.5 md:p-4">
      <label htmlFor="probar-busqueda" className="mb-2 block text-[14px] font-medium text-grafito md:text-[13px]">
        Probá cómo lo encontraría un cliente
      </label>
      <form className="flex gap-2.5" onSubmit={buscar}>
        <input
          id="probar-busqueda"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          className="min-w-0 flex-1 rounded-otto border border-borde bg-hueso px-3 py-2.5 text-[14.5px] outline-none"
        />
        <button type="submit" disabled={buscando} className="flex-none rounded-otto border border-cobre bg-lino px-4 py-2.5 text-[14px] font-medium text-cobre disabled:opacity-50 md:text-[13.5px]">
          {buscando ? 'Buscando…' : 'Probar'}
        </button>
      </form>
      {error ? (
        <div className="mt-3 border-t border-borde-suave pt-3 text-sm text-ladrillo">{error}</div>
      ) : resultados !== null ? (
        <div className="mt-3 flex items-baseline gap-2.5 border-t border-borde-suave pt-3 text-sm leading-[1.5]">
          {encontrado ? (
            <>
              <span className="flex-none rounded-pill bg-salvia-suave px-2.5 py-0.5 text-[14px] font-medium text-salvia md:text-[11.5px]">Encontrado</span>
              <span className="min-w-0">
                <span className="font-serif text-[14px] font-semibold">{encontrado.titulo}</span> — «{encontrado.extracto}»
              </span>
            </>
          ) : (
            <>
              <span className="flex-none rounded-pill bg-ladrillo-suave px-2.5 py-0.5 text-[14px] font-medium text-ladrillo md:text-[11.5px]">No encontrado</span>
              <span className="text-grafito">Lucía no tendría qué contestar: falta un fragmento para esto{resultados.length > 0 ? ' activo' : ''}.</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

type Editable = { version: number; titulo: string; texto: string; activo: boolean };

function FragmentoCard({ f, onGuardado }: { f: FilaFragmento; onGuardado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [guardandoSwitch, setGuardandoSwitch] = useState(false);
  const [errorSwitch, setErrorSwitch] = useState<string | null>(null);
  // Una sola versión en juego para el switch y el editor de texto: si cada uno llevara la suya
  // por separado, tocar el switch y después Guardar el texto (o al revés) chocaría con un 409
  // porque el segundo mandaría una versión que la base ya dejó atrás.
  const edicion = useEdicion<Editable>({ version: f.version, titulo: f.t, texto: f.txt, activo: f.on });
  const { toast, mostrar } = useToastLocal();

  async function alternar(nuevo: boolean) {
    setErrorSwitch(null);
    setGuardandoSwitch(true);
    // Solo `activo` viaja: si había un título o un texto sin guardar en el editor, tocar el
    // switch no los pisa (la base no los toca porque no se los manda).
    const err = await edicion.guardar(`/api/conocimiento/fragmentos/${f.id}`, { activo: nuevo });
    if (err) setErrorSwitch(err);
    else onGuardado();
    setGuardandoSwitch(false);
  }

  async function guardar() {
    const err = await edicion.guardar(`/api/conocimiento/fragmentos/${f.id}`, { titulo: edicion.valor.titulo, texto: edicion.valor.texto, activo: edicion.valor.activo });
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      setEditando(false);
      onGuardado();
    }
  }

  const activo = edicion.valor.activo;
  return (
    <div className={`rounded-otto border border-borde p-3.5 ${activo ? 'bg-lino' : 'bg-[#FBFAF7]'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`min-w-0 flex-1 basis-full font-serif text-[15px] font-semibold md:basis-auto ${activo ? '' : 'text-grafito'}`}>{f.t}</span>
        <span className="text-[14px] tabular-nums text-grafito md:text-[11.5px]">{f.v}</span>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-grafito md:text-xs" title={errorSwitch ?? undefined}>
          {errorSwitch ? <span className="text-ladrillo">No se pudo guardar</span> : guardandoSwitch ? 'Guardando…' : activo ? 'Activo' : 'Inactivo'}
          <Switch checked={activo} onChange={alternar} ariaLabel={`${f.t} activo`} />
        </span>
        <button type="button" onClick={() => setEditando((e) => !e)} className="ml-auto rounded-[7px] border border-borde bg-lino px-3 py-1.5 text-[14px] font-medium text-cobre md:ml-0 md:text-[12.5px]">
          {editando ? 'Cerrar' : 'Editar'}
        </button>
      </div>
      {editando ? (
        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-borde-suave pt-2.5">
          <label className="flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]">
            Título
            <input value={edicion.valor.titulo} onChange={(e) => edicion.setValor({ ...edicion.valor, titulo: e.target.value })} className="w-full rounded-otto border border-borde px-2.5 py-2 text-sm outline-none focus:border-cobre" />
          </label>
          <label className="flex flex-col gap-1 text-[14px] font-medium text-grafito md:text-[11.5px]">
            Texto (lo que lee Lucía)
            <textarea
              value={edicion.valor.texto}
              onChange={(e) => edicion.setValor({ ...edicion.valor, texto: e.target.value })}
              className="min-h-24 w-full resize-none rounded-otto border border-borde px-2.5 py-2 text-sm leading-[1.5] outline-none focus:border-cobre"
            />
          </label>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={guardar} disabled={edicion.guardando} className="rounded-otto bg-cobre px-4 py-2 text-[14px] font-medium text-lino disabled:opacity-60">
              {edicion.guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={edicion.deshacer} disabled={!edicion.sucio || edicion.guardando} className="rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium text-grafito disabled:opacity-50">
              Deshacer
            </button>
            <button type="button" onClick={() => setHistorialAbierto(true)} className="ml-auto text-[14px] underline-offset-2 hover:underline">
              Ver versión anterior
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm leading-[1.55] text-grafito">{edicion.valor.texto}</div>
      )}
      {toast}
      {historialAbierto && <PanelHistorial tabla="fragmentos" id={f.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorialAbierto(false)} onRestaurado={onGuardado} />}
    </div>
  );
}

// Un toast mínimo, en el lugar (no flotante): esta tarjeta ya tiene su propio layout y no hace
// falta el patrón fijo de ToastFlotante para un mensaje de una línea.
function useToastLocal() {
  const [msj, setMsj] = useState<{ texto: string; error: boolean } | null>(null);
  function mostrar(texto: string, error: boolean) {
    setMsj({ texto, error });
    setTimeout(() => setMsj(null), 4000);
  }
  const toast = msj && <div className={`mt-2 text-[14px] ${msj.error ? 'text-ladrillo' : 'text-salvia'}`}>{msj.texto}</div>;
  return { toast, mostrar };
}

function Secciones({ secciones, onGuardado }: { secciones: SeccionConocimiento[]; onGuardado: () => void }) {
  const [abiertas, setAbiertas] = useState(() => new Set(secciones.filter((s) => s.n > 0).map((s) => s.tema)));
  const alternar = (tema: string) =>
    setAbiertas((prev) => {
      const sig = new Set(prev);
      if (sig.has(tema)) sig.delete(tema);
      else sig.add(tema);
      return sig;
    });

  return (
    <div className="overflow-hidden rounded-otto border border-borde bg-lino">
      {secciones.map((s) => {
        const abierta = abiertas.has(s.tema);
        return (
          <div key={s.tema} className="border-b border-borde-suave last:border-b-0">
            <button type="button" onClick={() => alternar(s.tema)} aria-expanded={abierta} className={`flex w-full items-center gap-2.5 px-3.5 py-3.5 text-left text-[14.5px] font-medium md:px-4.5 ${abierta ? 'bg-[#FBFAF7]' : ''}`}>
              <span className={abierta ? 'text-cobre' : 'text-grafito'} aria-hidden>
                {abierta ? '▾' : '▸'}
              </span>
              {s.titulo}
              <span className="ml-auto text-[14px] tabular-nums text-grafito md:text-xs">{s.n}</span>
            </button>
            {abierta && (
              <div className="flex flex-col gap-2.5 px-3.5 pb-4 pt-1 md:pl-9.5 md:pr-4.5">
                {s.fragmentos.length === 0 ? (
                  <div className="text-[14px] text-grafito md:text-[13px]">Sin fragmentos cargados para este tema.</div>
                ) : (
                  s.fragmentos.map((f) => <FragmentoCard key={f.id} f={f} onGuardado={onGuardado} />)
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Conocimiento({ secciones, onGuardado }: { secciones: SeccionConocimiento[]; onGuardado: () => void }) {
  return (
    <>
      <Buscador />
      <Secciones secciones={secciones} onGuardado={onGuardado} />
    </>
  );
}
