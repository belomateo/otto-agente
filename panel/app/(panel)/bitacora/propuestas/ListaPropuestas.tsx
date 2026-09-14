'use client';

// Tarjetas de propuestas. Pendiente: de dónde sale (cuántas charlas y un
// ejemplo textual), el texto sugerido y Aplicar · Editar y aplicar · Descartar.
// Aplicar y Descartar cambian el estado y muestran el Toast con Deshacer, que
// la devuelve a pendiente. «Aplicada con alerta» (el tester falló después de
// aplicar) va en Ladrillo, nombra el guion y tiene «Ver». Nada persiste: mock.

import { useState } from 'react';
import { Chip } from '@/components/ui-otto/Chip';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { usePropuestas } from '../PropuestasContexto';
import type { Propuesta } from './propuestas-mock';

const TIPO: Record<Propuesta['tipo'], { label: string; bg: string; fg: string }> = {
  fragmento: { label: 'Fragmento que faltó', bg: '#EEF1F5', fg: '#1F2A3C' },
  regla: { label: 'Regla que se rompió', bg: '#F7EFDD', fg: '#B8862B' },
  objecion: { label: 'Objeción sin guion', bg: '#F1E6D9', fg: '#A8703F' },
};

function Ejemplo({ p }: { p: Propuesta }) {
  return (
    <div className="flex flex-col gap-1 rounded-otto bg-hueso px-3 py-2.5 text-[14px] leading-[1.5] md:text-[13.5px]">
      <div>
        <span className="font-medium text-grafito">Cliente: </span>«{p.ejemplo.cliente}»
      </div>
      {p.ejemplo.lucia && (
        <div>
          <span className="font-medium text-grafito">Lucía: </span>«{p.ejemplo.lucia}»
        </div>
      )}
    </div>
  );
}

function TarjetaPendiente({ p, onAplicar, onDescartar }: { p: Propuesta; onAplicar: (texto: string) => void; onDescartar: () => void }) {
  const { cambiarSugerido } = usePropuestas();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(p.sugerido);
  const tipo = TIPO[p.tipo];

  return (
    <article className="flex flex-col gap-3 rounded-otto border border-borde bg-lino p-4 shadow-otto">
      <div className="flex flex-wrap items-center gap-2">
        <Chip bg={tipo.bg} fg={tipo.fg}>{tipo.label}</Chip>
        <span className="text-[14px] text-grafito md:text-[12.5px]">va a «{p.seccion}»</span>
      </div>
      <h2 className="font-serif text-[16px] font-semibold leading-snug">{p.titulo}</h2>
      <div className="text-[14px] text-grafito md:text-[13.5px]">{p.origen}</div>
      <Ejemplo p={p} />
      <div>
        <div className="mb-1.5 text-[14px] font-medium text-grafito md:text-[12.5px]">Texto sugerido</div>
        {editando ? (
          <textarea
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={4}
            aria-label="Texto sugerido"
            className={`w-full resize-y rounded-otto border px-3 py-2.5 text-[14.5px] leading-[1.5] outline-none ${
              borrador !== p.sugerido ? 'border-cobre' : 'border-borde'
            }`}
          />
        ) : (
          <div className="border-l-2 border-cobre-claro pl-3 text-[14.5px] leading-[1.55]">{p.sugerido}</div>
        )}
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
        {editando ? (
          <>
            <button
              type="button"
              onClick={() => {
                cambiarSugerido(p.id, borrador);
                setEditando(false);
                onAplicar(borrador);
              }}
              className="rounded-otto bg-cobre px-4 py-2.5 text-sm font-medium text-lino"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => {
                setBorrador(p.sugerido);
                setEditando(false);
              }}
              className="rounded-otto border border-borde bg-lino px-4 py-2.5 text-sm font-medium text-grafito"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onAplicar(p.sugerido)} className="rounded-otto bg-cobre px-4 py-2.5 text-sm font-medium text-lino">
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-otto border border-borde bg-lino px-4 py-2.5 text-sm font-medium text-tinta"
            >
              Editar y aplicar
            </button>
            <button type="button" onClick={onDescartar} className="rounded-otto px-4 py-2.5 text-sm font-medium text-grafito md:ml-auto">
              Descartar
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function TarjetaResuelta({ p }: { p: Propuesta }) {
  const aplicada = p.estado === 'aplicada';
  return (
    <article className="flex flex-wrap items-center gap-2.5 rounded-otto border border-borde bg-[#FBFAF7] px-4 py-3">
      <Chip estado={aplicada ? 'Confirmado' : 'Cerrada'}>{aplicada ? 'Aplicada' : 'Descartada'}</Chip>
      <span className="min-w-0 flex-1 font-serif text-[15px] font-semibold text-grafito">{p.titulo}</span>
    </article>
  );
}

function TarjetaAlerta({ p }: { p: Propuesta }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-otto border border-borde border-l-[3px] border-l-ladrillo bg-lino p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip estado="Urgente">Aplicada con alerta</Chip>
        <span className="text-[14px] text-grafito md:text-[12.5px]">va a «{p.seccion}»</span>
      </div>
      <h2 className="font-serif text-[16px] font-semibold leading-snug">{p.titulo}</h2>
      {p.alerta && (
        <div className="text-[14px] leading-[1.5] text-ladrillo md:text-[13.5px]">
          Falló el guion <span className="font-semibold">«{p.alerta.guion}»</span> al aplicarla ({p.alerta.fecha}): {p.alerta.detalle}
        </div>
      )}
      <div className="text-[14px] text-grafito md:text-[13.5px]">{p.origen}</div>
      <div className="flex flex-col gap-2 md:flex-row">
        <button type="button" className="rounded-otto border border-ladrillo bg-lino px-4 py-2.5 text-sm font-medium text-ladrillo">
          Ver
        </button>
      </div>
    </article>
  );
}

export function ListaPropuestas({ vacia }: { vacia: boolean }) {
  const { propuestas, cambiarEstado } = usePropuestas();
  const { toast, mostrar, cerrar } = useToast();

  if (vacia) {
    return (
      <div className="max-w-[860px] rounded-otto border border-borde bg-lino">
        <EstadoVacio
          titulo="No hay propuestas pendientes"
          texto="Cada noche Lucía repasa las charlas del día y, si algo le faltó, lo propone acá."
        />
      </div>
    );
  }

  const conAlerta = propuestas.filter((p) => p.estado === 'aplicada-con-alerta');
  const pendientes = propuestas.filter((p) => p.estado === 'pendiente');
  const resueltas = propuestas.filter((p) => p.estado === 'aplicada' || p.estado === 'descartada');

  const resolver = (p: Propuesta, estado: 'aplicada' | 'descartada') => {
    cambiarEstado(p.id, estado);
    mostrar({
      texto:
        estado === 'aplicada'
          ? `Aplicada · «${p.seccion}» queda activo para Lucía`
          : 'Descartada · no se vuelve a proponer igual',
      onAccion: () => cambiarEstado(p.id, 'pendiente'),
    });
  };

  return (
    <div className="flex max-w-[860px] flex-col gap-3.5">
      <div className="text-[14px] leading-[1.5] text-grafito md:text-[13.5px]">
        Lo que el análisis nocturno encontró en las charlas. Nada se aplica solo: al aplicar, corre el tester y si un guion
        falla la propuesta queda en rojo hasta que alguien la mire.
      </div>
      {conAlerta.map((p) => (
        <TarjetaAlerta key={p.id} p={p} />
      ))}
      {pendientes.map((p) => (
        <TarjetaPendiente key={p.id} p={p} onAplicar={() => resolver(p, 'aplicada')} onDescartar={() => resolver(p, 'descartada')} />
      ))}
      {pendientes.length === 0 && (
        <div className="rounded-otto border border-borde bg-lino">
          <EstadoVacio titulo="No hay propuestas pendientes" texto="Cada noche Lucía repasa las charlas del día y, si algo le faltó, lo propone acá." />
        </div>
      )}
      {resueltas.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="text-[14px] font-semibold uppercase tracking-[.05em] text-grafito md:text-[11px]">Resueltas hoy</div>
          {resueltas.map((p) => (
            <TarjetaResuelta key={p.id} p={p} />
          ))}
        </div>
      )}
      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </div>
  );
}
