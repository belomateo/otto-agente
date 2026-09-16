'use client';

// Solicitudes pendientes: de AccesosContexto (vive en el layout, así el número de la
// subpestaña se entera junto con Aprobar/Rechazar). Aprobar deja a la persona como 'equipo'
// (lo decide el servidor si no se manda `rol`); no hay un botón para aprobar como admin — se
// puede subir el rol después desde la base, PROCESOS.md no pide más que esto por ahora.
//
// "Usuarios" es una aproximación: GET /api/accesos?estado=aprobada lista solicitudes
// resueltas, no un directorio de cuentas — no trae el rol actual de cada una (ese dato no se
// puede listar desde el panel), así que no se muestra un chip Admin/Equipo que sería
// inventado. "Quitar" queda deshabilitado: no hay ruta para sacarle el acceso a alguien.
//
// Con un usuario 'equipo' (no admin), los dos pedidos dan 403: se explica en vez de mostrar
// una pantalla a medias.

import { useState } from 'react';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { Cargando } from '@/components/ui-otto/Cargando';
import { useDatos } from '@/components/api/useDatos';
import { useToastLocal } from '@/components/ui-otto/useToastLocal';
import { useAccesos } from '../AccesosContexto';
import { TARJETA } from '../AccionesEdicion';
import type { SolicitudAcceso } from '@/lib/queries/accesos';

const SIN_CONECTAR = 'Todavía no conectado: no hay ruta para sacarle el acceso a alguien.';
const TITULO = 'text-[14px] font-medium text-grafito md:text-[13px]';

function FilaSolicitud({ s, onAprobar, onRechazar, ocupado }: { s: SolicitudAcceso; onAprobar: () => void; onRechazar: () => void; ocupado: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-borde-suave py-3 first:border-t-0 md:flex-row md:items-center md:gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[15.5px] font-semibold">{s.nombre ?? 'Sin nombre'}</div>
        <div className="truncate text-[14px] text-grafito md:text-[13px]">
          {s.email ?? '—'} · <span className="tabular-nums">{s.hace}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onAprobar} disabled={ocupado} className="flex-1 rounded-otto bg-cobre px-4 py-2.5 text-sm font-medium text-lino disabled:opacity-50 md:flex-none">
          Aprobar
        </button>
        <button type="button" onClick={onRechazar} disabled={ocupado} className="flex-1 rounded-otto border border-borde bg-lino px-4 py-2.5 text-sm font-medium text-grafito disabled:opacity-50 md:flex-none">
          Rechazar
        </button>
      </div>
    </div>
  );
}

export function Accesos() {
  const { pendientes, cargando, error, aprobar, rechazar } = useAccesos();
  const { datos: aprobadas, cargando: cargandoAprobadas, error: errorAprobadas } = useDatos<{ solicitudes: SolicitudAcceso[] }>('/api/accesos?estado=aprobada');
  const { toast, mostrar } = useToastLocal();
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  if (cargando && pendientes.length === 0 && !error) return <Cargando />;
  if (error) return <EstadoError mensaje={`No se pudo abrir Accesos: ${error}`} />;

  async function resolver(id: string, nombre: string, accion: 'aprobar' | 'rechazar') {
    setOcupadoId(id);
    const err = await (accion === 'aprobar' ? aprobar(id) : rechazar(id));
    setOcupadoId(null);
    if (err) mostrar(err, true);
    else mostrar(accion === 'aprobar' ? `${nombre} ya puede entrar · Equipo` : `Solicitud de ${nombre} rechazada`, false);
  }

  return (
    <>
      <section className={TARJETA} aria-labelledby="titulo-solicitudes">
        <h2 id="titulo-solicitudes" className={`mb-1 ${TITULO}`}>
          Solicitudes pendientes · <span className="tabular-nums">{pendientes.length}</span>
        </h2>
        {pendientes.length === 0 ? (
          <EstadoVacio titulo="No hay solicitudes pendientes" texto="Cuando alguien pida acceso desde el login, aparece acá para que lo apruebes." />
        ) : (
          pendientes.map((s) => (
            <FilaSolicitud
              key={s.id}
              s={s}
              ocupado={ocupadoId === s.id}
              onAprobar={() => resolver(s.id, s.nombre ?? 'La persona', 'aprobar')}
              onRechazar={() => resolver(s.id, s.nombre ?? 'La persona', 'rechazar')}
            />
          ))
        )}
      </section>

      <section className={TARJETA} aria-labelledby="titulo-usuarios">
        <h2 id="titulo-usuarios" className={`mb-1 ${TITULO}`}>
          Usuarios aprobados{!errorAprobadas && aprobadas ? <> · <span className="tabular-nums">{aprobadas.solicitudes.length}</span></> : null}
        </h2>
        {cargandoAprobadas && !aprobadas ? (
          <Cargando />
        ) : errorAprobadas ? (
          <div className="text-[14px] text-grafito">{errorAprobadas}</div>
        ) : aprobadas?.solicitudes.length === 0 ? (
          <div className="py-2 text-[14px] text-grafito">Todavía no se aprobó a nadie.</div>
        ) : (
          aprobadas?.solicitudes.map((u) => (
            <div key={u.id} className="flex min-h-fila items-center gap-3 border-t border-borde-suave py-2 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-[15px] font-semibold">{u.nombre ?? 'Sin nombre'}</div>
                <div className="truncate text-[14px] text-grafito md:text-[13px]">
                  {u.email ?? '—'} · aprobado {u.hace}
                </div>
              </div>
              <button type="button" disabled title={SIN_CONECTAR} className="flex-none px-1 text-[14px] font-medium text-ladrillo/50 md:text-[13px]">
                Quitar
              </button>
            </div>
          ))
        )}
      </section>

      {toast}
    </>
  );
}
