// Guarda de acceso: sin sesión -> /login; con sesión pero perfil no aprobado
// -> /esperando; aprobado visitando /login o /esperando -> /bandeja.
// CLAUDE.md § 1 / TRABAJO.md H1.10: registro abierto, pero el perfil nace
// pendiente y hasta que un admin lo aprueba, RLS le devuelve cero filas.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const RUTAS_AUTH = ['/login', '/esperando'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esRutaAuth = RUTAS_AUTH.some((r) => pathname.startsWith(r));

  if (!user) {
    if (!esRutaAuth) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return response;
  }

  const { data: perfil } = await supabase.from('perfiles').select('estado').eq('id', user.id).single();
  const aprobado = perfil?.estado === 'aprobado';

  if (!aprobado && pathname !== '/esperando') {
    const url = request.nextUrl.clone();
    url.pathname = '/esperando';
    return NextResponse.redirect(url);
  }

  if (aprobado && esRutaAuth) {
    const url = request.nextUrl.clone();
    url.pathname = '/bandeja';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-otto.png).*)'],
};
