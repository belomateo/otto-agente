// Guarda de acceso: sin sesión -> /login; con sesión pero perfil no aprobado
// -> /esperando; aprobado visitando /login o /esperando -> /bandeja.
// CLAUDE.md § 1 / TRABAJO.md H1.10: registro abierto, pero el perfil nace
// pendiente y hasta que un admin lo aprueba, RLS le devuelve cero filas.
//
// /api/** no redirige (H1.8, informe del verificador § 5): un fetch que pide datos tiene
// que recibir un 401/403 en JSON, no la página de login en HTML con un 307.
//
// Next 16 renombró este archivo a proxy.ts (middleware.ts sigue andando, deprecado). El
// cambio queda para cuando se decida con logica: proxy.ts no está en ningún territorio.
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

  // Lo mismo para las respuestas JSON de /api/**.
  function responderJson(status: number, mensaje: string) {
    const r = NextResponse.json({ error: mensaje }, { status, headers: { 'Cache-Control': 'no-store' } });
    response.cookies.getAll().forEach((cookie) => r.cookies.set(cookie));
    return r;
  }

  const { pathname } = request.nextUrl;
  // Igualdad exacta (o subruta), no startsWith a secas: con startsWith, una ruta
  // tipo '/loginchusmeando' contaría como ruta de auth y se colaría sin chequeo.
  const esRutaAuth = RUTAS_AUTH.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const esApi = pathname === '/api' || pathname.startsWith('/api/');

  if (!user) {
    if (esApi) return responderJson(401, 'Sin sesión');
    if (!esRutaAuth) return redirigirA('/login');
    return response;
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('estado')
    .eq('id', user.id)
    .maybeSingle();
  if (errorPerfil) {
    // Se distingue "la consulta falló" de "no hay perfil" (verificador § 5). En páginas se
    // sigue fallando cerrado (a /esperando); en la API se dice qué pasó.
    console.error('[middleware] no se pudo leer el perfil:', errorPerfil.message);
    if (esApi) return responderJson(503, 'No se pudo verificar el perfil');
  }
  const aprobado = perfil?.estado === 'aprobado';

  if (esApi) return aprobado ? response : responderJson(403, 'Tu acceso todavía no está aprobado');

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
