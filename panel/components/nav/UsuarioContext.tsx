'use client';

// El usuario real (nombre, rol) ya lo lee app/(panel)/layout.tsx (Server Component) para el
// pie del Sidebar/MasSheet; este contexto lo deja disponible también para componentes de
// cliente que lo necesiten para decidir qué mostrar (ej. ChatThread: esconder «Ver ficha» si
// el rol no es admin, ya que /clientes es solo-admin). Evita otro pedido a la API solo para
// saber quién es la persona logueada: el layout ya lo tiene.

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
