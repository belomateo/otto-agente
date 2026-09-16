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

export async function obtener<T>(ruta: string): Promise<T> {
  const r = await fetch(ruta, { cache: 'no-store' });
  const cuerpo = await leer(r);
  if (!r.ok) throw new ErrorApi(r.status, cuerpo?.error ?? `No se pudo conectar (${r.status})`, cuerpo?.detalle);
  return cuerpo as T;
}

export async function enviar<T>(ruta: string, metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo?: unknown): Promise<T> {
  const r = await fetch(ruta, {
    method: metodo,
    headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await leer(r);
  if (!r.ok) throw new ErrorApi(r.status, datos?.error ?? `No se pudo conectar (${r.status})`, datos?.detalle);
  return datos as T;
}
