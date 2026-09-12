// Cliente de Supabase para Componentes de Cliente ('use client'). No usar en
// Server Components ni route handlers: ahí va lib/supabase/server.ts.
import { createBrowserClient } from '@supabase/ssr';

export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
