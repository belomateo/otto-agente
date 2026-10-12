'use client';

import { useCallback, useState } from 'react';
import { enviar } from '@/components/api/cliente';
import { useDatos } from '@/components/api/useDatos';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import type {
  AnalisisCorrector,
  CorreccionDetalle,
  CorreccionResumen,
  ListaCorrecciones,
  OpcionAnalisis,
} from '@/lib/queries/corrector';

const ROTULO = 'text-[14px] font-semibold uppercase tracking-[.06em] text-grafito md:text-[11px]';

const COLOR_ESTADO: Record<string, string> = {
  analizada: 'bg-amber-100 text-amber-800',
  probando: 'bg-blue-100 text-blue-800',
  aplicada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-red-100 text-red-800',
  descartada: 'bg-stone-200 text-grafito',
};

function Chip({ estado, etiqueta }: { estado: string; etiqueta: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[12px] font-medium ${COLOR_ESTADO[estado] ?? 'bg-stone-200 text-grafito'}`}>
      {etiqueta}
    </span>
  );
}

function FormularioPedido({ onEnviado }: { onEnviado: () => void }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviarPedido = async () => {
    if (!texto.trim() || texto.trim().length < 3) return;
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/bitacora/corrector', 'POST', { pedido: texto.trim() });
      setTexto('');
      onEnviado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-otto border border-borde bg-lino p-4">
      <label className={ROTULO}>Pedir un cambio</label>
      <p className="mt-1 text-[13px] leading-[1.55] text-grafito">
        Escribí qué querés que Lucía haga distinto. El corrector lo analiza, arma el cambio y lo prueba con charlas invisibles antes de aplicarlo.
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ej: que no ofrezca descuentos, que pregunte el mail antes de agendar…"
        rows={3}
        maxLength={2000}
        disabled={enviando}
        className="mt-2 w-full resize-y rounded-otto border border-borde bg-hueso px-3 py-2 text-[14px] text-tinta outline-none placeholder:text-grafito/50 focus:border-cobre disabled:opacity-50"
      />
      {error && <p className="mt-1.5 text-[13px] text-ladrillo">{error}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12px] tabular-nums text-grafito">{texto.length}/2000</span>
        <button
          onClick={enviarPedido}
          disabled={enviando || texto.trim().length < 3}
          className="rounded-otto bg-cobre px-4 py-1.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {enviando ? 'Analizando…' : 'Analizar'}
        </button>
      </div>
    </div>
  );
}

function TarjetaOpcion({
  opcion,
  indice,
  correccionId,
  onElegida,
}: {
  opcion: OpcionAnalisis;
  indice: number;
  correccionId: string;
  onElegida: () => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegir = async () => {
    setEligiendo(true);
    setError(null);
    try {
      await enviar(`/api/bitacora/corrector/${correccionId}`, 'POST', { opcion: opcion.tipo, indice });
      onElegida();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar');
    } finally {
      setEligiendo(false);
    }
  };

  return (
    <div className="rounded-otto border border-borde bg-hueso p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[13px] font-medium text-tinta">
            {opcion.tipo === 'editar' ? 'Editar' : 'Agregar'} — {opcion.destino}
          </span>
          <p className="mt-0.5 text-[13px] leading-[1.5] text-grafito">{opcion.descripcion}</p>
        </div>
        <button
          onClick={elegir}
          disabled={eligiendo}
          className="flex-none rounded-otto border border-cobre px-3 py-1 text-[13px] font-medium text-cobre transition-colors hover:bg-cobre hover:text-white disabled:opacity-40"
        >
          {eligiendo ? 'Probando…' : 'Elegir'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[13px] text-ladrillo">{error}</p>}
    </div>
  );
}

function DetalleCorreccion({ correccion, onCambio }: { correccion: CorreccionDetalle; onCambio: () => void }) {
  const [descartando, setDescartando] = useState(false);

  const descartar = async () => {
    setDescartando(true);
    try {
      await enviar(`/api/bitacora/corrector/${correccion.id}`, 'DELETE');
      onCambio();
    } catch {
      setDescartando(false);
    }
  };

  const analisis = correccion.analisis;

  return (
    <div className="mt-3 space-y-3">
      {analisis.contradicciones && analisis.contradicciones.length > 0 && (
        <div>
          <h3 className={`mb-1.5 ${ROTULO}`}>Lo que contradice</h3>
          <div className="space-y-2">
            {analisis.contradicciones.map((c, i) => (
              <div key={i} className="rounded-otto border border-borde bg-hueso px-3 py-2 text-[13px] leading-[1.5] text-tinta">
                {c.texto}
                {c.cita && <span className="mt-1 block text-[12px] italic text-grafito">«{c.cita}»</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {correccion.estado === 'analizada' && analisis.opciones && analisis.opciones.length > 0 && (
        <div>
          <h3 className={`mb-1.5 ${ROTULO}`}>Opciones</h3>
          <div className="space-y-2">
            {analisis.opciones.map((o, i) => (
              <TarjetaOpcion key={i} opcion={o} indice={i} correccionId={correccion.id} onElegida={onCambio} />
            ))}
          </div>
        </div>
      )}

      {correccion.resultado && (
        <div className="rounded-otto border border-borde bg-hueso px-3 py-2 text-[14px] leading-[1.55] text-tinta">{correccion.resultado}</div>
      )}

      {correccion.pruebas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[13px] font-medium text-grafito">
            Pruebas ({correccion.pruebas_ok}/{correccion.pruebas_total})
          </summary>
          <div className="mt-2 space-y-2">
            {correccion.pruebas.map((p) => (
              <div key={p.id} className="rounded-otto border border-borde bg-hueso px-3 py-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className={p.estado === 'paso' ? 'text-emerald-700' : p.estado === 'fallo' ? 'text-ladrillo' : 'text-grafito'}>
                    {p.estado === 'paso' ? '✓' : p.estado === 'fallo' ? '✗' : '—'}
                  </span>
                  <span className="font-medium text-tinta">{p.nombre}</span>
                </div>
                {p.motivo && <p className="mt-1 text-[12px] text-grafito">{p.motivo}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {(correccion.estado === 'analizada' || correccion.estado === 'probando') && (
        <button
          onClick={descartar}
          disabled={descartando}
          className="text-[13px] font-medium text-grafito underline decoration-borde underline-offset-2 hover:text-ladrillo disabled:opacity-40"
        >
          {descartando ? 'Descartando…' : 'Descartar'}
        </button>
      )}
    </div>
  );
}

function TarjetaCorreccion({ c, onCambio }: { c: CorreccionResumen; onCambio: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [detalle, setDetalle] = useState<CorreccionDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const abrir = async () => {
    if (abierta) {
      setAbierta(false);
      return;
    }
    setAbierta(true);
    if (detalle) return;
    setCargandoDetalle(true);
    try {
      const d = await (await fetch(`/api/bitacora/corrector/${c.id}`, { cache: 'no-store' })).json();
      setDetalle(d);
    } catch { /* ignore */ }
    setCargandoDetalle(false);
  };

  const recargar = useCallback(async () => {
    try {
      const d = await (await fetch(`/api/bitacora/corrector/${c.id}`, { cache: 'no-store' })).json();
      setDetalle(d);
    } catch { /* ignore */ }
    onCambio();
  }, [c.id, onCambio]);

  return (
    <div className="rounded-otto border border-borde bg-lino">
      <button onClick={abrir} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-[1.5] text-tinta">{c.pedido}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-grafito">
            <span>{c.creada}</span>
            {c.pedida_por && <span>· {c.pedida_por}</span>}
            {c.etiqueta_destino && <span>· {c.etiqueta_destino}</span>}
            <span>· {c.costo}</span>
          </div>
        </div>
        <Chip estado={c.estado} etiqueta={c.etiqueta_estado} />
      </button>
      {abierta && (
        <div className="border-t border-borde px-4 pb-4 pt-2">
          {cargandoDetalle && !detalle && <Cargando />}
          {detalle && <DetalleCorreccion correccion={detalle} onCambio={recargar} />}
        </div>
      )}
    </div>
  );
}

export default function CorrectorPage() {
  const { datos, cargando, error, recargar } = useDatos<ListaCorrecciones>('/api/bitacora/corrector');

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  if (!datos.activo) {
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3 md:px-6 md:pt-4">
        <div className="rounded-otto border border-borde bg-lino">
          <EstadoVacio
            titulo="El corrector todavía no está activado"
            texto="Falta aplicar la migración 0104 y publicar la función corrector. Una vez activo, desde acá podés pedir cambios en cómo atiende Lucía."
          />
        </div>
      </div>
    );
  }

  const cerradas = datos.correcciones.filter((c) => c.estado === 'aplicada' || c.estado === 'rechazada' || c.estado === 'descartada');
  const abiertas = datos.correcciones.filter((c) => c.estado === 'analizada' || c.estado === 'probando');

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3 md:px-6 md:pt-4">
      <p className="text-[14px] leading-[1.55] text-grafito md:text-[13px]">
        Pedí un cambio en cómo atiende Lucía. El corrector lo analiza, arma la corrección, la prueba con charlas invisibles y, si pasa todo, la aplica solo.
      </p>

      <div className="mt-4">
        <FormularioPedido onEnviado={recargar} />
      </div>

      {abiertas.length > 0 && (
        <section className="mt-5">
          <h2 className={`mb-2.5 ${ROTULO}`}>Pendientes · {abiertas.length}</h2>
          <div className="flex flex-col gap-3">
            {abiertas.map((c) => (
              <TarjetaCorreccion key={c.id} c={c} onCambio={recargar} />
            ))}
          </div>
        </section>
      )}

      {cerradas.length > 0 && (
        <section className="mt-5">
          <h2 className={`mb-2.5 ${ROTULO}`}>Historial · {cerradas.length}</h2>
          <div className="flex flex-col gap-3">
            {cerradas.map((c) => (
              <TarjetaCorreccion key={c.id} c={c} onCambio={recargar} />
            ))}
          </div>
        </section>
      )}

      {datos.correcciones.length === 0 && (
        <div className="mt-4 rounded-otto border border-borde bg-lino">
          <EstadoVacio
            titulo="Todavía no se pidió ninguna corrección"
            texto="Usá el formulario de arriba para pedir un cambio. El corrector se encarga de analizarlo, probarlo y aplicarlo."
          />
        </div>
      )}
    </div>
  );
}
