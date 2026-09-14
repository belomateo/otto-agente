'use client';

// Los 10 componentes de DISENO.md § Componentes, cada uno rotulado y con los
// estados que pide el control de docs/hitos/1.1-sistema-visual.md. Los datos
// son los de ejemplo de DISENO.md; nada de acá se persiste.

import { useState } from 'react';
import { Chip } from '@/components/ui-otto/Chip';
import { FichaClienteCompacta, FichaClienteCompleta } from '@/components/ui-otto/FichaCliente';
import { BurbujaCliente, BurbujaLucia, BurbujaMostrador } from '@/components/ui-otto/Burbuja';
import { Bitacora } from '@/components/ui-otto/Bitacora';
import { BloqueTurno, ETIQUETA_ESTADO, type EstadoTurno } from '@/components/ui-otto/BloqueTurno';
import { EditorTexto } from '@/components/ui-otto/Editor';
import { Switch } from '@/components/ui-otto/Switch';
import { KpiCard } from '@/components/ui-otto/KpiCard';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { Toast } from '@/components/ui-otto/Toast';

const ESTADOS: EstadoTurno[] = ['sin-confirmar', 'confirmado', 'alquilo', 'retiro', 'devolvio', 'cancelado', 'no-vino'];

const BITACORA_EJEMPLO = {
  costo: '1.840 tokens · 3,2 s',
  pasos: [
    { tipo: 'ok' as const, texto: 'Clasificador → intención «alquiler» · urgencia baja' },
    { tipo: 'ok' as const, texto: 'consultar_catalogo(evento: casamiento)', codigo: true },
    { tipo: 'pensamiento' as const, texto: 'Ya tengo evento y rol, falta día/noche antes de mostrar looks. Anclé el valor antes del precio.' },
  ],
};

function Seccion({ n, titulo, nota, children }: { n: number; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5" aria-labelledby={`comp-${n}`}>
      <div className="flex items-baseline gap-2.5 border-b border-borde pb-2">
        <span className="font-serif text-[15px] font-semibold tabular-nums text-cobre">{n}</span>
        <h2 id={`comp-${n}`} className="font-serif text-[19px] font-semibold">
          {titulo}
        </h2>
        {nota && <span className="text-[14px] text-grafito md:text-[13px]">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-medium uppercase tracking-[.05em] text-grafito md:text-[11px]">{children}</div>;
}

export function Galeria() {
  const [avisoTurno, setAvisoTurno] = useState(true);
  const [toastVisible, setToastVisible] = useState<null | 'ok' | 'error'>(null);

  return (
    <div className="flex flex-col gap-8 px-4 py-5 md:px-8 md:py-6">
      <div>
        <div className="font-serif text-[22px] font-semibold">Componentes</div>
        <div className="mt-1 text-sm text-grafito">
          Galería de verificación del sistema visual (H1.1). Solo en desarrollo; no está en el menú.
        </div>
      </div>

      <Seccion n={1} titulo="Chip de estado" nota="una palabra, fondo suave">
        <div className="flex flex-wrap gap-2">
          <Chip estado="Confirmado">Confirmado</Chip>
          <Chip estado="Sin confirmar">Sin confirmar</Chip>
          <Chip estado="Urgente">Urgente</Chip>
          <Chip estado="Lucía">Lucía</Chip>
          <Chip estado="Persona">Persona</Chip>
          <Chip estado="Cerrada">Cerrada</Chip>
        </div>
      </Seccion>

      <Seccion n={2} titulo="Ficha de cliente" nota="compacta (una línea) y completa (tarjeta)">
        <div className="flex flex-col gap-4">
          <div>
            <Rotulo>Compacta</Rotulo>
            <div className="mt-2 rounded-otto border border-borde bg-lino px-4 py-3">
              <FichaClienteCompacta nombre="Nicolás Pereyra" resumen="Invitado · Casamiento 25/10 · Noche · Talle 48 · Turno sáb 10:15" />
            </div>
          </div>
          <div className="max-w-[460px]">
            <Rotulo>Completa</Rotulo>
            <div className="mt-2 bg-lino">
              <FichaClienteCompleta
                datos={{ nombre: 'Franco Bertolini', evento: 'Casamiento', fecha: '14/11 · noche', rol: 'Novio', talle: '50', ciudad: 'Rosario', color: 'Azul noche' }}
              />
            </div>
          </div>
        </div>
      </Seccion>

      <Seccion n={3} titulo="Burbuja de mensaje" nota="cliente · Lucía · mostrador">
        <div className="flex flex-col gap-3.5 rounded-otto border border-borde bg-hueso p-4">
          <BurbujaCliente texto="hola queria saber cuanto sale alquilar un traje" hora="10:01" />
          <BurbujaLucia texto="¡Hola! Soy Lucía, asistente de Mr. Otto. Claro que sí, te ayudo. ¿Para qué evento necesitás el traje?" hora="10:01" />
          <BurbujaLucia
            destacada
            texto="El alquiler a medida arranca desde $150.000 e incluye sastrería y tintorería antes y después del evento."
            hora="10:03"
            bitacora={BITACORA_EJEMPLO}
          />
          <BurbujaMostrador texto="Hola Nicolás, te escribo del local. Te esperamos el sábado a las 10:15; cualquier cosa, escribinos por acá." hora="10:10" autor="Equipo del local" inicial="E" />
        </div>
      </Seccion>

      <Seccion n={4} titulo="Bitácora desplegable + mini resumen" nota="plegada por defecto; la «i» la abre y la cierra">
        <div className="flex flex-col gap-3.5 rounded-otto border border-borde bg-hueso p-4">
          <Rotulo>Mini resumen en Ámbar (barandilla o error)</Rotulo>
          <BurbujaLucia
            destacada
            texto="Perfecto. Para un casamiento podemos trabajar desde un azul noche clásico hasta opciones más actuales. ¿Es de día o de noche?"
            hora="10:03"
            resumen={{ tono: 'ambar', texto: 'Rehecho: precio sin herramienta' }}
            bitacora={{
              ...BITACORA_EJEMPLO,
              pasos: [
                BITACORA_EJEMPLO.pasos[0],
                { tipo: 'error', texto: 'Barandilla: intentó dar un precio sin consultar el catálogo → rehecho' },
                ...BITACORA_EJEMPLO.pasos.slice(1),
              ],
            }}
          />
          <Rotulo>Mini resumen en Ladrillo (derivación)</Rotulo>
          <BurbujaLucia
            texto="Te paso con un asesor del local para que te ayude con tu evento, y vamos a hacer lo posible por encontrarte un lugar en la agenda."
            hora="09:48"
            resumen={{ tono: 'ladrillo', texto: 'Derivado: evento hoy o mañana' }}
            bitacora={{
              costo: '1.210 tokens · 2,1 s',
              pasos: [
                { tipo: 'ok', texto: 'Clasificador → intención «alquiler» · evento hoy' },
                { tipo: 'ok', texto: 'buscar_horarios(hoy, hoy, graduado) → derivar: evento_inminente', codigo: true },
                { tipo: 'ok', texto: 'Derivación dura (motivo: evento_inminente) con el texto fijo', codigo: true },
              ],
            }}
          />
          <Rotulo>El bloque de bitácora suelto</Rotulo>
          <div className="max-w-[480px]">
            <Bitacora pasos={BITACORA_EJEMPLO.pasos} costo={BITACORA_EJEMPLO.costo} advertencias={['Rehecho: precio sin herramienta']} />
          </div>
        </div>
      </Seccion>

      <Seccion n={5} titulo="Bloque de turno" nota="siete estados; el aviso se suma a cualquiera, nunca lo reemplaza">
        <div className="flex flex-col gap-3">
          <Switch label="Con aviso «Sin sincronizar con Google Calendar»" defaultChecked onChange={setAvisoTurno} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ESTADOS.map((estado) => (
              <div key={estado} className="flex flex-col gap-1.5">
                <Rotulo>{ETIQUETA_ESTADO[estado]}</Rotulo>
                <BloqueTurno
                  nombre="Franco Bertolini"
                  detalle={`Novio · 45’ · ${ETIQUETA_ESTADO[estado]}`}
                  estado={estado}
                  aviso={avisoTurno ? 'Sin sincronizar con Google Calendar' : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </Seccion>

      <Seccion n={6} titulo="Editor" nota="Guardar · Deshacer · Ver versión anterior">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Rotulo>Sin cambios</Rotulo>
            <EditorTexto label="Presentación" valorInicial="Hola, soy Lucía, asistente de Mr. Otto. ¿En qué puedo ayudarte hoy?" onGuardar={() => setToastVisible('ok')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Rotulo>Con cambios (borde Cobre) · Deshacer vuelve al valor inicial</Rotulo>
            <EditorTexto
              label="Presentación"
              multiline
              valorInicial="Hola, soy Lucía, asistente de Mr. Otto. ¿En qué puedo ayudarte hoy?"
              borradorInicial="Hola, soy Lucía, asistente de Mr. Otto. Contame para qué evento necesitás el traje y te ayudo."
              onGuardar={() => setToastVisible('ok')}
            />
          </div>
        </div>
      </Seccion>

      <Seccion n={7} titulo="Switch" nota="prendido · apagado · con etiqueta · chico">
        <div className="flex flex-wrap items-center gap-6 rounded-otto border border-borde bg-lino p-4">
          <Switch defaultChecked />
          <Switch defaultChecked={false} />
          <Switch label="Lucía lo puede mostrar" defaultChecked />
          <Switch label="Activo" defaultChecked size="sm" />
        </div>
      </Seccion>

      <Seccion n={8} titulo="Tarjeta de número del día" nota="número en serif, cifras tabulares">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard numero="23" label="Consultas" sub="hoy" />
          <KpiCard numero="7" label="Turnos agendados" sub="hoy" />
          <KpiCard numero="30%" label="Conversión" sub="consulta → turno" />
          <KpiCard numero="2" label="Derivaciones" sub="$4.120 de costo de IA" />
        </div>
      </Seccion>

      <Seccion n={9} titulo="Estado vacío" nota="el avatar «L» firma; no se lee como error">
        <div className="rounded-otto border border-borde bg-lino">
          <EstadoVacio titulo="Todavía no hay derivaciones" texto="Lucía está atendiendo sola." />
        </div>
      </Seccion>

      <Seccion n={10} titulo="Toast" nota="ok (✓) y error (✗), con su acción">
        <div className="flex max-w-[520px] flex-col gap-3">
          <Toast texto="Guardado · Lucía lo usa en el próximo mensaje" accion="Deshacer" onAccion={() => setToastVisible(null)} />
          <Toast variante="error" texto="No se guardó: el prompt tiene «{{» en la línea 12" accion="Ver" onAccion={() => setToastVisible(null)} />
        </div>
      </Seccion>

      {toastVisible && (
        <div className="fixed bottom-20 right-4 z-40 max-w-[calc(100vw-2rem)] md:bottom-6 md:right-7">
          <Toast
            variante={toastVisible}
            texto={toastVisible === 'ok' ? 'Guardado · Lucía lo usa en el próximo mensaje' : 'No se guardó'}
            accion="Deshacer"
            onAccion={() => setToastVisible(null)}
          />
        </div>
      )}
    </div>
  );
}
