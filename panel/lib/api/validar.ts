// Lectura y validación del cuerpo de un request (principio 6: nada se escribe sin validar
// en código lo que llegó). Devuelve los datos ya tipados o una respuesta 400 lista.
import type { z } from 'zod';
import { error } from './respuestas';

export async function leerCuerpo<T extends z.ZodType>(request: Request, esquema: T): Promise<z.infer<T> | Response> {
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return error(400, 'El cuerpo no es JSON válido');
  }
  return validar(crudo, esquema);
}

export function validar<T extends z.ZodType>(crudo: unknown, esquema: T): z.infer<T> | Response {
  const r = esquema.safeParse(crudo);
  if (!r.success) {
    return error(
      400,
      'Datos inválidos',
      r.error.issues.map((i) => ({ campo: i.path.join('.') || '(cuerpo)', mensaje: i.message }))
    );
  }
  return r.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (s: string) => UUID.test(s);
