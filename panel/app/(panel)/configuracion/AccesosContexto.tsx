'use client';

// Solicitudes de acceso reales (H1.10, paneles): GET /api/accesos?estado=pendiente (admin) y
// POST /api/accesos/<id> para aprobar (equipo, por defecto del servidor) o rechazar. Vive en
// el layout para que el número de la subpestaña «Accesos» acompañe al Aprobar/Rechazar de la
// propia pantalla. Con un usuario que no es admin, el pedido da 403: no se muestra número (no
// "0", que sugeriría que se sabe que no hay ninguna) y la propia pantalla de Accesos explica
// el error si alguien no-admin llega a abrirla.

import { createContext, useContext } from 'react';
import { enviar, ErrorApi } from '@/components/api/cliente';
import { useDatos } from '@/components/api/useDatos';
import type { SolicitudAcceso } from '@/lib/queries/accesos';

type Contexto = {
  pendientes: SolicitudAcceso[];
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  /** Sin `rol`, el servidor aprueba como 'equipo' — nunca admin por default. */
  aprobar: (id: string, rol?: 'admin' | 'equipo') => Promise<string | null>;
  rechazar: (id: string) => Promise<string | null>;
};

const AccesosCtx = createContext<Contexto | null>(null);

export function AccesosProvider({ children }: { children: React.ReactNode }) {
  const { datos, cargando, error, recargar } = useDatos<{ solicitudes: SolicitudAcceso[] }>('/api/accesos?estado=pendiente');

  async function resolver(id: string, accion: 'aprobar' | 'rechazar', rol?: 'admin' | 'equipo') {
    try {
      await enviar(`/api/accesos/${id}`, 'POST', accion === 'aprobar' && rol ? { accion, rol } : { accion });
      recargar();
      return null;
    } catch (e) {
      return e instanceof ErrorApi ? e.message : 'No se pudo guardar';
    }
  }

  return (
    <AccesosCtx.Provider
      value={{
        pendientes: datos?.solicitudes ?? [],
        cargando,
        error,
        recargar,
        aprobar: (id, rol) => resolver(id, 'aprobar', rol),
        rechazar: (id) => resolver(id, 'rechazar'),
      }}
    >
      {children}
    </AccesosCtx.Provider>
  );
}

export function useAccesos() {
  const ctx = useContext(AccesosCtx);
  if (!ctx) throw new Error('useAccesos va adentro de AccesosProvider (app/(panel)/configuracion/layout.tsx)');
  return ctx;
}
