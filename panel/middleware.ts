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
// No van en RUTAS_AUTH: esas son "sacar de acá a quien ya está aprobado", y acá es al revés —
// quien tiene debe_cambiar_clave en true tiene que PODER quedarse en esta página y en esta
// ruta de API (si no, no hay forma de que llegue nunca a cambiarla).
const RUTA_CAMBIO_CLAVE = '/cambiar-clave';
const RUTA_API_CAMBIO_CLAVE = '/api/mi-cuenta/clave';

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

  // Lo mismo para las respuestas JSON de /api/**. codigo es opcional (hallazgo de logica, 21/9):
  // front tenía que comparar el TEXTO del mensaje para distinguir "no aprobado" de otro 403, y
  // ese texto es para la persona, no para el cliente — mismo campo que error() de
  // lib/api/respuestas.ts (que requerirSesion usa para su propio recheque), mismos valores:
  // 'no_aprobado' y 'debe_cambiar_clave'.
  function responderJson(status: number, mensaje: string, codigo?: string) {
    const r = NextResponse.json(codigo === undefined ? { error: mensaje } : { error: mensaje, codigo }, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
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
    .select('estado, debe_cambiar_clave')
    .eq('id', user.id)
    .maybeSingle();
  if (errorPerfil) {
    // Se distingue "la consulta falló" de "no hay perfil" (verificador § 5). En páginas se
    // sigue fallando cerrado (a /esperando); en la API se dice qué pasó.
    console.error('[middleware] no se pudo leer el perfil:', errorPerfil.message);
    if (esApi) return responderJson(503, 'No se pudo verificar el perfil');
  }
  const aprobado = perfil?.estado === 'aprobado';
  const debeCambiarClave = perfil?.debe_cambiar_clave === true;

  if (esApi) {
    if (!aprobado) return responderJson(403, 'Tu acceso todavía no está aprobado', 'no_aprobado');
    if (debeCambiarClave && pathname !== RUTA_API_CAMBIO_CLAVE) {
      return responderJson(403, 'Tenés que cambiar tu contraseña temporal antes de seguir', 'debe_cambiar_clave');
    }
    return response;
  }

  if (!aprobado) return pathname === '/esperando' ? response : redirigirA('/esperando');

  if (debeCambiarClave) return pathname === RUTA_CAMBIO_CLAVE ? response : redirigirA(RUTA_CAMBIO_CLAVE);

  // Ya aprobado y sin clave pendiente: ni /login-o-esperando ni /cambiar-clave tienen sentido acá.
  if (esRutaAuth || pathname === RUTA_CAMBIO_CLAVE) return redirigirA('/bandeja');

  return response;
}

// Todo lo que no sea estático pasa por acá. Los archivos de `public/` quedan
// afuera por extensión y no por nombre: con la lista anterior (solo
// logo-otto.png), cada imagen nueva que sume `front` iba a disparar un
// getUser() + una consulta a `perfiles` por cada request de un .png.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};
