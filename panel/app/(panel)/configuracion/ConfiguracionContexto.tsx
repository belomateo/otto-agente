'use client';

// Datos reales de Configuración (H1.8, paneles): un solo GET /api/configuracion sirve a Lucía,
// Agenda, Herramientas, Enlaces y Notas — todas viven bajo este layout, así que un solo pedido
// alcanza para las cinco en vez de repetirlo por subpestaña. Accesos es aparte (admin-only,
// propio endpoint): ver AccesosContexto.tsx.

import { createContext, useContext } from 'react';
import { useDatos } from '@/components/api/useDatos';
import type { Configuracion } from '@/lib/queries/configuracion';

type Ctx = { datos: Configuracion | null; cargando: boolean; error: string | null; recargar: () => void };

const ConfiguracionCtx = createContext<Ctx | null>(null);

export function ConfiguracionProvider({ children }: { children: React.ReactNode }) {
  const { datos, cargando, error, recargar } = useDatos<Configuracion>('/api/configuracion');
  return <ConfiguracionCtx.Provider value={{ datos, cargando, error, recargar }}>{children}</ConfiguracionCtx.Provider>;
}

export function useConfiguracion() {
  const ctx = useContext(ConfiguracionCtx);
  if (!ctx) throw new Error('useConfiguracion va adentro de ConfiguracionProvider (app/(panel)/configuracion/layout.tsx)');
  return ctx;
}
