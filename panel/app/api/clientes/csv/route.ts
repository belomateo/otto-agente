// Exportar clientes: GET /api/clientes/csv?q=<texto>&evento=<evento> (pedido de Mateo, 25/9).
//
// Mismo permiso que la pestaña Clientes —solo admin, decisión de Mateo del 16/9— y los mismos
// filtros que la tabla: se exporta lo que se está viendo. Sin filtros, la base entera.
//
// Exporta la ficha COMPLETA, no las columnas de la tabla: la tabla recorta para entrar en
// pantalla ("12/9", "—"), y un CSV sirve justamente para tener todo. Por eso esto no reusa
// listarClientes, que devuelve los textos ya formateados para mostrar.
//
// Teléfono en formato legible ("341 638-1754") y no en dígitos crudos: Excel toma un número de
// 13 dígitos como número y lo muestra como 5,49342E+12. Con espacio y guión queda como texto. Al
// lado va el link de WhatsApp (wa.me), que además de conservar el número completo abre la charla
// con un clic.
import { rutaConsulta } from '@/lib/api/consulta';
import { error } from '@/lib/api/respuestas';
import { armarCsv, fechaArgentina, momentoArgentina } from '@/lib/csv';
import { ETIQUETA_DIA_O_NOCHE, ETIQUETA_EVENTO, ETIQUETA_ROL } from '@/lib/etiquetas';
import { normalizar, telefonoLegible } from '@/lib/queries/comun';

const EVENTOS = ['casamiento', 'graduacion', 'fiesta', 'laboral', 'otro'];

// Tope de seguridad, no de negocio: con cientos de contactos no se acerca. Si algún día se
// llegara, el archivo lo avisa en la última línea en vez de cortar callado.
const TOPE = 10_000;

// Mismo escape que listarClientes: que buscar "50%" no se lea como comodín de ILIKE.
const escaparIlike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const ENCABEZADOS = [
  'Nombre',
  'Teléfono',
  'WhatsApp',
  'Email',
  'Evento',
  'Fecha del evento',
  'Rol',
  'Día o noche',
  'Talle',
  'Ciudad',
  'Color preferido',
  'Presupuesto mencionado',
  'Notas',
  'Primer contacto',
  'Último contacto',
] as const;

export const GET = rutaConsulta(
  async (s, request) => {
    const p = request.nextUrl.searchParams;
    const evento = p.get('evento') ?? undefined;
    if (evento && !EVENTOS.includes(evento)) return error(400, 'evento inválido');
    const busqueda = normalizar(p.get('q') ?? '');

    let q = s.supabase
      .from('clientes')
      .select(
        'nombre, telefono, email, evento, fecha_evento, rol, dia_o_noche, talle_aprox, ciudad, ' +
          'color_preferido, presupuesto_mencionado, notas_libres, creado_at, conversaciones(ultimo_mensaje_at)'
      )
      .order('creado_at', { ascending: false })
      .limit(TOPE + 1);
    if (evento) q = q.eq('evento', evento);
    if (busqueda) q = q.ilike('busqueda', `%${escaparIlike(busqueda)}%`);
    const { data, error: e } = await q;
    if (e) throw e;

    const todas = (data ?? []) as unknown as Array<{
      nombre: string | null;
      telefono: string;
      email: string | null;
      evento: string | null;
      fecha_evento: string | null;
      rol: string | null;
      dia_o_noche: string | null;
      talle_aprox: string | null;
      ciudad: string | null;
      color_preferido: string | null;
      presupuesto_mencionado: string | null;
      notas_libres: string | null;
      creado_at: string;
      conversaciones: { ultimo_mensaje_at: string | null }[];
    }>;
    const recortado = todas.length > TOPE;
    const filas = todas.slice(0, TOPE).map((c) => {
      const ultimo =
        c.conversaciones
          .map((v) => v.ultimo_mensaje_at)
          .filter((v): v is string => Boolean(v))
          .sort()
          .at(-1) ?? null;
      const digitos = c.telefono.replace(/\D/g, '');
      return [
        c.nombre?.trim() ?? '',
        telefonoLegible(c.telefono),
        digitos ? `https://wa.me/${digitos}` : '',
        c.email ?? '',
        c.evento ? (ETIQUETA_EVENTO[c.evento] ?? c.evento) : '',
        fechaArgentina(c.fecha_evento),
        c.rol ? (ETIQUETA_ROL[c.rol] ?? c.rol) : '',
        c.dia_o_noche ? (ETIQUETA_DIA_O_NOCHE[c.dia_o_noche] ?? c.dia_o_noche) : '',
        c.talle_aprox ?? '',
        c.ciudad ?? '',
        c.color_preferido ?? '',
        c.presupuesto_mencionado ?? '',
        c.notas_libres ?? '',
        momentoArgentina(c.creado_at),
        momentoArgentina(ultimo),
      ];
    });
    if (recortado) filas.push([`(Se exportaron los primeros ${TOPE}: hay más. Filtrá por evento o por búsqueda.)`]);

    const hoy = new Date().toISOString().slice(0, 10);
    return new Response(armarCsv(ENCABEZADOS, filas), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="clientes-mr-otto-${hoy}.csv"`,
        // Son datos personales de clientes: que ningún intermediario los guarde.
        'Cache-Control': 'no-store',
      },
    });
  },
  { admin: true }
);
