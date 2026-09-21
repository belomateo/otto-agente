'use client';

// Fetch hacia panel/app/api/** (paneles): mismo origen, la cookie de sesión ya viaja sola, sin
// necesidad de armarla a mano. Los errores respetan la forma de panel/lib/api/respuestas.ts:
// { error, detalle? }. Un solo lugar para no repetir esto en cada pestaña.

export class ErrorApi extends Error {
  status: number;
  detalle?: unknown;
  constructor(status: number, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.status = status;
    this.detalle = detalle;
  }
}

async function leer(r: Response) {
  const texto = await r.text();
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

// Mismo texto exacto que usan middleware.ts y lib/api/sesion.ts (paneles) para "el perfil ya
// no está aprobado" — es lo único que distingue esto de un 403 de "no sos admin" en una ruta
// puntual (ese lo maneja cada pantalla mostrando una explicación, no hay que sacar a nadie:
// ver Accesos.tsx). Frágil si el texto llega a divergir entre los dos lados, pero hoy es el
// único señal disponible sin sumar un código de error nuevo.
const MENSAJE_NO_APROBADO = 'Tu acceso todavía no está aprobado';

// Sesión perdida (401, siempre) o acceso que ya no está aprobado (403 con ese mensaje puntual
// — por ejemplo alguien al que le acaban de sacar el acceso mientras tenía el panel abierto):
// cortar acá con una carga nueva, no un aviso, es lo que evita que la pantalla ya renderizada
// siga mostrando datos que esa persona no debería poder ver (auditoría de logica, 21/9 —
// useDatos.ts limpia lo que tenía en memoria, esto corta antes de que importe). El middleware
// decide el destino real al recargar: /login si de verdad no hay sesión, /esperando si el
// perfil ya no está aprobado.
function siNoAutorizadoRedirigir(status: number, mensaje: unknown) {
  const cortar = status === 401 || (status === 403 && mensaje === MENSAJE_NO_APROBADO);
  if (cortar && typeof window !== 'undefined') window.location.href = '/login';
}

export async function obtener<T>(ruta: string): Promise<T> {
  const r = await fetch(ruta, { cache: 'no-store' });
  const cuerpo = await leer(r);
  if (!r.ok) {
    siNoAutorizadoRedirigir(r.status, cuerpo?.error);
    throw new ErrorApi(r.status, cuerpo?.error ?? `No se pudo conectar (${r.status})`, cuerpo?.detalle);
  }
  return cuerpo as T;
}

export async function enviar<T>(ruta: string, metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE', cuerpo?: unknown): Promise<T> {
  const r = await fetch(ruta, {
    method: metodo,
    headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await leer(r);
  if (!r.ok) {
    siNoAutorizadoRedirigir(r.status, datos?.error);
    throw new ErrorApi(r.status, datos?.error ?? `No se pudo conectar (${r.status})`, datos?.detalle);
  }
  return datos as T;
}
