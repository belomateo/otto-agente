// Cliente de Supabase con la service role: pasa por encima de RLS. SOLO servidor
// (STACK.md § 6): se usa desde panel/app/api/** y únicamente para lo que RLS no puede dar,
// como leer el email de auth.users en Configuración › Accesos. Todo lo demás va con el
// cliente de la sesión (lib/supabase/server.ts), para que RLS siga siendo el filtro.
// `server-only` hace fallar el build si algún componente cliente lo importa.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/tipos-db';

export function crearClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor');
  }
  return createClient<Database>(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
