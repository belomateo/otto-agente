'use client';

// Aprobar pasa la solicitud a Usuarios como Equipo; Rechazar la saca; Quitar
// saca a un usuario. Las tres muestran el Toast con Deshacer. Nada persiste.

import { Chip } from '@/components/ui-otto/Chip';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { ToastFlotante, useToast } from '@/components/ui-otto/ToastFlotante';
import { useAccesos } from '../AccesosContexto';
import { TARJETA } from '../AccionesEdicion';

const TITULO = 'text-[14px] font-medium text-grafito md:text-[13px]';

export function Accesos({ vacia }: { vacia: boolean }) {
  const { solicitudes, usuarios, aprobar, rechazar, quitar } = useAccesos();
  const { toast, mostrar, cerrar } = useToast();
  const pendientes = vacia ? [] : solicitudes;

  return (
    <>
      <section className={TARJETA} aria-labelledby="titulo-solicitudes">
        <h2 id="titulo-solicitudes" className={`mb-1 ${TITULO}`}>
          Solicitudes pendientes · <span className="tabular-nums">{pendientes.length}</span>
        </h2>
        {pendientes.length === 0 ? (
          <EstadoVacio
            titulo="No hay solicitudes pendientes"
            texto="Cuando alguien pida acceso desde el login, aparece acá para que lo apruebes."
          />
        ) : (
          pendientes.map((s) => (
            <div key={s.id} className="flex flex-col gap-2.5 border-t border-borde-suave py-3 first:border-t-0 md:flex-row md:items-center md:gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[15.5px] font-semibold">{s.nombre}</div>
                <div className="truncate text-[14px] text-grafito md:text-[13px]">
                  {s.email} · <span className="tabular-nums">{s.fecha}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => mostrar({ texto: `${s.nombre} ya puede entrar · Equipo`, onAccion: aprobar(s.id) })}
                  className="flex-1 rounded-otto bg-cobre px-4 py-2.5 text-sm font-medium text-lino md:flex-none"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => mostrar({ texto: `Solicitud de ${s.nombre} rechazada`, onAccion: rechazar(s.id) })}
                  className="flex-1 rounded-otto border border-borde bg-lino px-4 py-2.5 text-sm font-medium text-grafito md:flex-none"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className={TARJETA} aria-labelledby="titulo-usuarios">
        <h2 id="titulo-usuarios" className={`mb-1 ${TITULO}`}>
          Usuarios · <span className="tabular-nums">{usuarios.length}</span>
        </h2>
        {usuarios.map((u) => (
          <div key={u.id} className="flex min-h-fila items-center gap-3 border-t border-borde-suave py-2 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-[15px] font-semibold">{u.nombre}</div>
              <div className="truncate text-[14px] text-grafito md:text-[13px]">{u.email}</div>
            </div>
            <Chip bg={u.rol === 'admin' ? '#EEF1F5' : '#EFEDE8'} fg={u.rol === 'admin' ? '#1F2A3C' : '#5C6068'} className="flex-none">
              {u.rol === 'admin' ? 'Admin' : 'Equipo'}
            </Chip>
            <button
              type="button"
              onClick={() => mostrar({ texto: `${u.nombre} ya no puede entrar al panel`, onAccion: quitar(u.id) })}
              className="flex-none px-1 text-[14px] font-medium text-ladrillo md:text-[13px]"
            >
              Quitar
            </button>
          </div>
        ))}
      </section>

      <ToastFlotante toast={toast} onCerrar={cerrar} />
    </>
  );
}
