'use client';

// Solicitudes y usuarios mientras son mock. Viven en el layout de Configuración
// para que el número de la subpestaña «Accesos» acompañe a cada Aprobar /
// Rechazar / Deshacer. Cada acción devuelve la función que la deshace (Toast).

import { createContext, useContext, useState } from 'react';
import { SOLICITUDES, USUARIOS, type Solicitud, type Usuario } from './accesos/accesos-mock';

type EstadoAccesos = { solicitudes: Solicitud[]; usuarios: Usuario[] };

type Contexto = EstadoAccesos & {
  aprobar: (id: string) => () => void;
  rechazar: (id: string) => () => void;
  quitar: (id: string) => () => void;
};

const AccesosCtx = createContext<Contexto | null>(null);

export function AccesosProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoAccesos>({ solicitudes: SOLICITUDES, usuarios: USUARIOS });

  function aplicar(cambio: (e: EstadoAccesos) => EstadoAccesos) {
    const anterior = estado;
    setEstado(cambio);
    return () => setEstado(anterior);
  }

  return (
    <AccesosCtx.Provider
      value={{
        ...estado,
        aprobar: (id) =>
          aplicar((e) => {
            const s = e.solicitudes.find((x) => x.id === id);
            if (!s) return e;
            return {
              solicitudes: e.solicitudes.filter((x) => x.id !== id),
              usuarios: [...e.usuarios, { id: s.id, nombre: s.nombre, email: s.email, rol: 'equipo' }],
            };
          }),
        rechazar: (id) => aplicar((e) => ({ ...e, solicitudes: e.solicitudes.filter((x) => x.id !== id) })),
        quitar: (id) => aplicar((e) => ({ ...e, usuarios: e.usuarios.filter((x) => x.id !== id) })),
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
