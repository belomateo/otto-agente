// Fábricas de route handlers de edición: cada archivo de panel/app/api/** queda en una línea
// (`export const PATCH = rutaEdicion('reglas')`). La sesión se chequea acá; el permiso por
// entidad (soloAdmin) y la validación, en lib/edicion/editar.ts.
import 'server-only';
import { requerirSesion } from '@/lib/api/sesion';
import { borrar, crear, editar, editarUnica, guardarUnica } from './editar';
import type { ClaveEntidad } from './entidades';

type ConId = { params: Promise<{ id: string }> };

export function rutaAlta(clave: ClaveEntidad) {
  return async function POST(request: Request) {
    const s = await requerirSesion();
    if (s instanceof Response) return s;
    return crear(s, clave, request);
  };
}

export function rutaEdicion(clave: ClaveEntidad) {
  return async function PATCH(request: Request, ctx: ConId) {
    const s = await requerirSesion();
    if (s instanceof Response) return s;
    const { id } = await ctx.params;
    return editar(s, clave, id, request);
  };
}

export function rutaEdicionUnica(clave: ClaveEntidad) {
  return async function PATCH(request: Request) {
    const s = await requerirSesion();
    if (s instanceof Response) return s;
    return editarUnica(s, clave, request);
  };
}

export function rutaBorrado(clave: ClaveEntidad) {
  return async function DELETE(request: Request, ctx: ConId) {
    const s = await requerirSesion();
    if (s instanceof Response) return s;
    const { id } = await ctx.params;
    return borrar(s, clave, id, request);
  };
}

export function rutaGuardarUnica(clave: ClaveEntidad) {
  return async function PUT(request: Request) {
    const s = await requerirSesion();
    if (s instanceof Response) return s;
    return guardarUnica(s, clave, request);
  };
}
