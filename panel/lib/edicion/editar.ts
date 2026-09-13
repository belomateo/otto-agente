// Edición del dueño (H1.9): alta, edición con control de versión, historial y "volver a la
// versión anterior". Cada route handler de panel/app/api/** es una línea que llama a esto
// con su entidad (lib/edicion/entidades.ts).
//
// Control de versión: cada edición manda la `version` que el panel tenía en pantalla. Si en
// la base ya hay otra (alguien editó mientras tanto), 409 y no se pisa nada. El UPDATE lleva
// además `where version = <la que mandó>`, así que dos ediciones simultáneas no pueden ganar
// las dos. La versión nueva, editado_at, editado_por y la fila de historial las pone la base
// (triggers de 0003 y 0017), no este código.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENTIDADES, entidadPorTabla, type ClaveEntidad, type Entidad } from './entidades';
import { desdeErrorDeBase, error, json } from '@/lib/api/respuestas';
import { esUuid, validar } from '@/lib/api/validar';
import type { Sesion } from '@/lib/api/sesion';

type Fila = Record<string, unknown>;

// La tabla es dinámica, así que acá va el cliente sin tipos: lo que se escribe ya pasó por el
// esquema zod de la entidad, que es la lista blanca de columnas.
const db = (s: Sesion) => s.supabase as unknown as SupabaseClient;

const EDITADO_MIENTRAS_TANTO = 'Alguien lo editó mientras tanto: recargá y volvé a intentar';

function falla(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return desdeErrorDeBase(e as { code?: string; message: string });
  console.error('[api] error inesperado:', e);
  return error(500, 'Error inesperado');
}

function sinPermiso(sesion: Sesion, ent: Entidad) {
  return ent.soloAdmin && sesion.perfil.rol !== 'admin' ? error(403, 'Solo un admin puede editar esto') : null;
}

async function cuerpoJson(request: Request): Promise<Fila | Response> {
  try {
    const c: unknown = await request.json();
    if (!c || typeof c !== 'object' || Array.isArray(c)) return error(400, 'El cuerpo tiene que ser un objeto JSON');
    return c as Fila;
  } catch {
    return error(400, 'El cuerpo no es JSON válido');
  }
}

function separarVersion(cuerpo: Fila): { version: number; resto: Fila } | Response {
  const { version, ...resto } = cuerpo;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return error(400, 'Falta la versión que estás editando (campo version)');
  }
  return { version, resto };
}

async function crearDesde(sesion: Sesion, ent: Entidad, cuerpo: Fila) {
  const bloqueo = sinPermiso(sesion, ent);
  if (bloqueo) return bloqueo;
  if (!ent.crear) return error(405, 'Esto no se crea desde el panel');
  const datos = validar(cuerpo, ent.crear);
  if (datos instanceof Response) return datos;
  try {
    const completo = ent.completarAlta ? await ent.completarAlta(db(sesion), datos) : datos;
    const incoherente = ent.coherencia?.(completo);
    if (incoherente) return error(400, incoherente);
    const rechazo = ent.verificar ? await ent.verificar(db(sesion), null, completo) : null;
    if (rechazo) return error(rechazo.status, rechazo.mensaje);
    const { data, error: e } = await db(sesion).from(ent.tabla).insert(completo).select().single();
    if (e) return desdeErrorDeBase(e);
    return json({ fila: data }, 201);
  } catch (e) {
    return falla(e);
  }
}

async function aplicar(sesion: Sesion, ent: Entidad, id: string, version: number, cambios: Fila, extra: Fila = {}) {
  const bloqueo = sinPermiso(sesion, ent);
  if (bloqueo) return bloqueo;
  try {
    const { data: actual, error: e1 } = await db(sesion).from(ent.tabla).select('*').eq('id', id).maybeSingle();
    if (e1) return desdeErrorDeBase(e1);
    if (!actual) return error(404, 'No existe');
    if (actual.version !== version) return error(409, EDITADO_MIENTRAS_TANTO, { version_actual: actual.version });

    const final = { ...actual, ...cambios };
    const incoherente = ent.coherencia?.(final);
    if (incoherente) return error(400, incoherente);
    const rechazo = ent.verificar ? await ent.verificar(db(sesion), actual, final) : null;
    if (rechazo) return error(rechazo.status, rechazo.mensaje);

    const { data, error: e2 } = await db(sesion)
      .from(ent.tabla)
      .update(cambios)
      .eq('id', id)
      .eq('version', version)
      .select()
      .maybeSingle();
    if (e2) return desdeErrorDeBase(e2);
    if (!data) return error(409, EDITADO_MIENTRAS_TANTO);
    return json({ fila: data, ...extra });
  } catch (e) {
    return falla(e);
  }
}

async function editarDesde(sesion: Sesion, ent: Entidad, id: string, cuerpo: Fila) {
  if (!esUuid(id)) return error(400, 'Identificador inválido');
  const partes = separarVersion(cuerpo);
  if (partes instanceof Response) return partes;
  const cambios = validar(partes.resto, ent.editar);
  if (cambios instanceof Response) return cambios;
  if (Object.keys(cambios).length === 0) return error(400, 'No hay nada para cambiar');
  return aplicar(sesion, ent, id, partes.version, cambios);
}

/** POST: alta de una fila. */
export async function crear(sesion: Sesion, clave: ClaveEntidad, request: Request) {
  const cuerpo = await cuerpoJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  return crearDesde(sesion, ENTIDADES[clave], cuerpo);
}

/** PATCH: edición de una fila por id, con { version, ...cambios }. */
export async function editar(sesion: Sesion, clave: ClaveEntidad, id: string, request: Request) {
  const cuerpo = await cuerpoJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  return editarDesde(sesion, ENTIDADES[clave], id, cuerpo);
}

async function idDeLaUnica(sesion: Sesion, ent: Entidad): Promise<string | null | Response> {
  const { data, error: e } = await db(sesion).from(ent.tabla).select('id').limit(1).maybeSingle();
  if (e) return desdeErrorDeBase(e);
  return (data?.id as string | undefined) ?? null;
}

/** PATCH de una tabla de una sola fila (configuracion_agenda). */
export async function editarUnica(sesion: Sesion, clave: ClaveEntidad, request: Request) {
  const ent = ENTIDADES[clave];
  const cuerpo = await cuerpoJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const id = await idDeLaUnica(sesion, ent);
  if (id instanceof Response) return id;
  if (!id) return error(404, 'Todavía no está cargado');
  return editarDesde(sesion, ent, id, cuerpo);
}

/** PUT de una tabla de una sola fila que puede estar vacía (prompt_base): la crea o la edita. */
export async function guardarUnica(sesion: Sesion, clave: ClaveEntidad, request: Request) {
  const ent = ENTIDADES[clave];
  const cuerpo = await cuerpoJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const id = await idDeLaUnica(sesion, ent);
  if (id instanceof Response) return id;
  if (!id) {
    const { version: _ignorada, ...datos } = cuerpo;
    return crearDesde(sesion, ent, datos);
  }
  return editarDesde(sesion, ent, id, cuerpo);
}

/** GET del historial de una fila: versiones anteriores, de la más nueva a la más vieja. */
export async function listarHistorial(sesion: Sesion, tabla: string | null, id: string | null) {
  if (!tabla || !entidadPorTabla(tabla)) return error(400, 'Esa tabla no tiene historial en el panel');
  if (!id || !esUuid(id)) return error(400, 'Identificador inválido');
  const { data, error: e } = await db(sesion)
    .from('historial_ediciones')
    .select('id, version, editado_por, editado_at, datos_anteriores')
    .eq('tabla', tabla)
    .eq('fila_id', id)
    .order('version', { ascending: false });
  if (e) return desdeErrorDeBase(e);
  return json({ versiones: data ?? [] });
}

/**
 * POST "volver a la versión anterior": copia a la fila las columnas editables de una versión
 * del historial. Es una edición más: pasa por las mismas validaciones y deja, a su vez, su
 * propia fila de historial (la versión que se está reemplazando).
 */
export async function restaurar(sesion: Sesion, historialId: string, request: Request) {
  if (!esUuid(historialId)) return error(400, 'Identificador inválido');
  const cuerpo = await cuerpoJson(request);
  if (cuerpo instanceof Response) return cuerpo;
  const partes = separarVersion(cuerpo);
  if (partes instanceof Response) return partes;

  const { data: h, error: e } = await db(sesion)
    .from('historial_ediciones')
    .select('id, tabla, fila_id, version, datos_anteriores')
    .eq('id', historialId)
    .maybeSingle();
  if (e) return desdeErrorDeBase(e);
  if (!h) return error(404, 'Esa versión no existe');
  const ent = entidadPorTabla(h.tabla as string);
  if (!ent) return error(400, 'Esa tabla no se restaura desde el panel');

  const anteriores = (h.datos_anteriores ?? {}) as Fila;
  const copia = Object.fromEntries(ent.columnas.filter((c) => c in anteriores).map((c) => [c, anteriores[c]]));
  const r = ent.editar.safeParse(copia);
  if (!r.success) {
    return error(
      422,
      'Esa versión no cumple las reglas de hoy: editala a mano',
      r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }))
    );
  }
  return aplicar(sesion, ent, h.fila_id as string, partes.version, r.data, { restaurada_desde: h.version });
}
