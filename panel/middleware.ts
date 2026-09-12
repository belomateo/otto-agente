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

  // Redirige conservando las cookies que getUser() haya podido refrescar: un
  // NextResponse.redirect() nace sin las cabeceras de `response`, así que si el
  // token se rotó en este request y no se copian, el navegador se queda con el
  // refresh token viejo (ya consumido) y la sesión se cae en el request siguiente.
  function redirigirA(destino: string) {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    const redireccion = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie));
    return redireccion;
  }

  const { pathname } = request.nextUrl;
  // Igualdad exacta (o subruta), no startsWith a secas: con startsWith, una ruta
  // tipo '/loginchusmeando' contaría como ruta de auth y se colaría sin chequeo.
  const esRutaAuth = RUTAS_AUTH.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  if (!user) {
    if (!esRutaAuth) return redirigirA('/login');
    return response;
  }

  const { data: perfil } = await supabase.from('perfiles').select('estado').eq('id', user.id).single();
  const aprobado = perfil?.estado === 'aprobado';

  if (!aprobado && pathname !== '/esperando') return redirigirA('/esperando');

  if (aprobado && esRutaAuth) return redirigirA('/bandeja');

  return response;
}

// Todo lo que no sea estático pasa por acá. Los archivos de `public/` quedan
// afuera por extensión y no por nombre: con la lista anterior (solo
// logo-otto.png), cada imagen nueva que sume `front` iba a disparar un
// getUser() + una consulta a `perfiles` por cada request de un .png.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};
