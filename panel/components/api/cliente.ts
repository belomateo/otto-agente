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

// Sesión perdida (401, siempre), acceso que ya no está aprobado, o clave que hay que cambiar
// antes de seguir: cortar acá con una carga nueva, no un aviso, es lo que evita que la
// pantalla ya renderizada siga mostrando datos que esa persona no debería poder ver
// (auditoría de logica, 21/9 — useDatos.ts limpia lo que tenía en memoria, esto corta antes de
// que importe). Un 403 de "no sos admin" en una ruta puntual NO corta acá: cada pantalla ya lo
// explica en el lugar (ver Accesos.tsx), sacar a esa persona sería peor UX que la explicación
// que ya tenía. `codigo` (paneles, 21/9) es la señal estable — antes solo había mensaje de
// texto, frágil si se redactaba distinto en algún lugar nuevo.
function siNoAutorizadoRedirigir(status: number, codigo: unknown) {
  if (status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
  } else if (status === 403 && codigo === 'debe_cambiar_clave') {
    if (typeof window !== 'undefined') window.location.href = '/cambiar-clave';
  } else if (status === 403 && codigo === 'no_aprobado') {
    if (typeof window !== 'undefined') window.location.href = '/login';
  }
}

export async function obtener<T>(ruta: string): Promise<T> {
  const r = await fetch(ruta, { cache: 'no-store' });
  const cuerpo = await leer(r);
  if (!r.ok) {
    siNoAutorizadoRedirigir(r.status, cuerpo?.codigo);
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
    siNoAutorizadoRedirigir(r.status, datos?.codigo);
    throw new ErrorApi(r.status, datos?.error ?? `No se pudo conectar (${r.status})`, datos?.detalle);
  }
  return datos as T;
}
