// Cliente de Supabase para Componentes de Cliente ('use client'). No usar en
// Server Components ni route handlers: ahí va lib/supabase/server.ts.
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/tipos-db';

export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
