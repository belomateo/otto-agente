'use client';

// Solicitudes pendientes: de AccesosContexto (vive en el layout, así el número de la
// subpestaña se entera junto con Aprobar/Rechazar).
//
// "Crear usuario" (H1.10, decisión de Mateo 21/9) reemplaza a "Invitar por mail": un admin da
// de alta la cuenta ya mismo con una clave temporal que genera el servidor, en vez de esperar
// a que la persona se registre sola. "Invitaciones enviadas" queda solo para lo que ya estaba
// mandado antes de este cambio (verlas y poder revocarlas), no se puede crear una nueva.
//
// "Usuarios aprobados" es una aproximación: GET /api/accesos?estado=aprobada lista solicitudes
// resueltas, no un directorio de cuentas — pero desde el 21/9 sí trae el rol VIGENTE de cada
// una (antes no, por eso el chip Admin/Equipo hubiera sido inventado). "Subir/Bajar" pasa por
// PATCH /api/accesos/usuarios/[id] {rol}; "Quitar" por DELETE al mismo endpoint con el
// perfil_id de la solicitud (no su propio id), reusando perfiles.estado = 'rechazado'. Las dos
// son solo admin; la base sola frena que alguien se toque su propio rol o su propio acceso
// (42501, mensaje genérico, no hace falta nada especial para ese caso en la UI).
//
// Con un usuario 'equipo' (no admin), los pedidos de esta pantalla dan 403: se explica en vez
// de mostrar una pantalla a medias.

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

// Diálogo con la contraseña temporal — se cierra a mano nomás, nunca solo. Es la única vez
// que ese valor existe en algún lado fuera de la cabeza de quien lo lea: si se cierra sin
// copiarlo, no hay forma de recuperarlo (hay que dar de baja la cuenta y crearla de nuevo).
function DialogoClaveTemporal({ email, clave, aviso, onCerrar }: { email: string; clave: string; aviso: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles (poco común, pero pasa): el texto ya está seleccionable
      // a mano en el <code> de abajo, no hace falta más que eso.
    }
  }

  return (
    <div role="dialog" aria-label="Contraseña temporal" className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/[.32] p-4">
      <div className="w-full max-w-[420px] rounded-otto bg-lino p-5 shadow-otto-pop">
        <div className="font-serif text-lg font-semibold">Cuenta creada</div>
        <div className="mt-2.5 text-[14px] text-grafito">
          {email} · {ETIQUETA_ROL.equipo}
        </div>
        <div className="mt-3">
          <div className={ETIQUETA}>Contraseña temporal</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-otto border border-borde bg-hueso px-3 py-2.5 text-[15px]">{clave}</code>
            <button type="button" onClick={copiar} className="flex-none rounded-otto border border-cobre bg-lino px-3.5 py-2.5 text-sm font-medium text-cobre">
              {copiado ? 'Copiada' : 'Copiar'}
            </button>
          </div>
        </div>
        <div className="mt-3 rounded-otto border border-ambar bg-ambar-suave px-3.5 py-3 text-[14px] font-medium leading-[1.5] text-ambar">
          {aviso}
        </div>
        <button type="button" onClick={onCerrar} className="mt-4 w-full rounded-otto bg-cobre py-2.5 text-sm font-medium text-lino">
          Ya la copié, cerrar
        </button>
      </div>
    </div>
  );
}

// Reemplaza a "Invitar por mail" (H1.10, decisión de Mateo 21/9, a raíz de una auditoría de
// seguridad): un admin crea la cuenta ya mismo con una contraseña temporal generada por el
// servidor, en vez de esperar a que la persona se registre sola con un link. La cuenta nace
// aprobada pero con debe_cambiar_clave, así que la primera vez que entre el middleware la
// manda derecho a /cambiar-clave.
function CrearUsuario({ onCreado }: { onCreado: () => void }) {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ email: string; clave: string; aviso: string } | null>(null);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      const emailNuevo = email.trim();
      const { clave_temporal, aviso } = await enviar<{ clave_temporal: string; aviso: string }>('/api/accesos/usuarios', 'POST', { email: emailNuevo });
      setEmail('');
      setCreado({ email: emailNuevo, clave: clave_temporal, aviso });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo crear la cuenta');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className={TARJETA} aria-labelledby="titulo-crear">
      <h2 id="titulo-crear" className={`mb-2.5 ${TITULO}`}>
        Crear usuario
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
        <button
          type="button"
          onClick={crear}
          disabled={enviando || !email.trim()}
          className="flex-none rounded-otto bg-cobre px-4.5 py-2.5 text-sm font-medium text-lino disabled:opacity-50"
        >
          {enviando ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
      <div className="mt-2.5 text-[14px] leading-[1.45] text-grafito md:text-[13px]">
        Entra directo, como Colaborador, con una contraseña temporal que el sistema genera solo — no se manda por mail, se la pasás vos. La primera vez que entre le va a pedir que la cambie.
      </div>
      {error && <div className="mt-1.5 text-[14px] text-ladrillo md:text-[13px]">{error}</div>}
      {creado && (
        <DialogoClaveTemporal
          email={creado.email}
          clave={creado.clave}
          aviso={creado.aviso}
          onCerrar={() => {
            setCreado(null);
            onCreado();
          }}
        />
      )}
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

// Aprobar sigue el rol que la persona pidió (Colaborador si no pidió nada — nunca Admin por
// default); "aprobar como Administrador" es aparte y solo aparece cuando hace falta subir de
// lo pedido, para que darle más de lo que pidieron sea una decisión aparte, no la de siempre.
function FilaSolicitud({
  s,
  onAprobar,
  onAprobarComoAdmin,
  onRechazar,
  ocupado,
}: {
  s: SolicitudAcceso;
  onAprobar: () => void;
  onAprobarComoAdmin: () => void;
  onRechazar: () => void;
  ocupado: boolean;
}) {
  const pidioAdmin = s.rol_solicitado === 'admin';
  return (
    <div className="flex flex-col gap-2.5 border-t border-borde-suave py-3 first:border-t-0 md:flex-row md:items-center md:gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[15.5px] font-semibold">{s.nombre ?? 'Sin nombre'}</div>
        <div className="truncate text-[14px] text-grafito md:text-[13px]">
          {s.email ?? '—'} · <span className="tabular-nums">{s.hace}</span>
          {s.rol_solicitado && <> · Pidió: {ETIQUETA_ROL[s.rol_solicitado]}</>}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 md:items-end">
        <div className="flex gap-2">
          <button type="button" onClick={onAprobar} disabled={ocupado} className="flex-1 rounded-otto bg-cobre px-4 py-2.5 text-sm font-medium text-lino disabled:opacity-50 md:flex-none">
            Aprobar{pidioAdmin ? ' como Administrador' : ''}
          </button>
          <button type="button" onClick={onRechazar} disabled={ocupado} className="flex-1 rounded-otto border border-borde bg-lino px-4 py-2.5 text-sm font-medium text-grafito disabled:opacity-50 md:flex-none">
            Rechazar
          </button>
        </div>
        {!pidioAdmin && (
          <button type="button" onClick={onAprobarComoAdmin} disabled={ocupado} className="px-1 text-[14px] font-medium text-grafito underline-offset-2 hover:underline disabled:opacity-50 md:text-[12.5px]">
            aprobar como Administrador
          </button>
        )}
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

  async function resolver(id: string, nombre: string, accion: 'aprobar' | 'rechazar', rolAprobado?: RolInvitacion) {
    setOcupadoId(id);
    const err = await (accion === 'aprobar' ? aprobar(id, rolAprobado) : rechazar(id));
    setOcupadoId(null);
    if (err) mostrar(err, true);
    else mostrar(accion === 'aprobar' ? `${nombre} ya puede entrar · ${ETIQUETA_ROL[rolAprobado ?? 'equipo']}` : `Solicitud de ${nombre} rechazada`, false);
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

  // Solo sobre alguien ya aprobado; el propio trigger de la base frena que un admin se
  // cambie el rol a sí mismo (403 genérico, "No tenés permiso para esto" — no hay nada
  // especial para armar en la UI para ese caso, el mensaje ya alcanza).
  async function promoverRol(perfilId: string, nombre: string, rolNuevo: RolInvitacion) {
    setOcupadoId(perfilId);
    try {
      await enviar(`/api/accesos/usuarios/${perfilId}`, 'PATCH', { rol: rolNuevo });
      await recargarAprobadas();
      mostrar(`${nombre} ahora es ${ETIQUETA_ROL[rolNuevo]}`, false);
    } catch (e) {
      mostrar(e instanceof ErrorApi ? e.message : 'No se pudo cambiar el rol', true);
    } finally {
      setOcupadoId(null);
    }
  }

  return (
    <>
      <CrearUsuario onCreado={recargarAprobadas} />
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
              onAprobar={() => resolver(s.id, s.nombre ?? 'La persona', 'aprobar', s.rol_solicitado ?? 'equipo')}
              onAprobarComoAdmin={() => resolver(s.id, s.nombre ?? 'La persona', 'aprobar', 'admin')}
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
                  {u.email ?? '—'} · {ETIQUETA_ROL[u.rol]} · aprobado {u.hace}
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
                <div className="flex flex-none items-center gap-2.5">
                  <button
                    type="button"
                    disabled={ocupadoId === u.perfil_id}
                    onClick={() => promoverRol(u.perfil_id, u.nombre ?? 'esta persona', u.rol === 'admin' ? 'equipo' : 'admin')}
                    className="px-1 text-[14px] font-medium text-grafito underline-offset-2 hover:underline disabled:opacity-50 md:text-[13px]"
                  >
                    {u.rol === 'admin' ? 'Bajar a Colaborador' : 'Subir a Administrador'}
                  </button>
                  <button type="button" disabled={ocupadoId === u.perfil_id} onClick={() => setAConfirmar(u.perfil_id)} className="flex-none px-1 text-[14px] font-medium text-ladrillo/70 disabled:opacity-50 md:text-[13px]">
                    Quitar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {toast}
    </>
  );
}
