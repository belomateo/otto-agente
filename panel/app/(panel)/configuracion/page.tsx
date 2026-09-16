'use client';

// Configuración › Lucía — conectado a GET /api/configuracion (reglas, contexto) y
// GET/PUT /api/configuracion/prompt-base (H1.8/H1.9, paneles). El contexto real son 7 claves
// fijas de contexto_agente (presentacion, tono, ancla_de_valor y los 4 textos de derivación/
// turno), no un solo cuadro de texto libre como en el mock: cada una se edita por separado.
// Las reglas no se borran desde el panel (la entidad no es `borrable`): "Activa" en false es
// cómo se deja de aplicar una sin perder su historial ni renumerar las demás.

import { useEffect, useState } from 'react';
import { Cargando } from '@/components/ui-otto/Cargando';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { PanelHistorial } from '@/components/api/PanelHistorial';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useDatos } from '@/components/api/useDatos';
import { useEdicion } from '@/components/api/useEdicion';
import { useToastLocal } from '@/components/ui-otto/useToastLocal';
import { AccionesEdicion, CAMPO, ETIQUETA, TARJETA } from './AccionesEdicion';
import { useConfiguracion } from './ConfiguracionContexto';
import type { Configuracion } from '@/lib/queries/configuracion';

const SIN_CONECTAR = 'Todavía no conectado';

type FilaContexto = Configuracion['contexto'][number];
type FilaRegla = Configuracion['reglas'][number];

const LABEL_CONTEXTO: Record<string, string> = {
  presentacion: 'Presentación — lo primero que dice en cada charla nueva',
  tono: 'Tono — cómo habla',
  ancla_de_valor: 'Ancla de valor — por qué elegir Mr. Otto',
  texto_derivacion_dura_generica: 'Derivación genérica — cuando pasa la charla a una persona sin un motivo más puntual',
  texto_evento_inminente: 'Evento hoy o mañana — cuando deriva porque el evento ya está encima',
  texto_mensaje_no_soportado: 'Mensaje no soportado — cuando el cliente manda algo que no puede leer (audio, ubicación…)',
  texto_turno_confirmado: 'Turno confirmado — lo que dice al agendar',
};
// El orden en que se editan: presentación primero (ya tenía su lugar en el canvas), el resto
// alfabético por clave para que sea estable entre cargas.
const ORDEN_CONTEXTO = ['presentacion', 'tono', 'ancla_de_valor', 'texto_turno_confirmado', 'texto_evento_inminente', 'texto_derivacion_dura_generica', 'texto_mensaje_no_soportado'];

function TarjetaLucia() {
  return (
    <div className={`flex items-center gap-3 md:gap-4 ${TARJETA}`}>
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-pill bg-noche font-serif text-xl font-semibold text-hueso md:h-14 md:w-14 md:text-[26px]">L</div>
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[15px] font-semibold md:text-[17px]">Lucía</div>
        <div className="text-[14px] text-grafito md:text-[13px]">Asistente de WhatsApp de Mr. Otto · alquiler</div>
      </div>
      <button type="button" disabled title={SIN_CONECTAR} className="hidden flex-none rounded-otto border border-borde bg-lino px-3.5 py-2 text-[14px] font-medium text-[#8A8578] md:block md:text-[13px]">
        Cambiar avatar
      </button>
    </div>
  );
}

function ContextoEditable({ fila, onCambio }: { fila: FilaContexto; onCambio: () => void }) {
  const edicion = useEdicion({ version: fila.version, valor: fila.valor });
  const { toast, mostrar } = useToastLocal();
  const [historial, setHistorial] = useState(false);
  const corto = fila.clave === 'presentacion' || fila.clave === 'tono' || fila.clave === 'ancla_de_valor';

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/contexto/${fila.id}`, { valor: edicion.valor.valor });
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onCambio();
    }
  }

  return (
    <div className={TARJETA}>
      <label className={ETIQUETA}>{LABEL_CONTEXTO[fila.clave] ?? fila.clave}</label>
      {corto ? (
        <input value={edicion.valor.valor} onChange={(e) => edicion.setValor({ ...edicion.valor, valor: e.target.value })} className={CAMPO} />
      ) : (
        <textarea value={edicion.valor.valor} onChange={(e) => edicion.setValor({ ...edicion.valor, valor: e.target.value })} rows={3} className={`${CAMPO} resize-y leading-[1.6]`} />
      )}
      {toast}
      <AccionesEdicion sucio={edicion.sucio} guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} onVerHistorial={() => setHistorial(true)} />
      {historial && <PanelHistorial tabla="contexto_agente" id={fila.id} versionActual={edicion.guardado.version} onCerrar={() => setHistorial(false)} onRestaurado={onCambio} />}
    </div>
  );
}

function ReglaEditable({ regla, onCambio }: { regla: FilaRegla; onCambio: () => void }) {
  const edicion = useEdicion({ version: regla.version, numero: regla.numero, texto: regla.texto, activo: regla.activo });
  const { toast, mostrar } = useToastLocal();

  async function guardar() {
    const err = await edicion.guardar(`/api/configuracion/reglas/${regla.id}`, edicion.valor);
    if (err) mostrar(err, true);
    else {
      mostrar('Guardado', false);
      onCambio();
    }
  }

  return (
    <div className="border-t border-borde-suave py-2">
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={edicion.valor.numero}
          onChange={(e) => edicion.setValor({ ...edicion.valor, numero: Number(e.target.value) || 1 })}
          aria-label={`Orden de la regla ${regla.numero}`}
          className="w-[52px] flex-none rounded-otto border border-borde bg-lino px-1.5 py-1 text-center font-serif text-sm font-semibold tabular-nums text-cobre outline-none focus:border-cobre"
        />
        <input
          value={edicion.valor.texto}
          onChange={(e) => edicion.setValor({ ...edicion.valor, texto: e.target.value })}
          placeholder="Escribí la regla"
          aria-label={`Regla ${regla.numero}`}
          className="min-w-0 flex-1 rounded-otto border border-transparent px-1.5 py-1 text-[14.5px] leading-[1.5] outline-none hover:border-borde focus:border-cobre"
        />
        <label className="flex flex-none items-center gap-1.5 text-[14px] text-grafito md:text-xs">
          <input type="checkbox" checked={edicion.valor.activo} onChange={(e) => edicion.setValor({ ...edicion.valor, activo: e.target.checked })} />
          Activa
        </label>
      </div>
      {toast}
      {edicion.sucio && (
        <div className="mt-1.5">
          <AccionesEdicion sucio guardando={edicion.guardando} onGuardar={guardar} onDeshacer={edicion.deshacer} />
        </div>
      )}
    </div>
  );
}

function NuevaRegla({ onCreado }: { onCreado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/configuracion/reglas', 'POST', { texto });
      setTexto('');
      setAbierto(false);
      onCreado();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-2.5 flex-none self-start rounded-[7px] border border-cobre bg-lino px-3 py-1.5 text-[14px] font-medium text-cobre md:text-[12.5px]">
        Agregar regla
      </button>
    );
  }

  return (
    <div className="mt-2.5 flex items-center gap-2">
      <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribí la regla nueva" autoFocus className="min-w-0 flex-1 rounded-otto border border-borde bg-lino px-2.5 py-1.5 text-[14.5px] outline-none focus:border-cobre" />
      <button type="button" onClick={crear} disabled={enviando || !texto.trim()} className="flex-none rounded-otto bg-cobre px-3.5 py-1.5 text-[14px] font-medium text-lino disabled:opacity-50">
        {enviando ? 'Creando…' : 'Crear'}
      </button>
      <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="flex-none rounded-otto border border-borde bg-lino px-3 py-1.5 text-[14px] font-medium text-grafito">
        Cancelar
      </button>
      {error && <div className="text-[13px] text-ladrillo">{error}</div>}
    </div>
  );
}

type RespuestaPrompt = { prompt: { id: string; texto: string; version: number; editado_por: string | null; editado_at: string } | null; generador_disponible: boolean };

function PromptBase() {
  const { datos, recargar } = useDatos<RespuestaPrompt>('/api/configuracion/prompt-base');
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [sincronizado, setSincronizado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const { toast, mostrar } = useToastLocal();

  useEffect(() => {
    if (datos && !sincronizado) {
      setTexto(datos.prompt?.texto ?? '');
      setSincronizado(true);
    }
  }, [datos, sincronizado]);

  async function guardar() {
    setGuardando(true);
    try {
      await enviar('/api/configuracion/prompt-base', 'PUT', { version: datos?.prompt?.version ?? 1, texto });
      mostrar('Prompt validado y guardado · Lucía lo usa en menos de un minuto', false);
      recargar();
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo guardar', true);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-otto border border-borde bg-lino">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-3.5 text-left md:px-4.5">
        <span className="text-grafito" aria-hidden>
          {abierto ? '▾' : '▸'}
        </span>
        <span className="flex-1 text-sm font-medium">Avanzado: prompt base</span>
        <span className="basis-full text-[14px] text-grafito md:basis-auto md:text-xs">solo si sabés lo que hacés · «Validar y guardar» avisa en rojo si no pasa</span>
      </button>
      {abierto && (
        <div className="border-t border-borde-suave px-3.5 pb-4 pt-3 md:px-4.5">
          {datos && !datos.generador_disponible && (
            <div className="mb-2.5 text-[14px] text-ambar md:text-[13px]">
              El generador que valida el prompt no está disponible en este entorno: al guardar, la API lo va a decir.
            </div>
          )}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} aria-label="Prompt base" className="w-full resize-y rounded-otto border border-borde px-3 py-2.5 font-mono text-[14px] leading-[1.55] outline-none focus:border-cobre md:text-[13px]" />
          {toast}
          <button type="button" onClick={guardar} disabled={guardando || !texto.trim()} className="mt-2.5 rounded-otto border border-cobre bg-lino px-4 py-2.5 text-sm font-medium text-cobre disabled:opacity-50">
            {guardando ? 'Validando…' : 'Validar y guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConfiguracionLuciaPage() {
  const { datos, cargando, error, recargar } = useConfiguracion();

  if (cargando && !datos) return <Cargando />;
  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!datos) return null;

  const contextoOrdenado = [...datos.contexto].sort((a, b) => ORDEN_CONTEXTO.indexOf(a.clave) - ORDEN_CONTEXTO.indexOf(b.clave));

  return (
    <>
      <TarjetaLucia />

      {contextoOrdenado.map((c) => (
        <ContextoEditable key={`${c.id}-${c.version}`} fila={c} onCambio={recargar} />
      ))}

      <div className={TARJETA}>
        <div className="mb-1 text-[14px] font-medium text-grafito md:text-[13px]">Reglas — Lucía las cumple siempre, en orden</div>
        {datos.reglas.map((r) => (
          <ReglaEditable key={`${r.id}-${r.version}`} regla={r} onCambio={recargar} />
        ))}
        <NuevaRegla onCreado={recargar} />
      </div>

      <PromptBase />
    </>
  );
}
