/** @type {import('next').NextConfig} */

// Origen de Supabase (para connect-src/img-src): login y cambiar-clave le pegan directo desde
// el navegador (lib/supabase/client.ts, createBrowserClient), no solo por route handlers
// propios, y las fotos del catálogo subidas desde el panel viven en su Storage.
let origenSupabase = '';
try {
  origenSupabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin;
} catch {
  // Sin la variable (o inválida) en build: el CSP queda sin ese origen — el build no se cae por
  // esto, pero login/imágenes van a fallar igual sin la variable cargada.
}

// Hallazgo de logica (22/9, auditoría): el panel no mandaba ninguna cabecera de seguridad y va a
// salir a internet con Vercel.
//
// script-src necesita 'unsafe-inline': se intentó con nonce por request (la ruta "correcta" en
// teoría, generándolo en middleware.ts) pero Next App Router no lo estaba tomando para sus
// propios <script> del payload de hidratación (self.__next_f.push(...), RSC) — confirmado
// sirviendo la build real y mirando que ningún <script> traía el atributo nonce, aunque la
// cabecera de la respuesta sí lo llevaba. Con el nonce puesto pero sin usar, la política
// bloqueaba la hidratación ENTERA (probado: pantalla en blanco, sin JS corriendo) — peor que no
// tener CSP. Server-only content-security-policy con nonce por request no compone bien con
// server-only cuando el token no llega al script — se prefiere 'unsafe-inline' aceptado que un
// nonce roto. Si en el futuro alguien resuelve el enganche del nonce con Next (puede ser cosa de
// versión, o necesitar correr en Edge), es un cambio acotado a este archivo.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://acdn-us.mitiendanube.com${origenSupabase ? ` ${origenSupabase}` : ''}`,
  "font-src 'self'",
  `connect-src 'self'${origenSupabase ? ` ${origenSupabase}` : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Redundante con frame-ancestors de arriba (que ya cubre clickjacking en navegadores
          // modernos), pero se deja para los que todavía solo miran esta cabecera.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
