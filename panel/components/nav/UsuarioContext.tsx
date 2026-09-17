'use client';

// El usuario real (nombre, rol) ya lo lee app/(panel)/layout.tsx (Server Component) para el
// pie del Sidebar/MasSheet; este contexto lo deja disponible también para componentes de
// cliente que lo necesiten para decidir qué mostrar (ej. ChatThread: esconder «Ver ficha» si
// el rol no es admin, ya que /clientes es solo-admin). Evita otro pedido a la API solo para
// saber quién es la persona logueada: el layout ya lo tiene.
//
// Esto es SOLO para decisiones de interfaz (mostrar u ocultar un link, un botón) — nunca la
// fuente de verdad de un permiso. El rol viaja acá tal cual lo puso el layout; nada impide que
// se edite en el cliente. El permiso de verdad se resuelve en el servidor (paneles: 403 en las
// rutas solo-admin, o directamente no mandar el dato — como CartelTurno con `ficha`, que
// paneles resolvió en lib/queries/avisos.ts en vez de esconder el link acá). Los dos caminos
// son válidos: éste para donde ya se lee la ficha completa en el cliente (ChatThread), el otro
// para donde alcanza con no exponer el dato desde el vamos.

import { createContext, useContext } from 'react';

type Usuario = { nombre: string; rol: string };

const UsuarioContext = createContext<Usuario | undefined>(undefined);

export function UsuarioProvider({ usuario, children }: { usuario?: Usuario; children: React.ReactNode }) {
  return <UsuarioContext.Provider value={usuario}>{children}</UsuarioContext.Provider>;
}

/** undefined mientras no hay sesión resuelta: tratarlo como "no admin" (fail-closed). */
export function useUsuario() {
  return useContext(UsuarioContext);
}
