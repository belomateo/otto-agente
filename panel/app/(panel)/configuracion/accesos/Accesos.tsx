'use client';

// Solicitudes pendientes: de AccesosContexto (vive en el layout, así el número de la
// subpestaña se entera junto con Aprobar/Rechazar). Aprobar deja a la persona como 'equipo'
// (lo decide el servidor si no se manda `rol`); no hay un botón para aprobar como admin — se
// puede subir el rol después desde la base, PROCESOS.md no pide más que esto por ahora.
//
// "Usuarios" es una aproximación: GET /api/accesos?estado=aprobada lista solicitudes
// resueltas, no un directorio de cuentas — no trae el rol actual de cada una (ese dato no se
// puede listar desde el panel), así que no se muestra un chip Admin/Equipo que sería
// inventado. "Quitar" pasa por DELETE /api/accesos/usuarios/[id] con el perfil_id de la
// solicitud (no su propio id): saca el acceso reusando perfiles.estado = 'rechazado'. Solo
// admin; la base sola frena que alguien se saque el acceso a sí mismo (42501).
//
// Con un usuario 'equipo' (no admin), los dos pedidos dan 403: se explica en vez de mostrar
// una pantalla a medias.

import { useState } from 'react';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { EstadoError } from '@/components/ui-otto/EstadoError';
import { EstadoVacio } from '@/components/ui-otto/EstadoVacio';
import { Cargando } from '@/components/ui-otto/Cargando';
import { useDatos } from '@/components/api/useDatos';
import { useToastLocal } from '@/components/ui-otto/useToastLocal';
import { haceCuanto } from '@/lib/formato';
import { useAccesos } from '../AccesosContexto';
import { TARJETA, ETIQUETA, CAMPO } from '../AccionesEdicion';
import type { SolicitudAcceso } from '@/lib/queries/accesos';

const TITULO = 'text-[14px] font-medium text-grafito md:text-[13px]';

// Rol de invitación: en la base es 'admin'/'equipo' (perfiles.rol, mismos valores que ya usa
// el resto del panel); Mateo los llama "Administrador"/"Colaborador" y así se muestran acá —
// la traducción es solo de pantalla, nunca se manda 'colaborador' a la API.
type RolInvitacion = 'equipo' | 'admin';
const ETIQUETA_ROL: Record<RolInvitacion, string> = { equipo: 'Colaborador', admin: 'Administrador' };

// Contrato con paneles (8e, 17/9): la tabla no tiene id propio, el email es la clave — se usa
// tal cual como key de React y en la URL del DELETE. `usado_at` no nulo = ya se registró con
// esa invitación (no es "sin usar" y no va en la lista de "Invitaciones enviadas").
type Invitacion = { email: string; rol: RolInvitacion; invitado_por: string | null; creado_at: string; usado_at: string | null };

// Pedido de Mateo 17/9: invitar por mail es en realidad pre-aprobación, no un mail real — la
// persona se registra con ese email y entra directo con el rol elegido, sin pasar por
// Solicitudes pendientes. Si la pantalla no lo dice, la dueña invita y se queda esperando un
// mail que no existe (H1.10, contrato con paneles: POST/GET/DELETE /api/accesos/invitaciones).
function InvitarAcceso({ onInvitada }: { onInvitada: () => void }) {
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<RolInvitacion>('equipo');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invitar() {
    setEnviando(true);
    setError(null);
    try {
      await enviar('/api/accesos/invitaciones', 'POST', { email: email.trim(), rol });
      setEmail('');
      setRol('equipo');
      onInvitada();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo invitar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className={TARJETA} aria-labelledby="titulo-invitar">
      <h2 id="titulo-invitar" className={`mb-2.5 ${TITULO}`}>
        Invitar a alguien
      </h2>
      <div className="flex flex-col gap-2.5 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <label className={ETIQUETA}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
            disabled={enviando}
            className={CAMPO}
          />
        </div>
        <div className="md:w-[180px]">
          <label className={ETIQUETA}>Rol</label>
          <select value={rol} onChange={(e) => setRol(e.target.value as RolInvitacion)} disabled={enviando} className={CAMPO}>
            <option value="equipo">Colaborador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button
          type="button"
          onClick={invitar}
          disabled={enviando || !email.trim()}
          className="flex-none rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50"
        >
          {enviando ? 'Invitando…' : 'Invitar'}
        </button>
      </div>
      <div className="mt-2.5 text-[14px] leading-[1.45] text-grafito md:text-[13px]">
        No se manda ningún mail: pasale vos el link del panel. Cuando se registre con ese mail va a entrar directo como {ETIQUETA_ROL[rol]}, sin esperar aprobación.
      </div>
      {rol === 'admin' && (
        <div className="mt-1.5 text-[14px] font-medium text-ladrillo md:text-[13px]">
          Administrador tiene control total del panel, incluido sacarle el acceso a otros.
        </div>
      )}
      {error && <div className="mt-1.5 text-[14px] text-ladrillo md:text-[13px]">{error}</div>}
    </section>
  );
}

function InvitacionesEnviadas({
  datos,
  cargando,
  error,
  recargar,
}: {
  datos: { invitaciones: Invitacion[] } | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}) {
  const sinUsar = datos?.invitaciones.filter((i) => !i.usado_at) ?? [];
  const { toast, mostrar } = useToastLocal();
  const [ocupadoEmail, setOcupadoEmail] = useState<string | null>(null);

  async function revocar(email: string) {
    setOcupadoEmail(email);
    try {
      await enviar(`/api/accesos/invitaciones/${encodeURIComponent(email)}`, 'DELETE');
      await recargar();
      mostrar(`Invitación a ${email} revocada`, false);
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo revocar', true);
    } finally {
      setOcupadoEmail(null);
    }
  }

  return (
    <section className={TARJETA} aria-labelledby="titulo-invitaciones">
      <h2 id="titulo-invitaciones" className={`mb-1 ${TITULO}`}>
        Invitaciones enviadas{!error && datos ? <> · <span className="tabular-nums">{sinUsar.length}</span></> : null}
      </h2>
      {cargando && !datos ? (
        <Cargando />
      ) : error ? (
        <div className="text-[14px] text-grafito">{error}</div>
      ) : sinUsar.length === 0 ? (
        <div className="py-2 text-[14px] text-grafito">Todavía no invitaste a nadie.</div>
      ) : (
        sinUsar.map((i) => (
          <div key={i.email} className="flex min-h-fila items-center gap-3 border-t border-borde-suave py-2 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="truncate font-serif text-[15px] font-semibold">{i.email}</div>
              <div className="truncate text-[14px] text-grafito md:text-[13px]">
                {ETIQUETA_ROL[i.rol]} · invitada {haceCuanto(i.creado_at)}
              </div>
            </div>
            <button
              type="button"
              disabled={ocupadoEmail === i.email}
              onClick={() => revocar(i.email)}
              className="flex-none px-1 text-[14px] font-medium text-ladrillo/70 disabled:opacity-50 md:text-[13px]"
            >
              Revocar
            </button>
          </div>
        ))
      )}
      {toast}
    </section>
  );
}

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
  const { datos: aprobadas, cargando: cargandoAprobadas, error: errorAprobadas, recargar: recargarAprobadas } = useDatos<{ solicitudes: SolicitudAcceso[] }>('/api/accesos?estado=aprobada');
  const { datos: invitaciones, cargando: cargandoInvitaciones, error: errorInvitaciones, recargar: recargarInvitaciones } = useDatos<{ invitaciones: Invitacion[] }>('/api/accesos/invitaciones');
  const { toast, mostrar } = useToastLocal();
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  if (cargando && pendientes.length === 0 && !error) return <Cargando />;
  if (error) return <EstadoError mensaje={`No se pudo abrir Accesos: ${error}`} />;

  async function resolver(id: string, nombre: string, accion: 'aprobar' | 'rechazar') {
    setOcupadoId(id);
    const err = await (accion === 'aprobar' ? aprobar(id) : rechazar(id));
    setOcupadoId(null);
    if (err) mostrar(err, true);
    else mostrar(accion === 'aprobar' ? `${nombre} ya puede entrar · Equipo` : `Solicitud de ${nombre} rechazada`, false);
  }

  async function quitar(perfilId: string, nombre: string) {
    setOcupadoId(perfilId);
    setAConfirmar(null);
    try {
      await enviar(`/api/accesos/usuarios/${perfilId}`, 'DELETE');
      await recargarAprobadas();
      mostrar(`Se le sacó el acceso a ${nombre}`, false);
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo sacar el acceso', true);
    } finally {
      setOcupadoId(null);
    }
  }

  return (
    <>
      <InvitarAcceso onInvitada={recargarInvitaciones} />
      <InvitacionesEnviadas datos={invitaciones} cargando={cargandoInvitaciones} error={errorInvitaciones} recargar={recargarInvitaciones} />

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
              {aConfirmar === u.perfil_id ? (
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    disabled={ocupadoId === u.perfil_id}
                    onClick={() => quitar(u.perfil_id, u.nombre ?? 'esta persona')}
                    className="px-1 text-[14px] font-medium text-ladrillo disabled:opacity-50 md:text-[13px]"
                  >
                    ¿Seguro? Sí, sacar
                  </button>
                  <button type="button" onClick={() => setAConfirmar(null)} className="px-1 text-[14px] font-medium text-grafito md:text-[13px]">
                    No
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setAConfirmar(u.perfil_id)} className="flex-none px-1 text-[14px] font-medium text-ladrillo/70 md:text-[13px]">
                  Quitar
                </button>
              )}
            </div>
          ))
        )}
      </section>

      {toast}
    </>
  );
}
