// Cliente de Supabase para Server Components y route handlers, con la sesión
// leída de las cookies (patrón oficial de @supabase/ssr para App Router).
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Se llama desde un Server Component sin permiso de escritura; el
          // middleware ya se encarga de refrescar la sesión en ese caso.
        }
      },
    },
  });
}
