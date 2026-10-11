// La base del analista de charlas (0102): de dónde salen las charlas y dónde queda lo que encontró.
// SQL directo por SUPABASE_DB_URL (la misma conexión que usa el worker), con la interfaz Db de
// _shared/db.ts. Las tablas son las de 0102; lo demás es lo que ya escriben el worker y el panel.
//
// Una charla «del día» es una charla de WhatsApp en la que Lucía mandó al menos un mensaje ese día
// (hora de Argentina): ni las plantillas automáticas ni lo que escribió el equipo desde el panel
// cuentan como que habló Lucía. Las de prueba (teléfonos 5490000000…, worker/atender.ts) y las del
// emulador (canal 'prueba') no se analizan.

import { diasSinTurnos } from "../_shared/agenda/huecos.ts";
import type { Db } from "../_shared/db.ts";
import { leerFicha } from "../_shared/herramientas/ficha.ts";
import { leerHorarioDelLocal } from "../_shared/herramientas/horario_laboral.ts";
import { instanteLocal, sumarDias } from "../_shared/tiempo.ts";
import type { Consumo, Repositorio, Revision } from "./noche.ts";
import { TOPES } from "./noche.ts";
import { armarCalendario, type CharlaDelDia, MENSAJES_DE_CONTEXTO, type MensajeCharla } from "./pedido.ts";
import type { Hallazgo } from "./respuesta.ts";

// Mismo prefijo que PREFIJO_TELEFONO_FICTICIO de worker/atender.ts (no se importa: arrastraría el
// worker entero a esta función).
const PREFIJO_TELEFONO_FICTICIO = "5490000000";
const DIAS_DE_CALENDARIO = 14;

const comoFecha = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

function limitesDelDia(fecha: string, tz: string): { desde: string; hasta: string } {
  return {
    desde: instanteLocal(fecha, "00:00", tz).toISOString(),
    hasta: instanteLocal(sumarDias(fecha, 1), "00:00", tz).toISOString(),
  };
}

type FilaMensaje = {
  id: string;
  enviado_at: Date | string;
  direccion: string;
  tipo: string;
  contenido: string | null;
  transcripcion: string | null;
  no_enviado_motivo: string | null;
};

const aMensaje = (f: FilaMensaje): MensajeCharla => ({
  id: f.id,
  at: comoFecha(f.enviado_at),
  direccion: f.direccion === "entrante" ? "entrante" : "saliente",
  tipo: f.tipo,
  contenido: f.contenido,
  transcripcion: f.transcripcion,
  noEnviado: f.no_enviado_motivo,
});

const COLUMNAS_MENSAJE = "id::text as id, enviado_at, direccion, tipo, contenido, transcripcion, no_enviado_motivo";

export type RepositorioSql = Repositorio & { pedirRelevo(fecha: string, relevo: number): Promise<void> };

export function repositorioSql(db: Db, tz: string): RepositorioSql {
  return {
    async candidatas(fecha) {
      const { desde, hasta } = limitesDelDia(fecha, tz);
      // Primero las que terminaron pasando al equipo y las de más mensajes del cliente: si la noche
      // llega al tope, que lo que quede sin mirar sean las charlas más tranquilas.
      const filas = await db.consulta<{ id: string }>(
        `select co.id::text as id
           from conversaciones co
           join clientes c on c.id = co.cliente_id
          where co.canal = 'whatsapp'
            and c.telefono not like $3
            and exists (
              select 1 from mensajes m
               where m.conversacion_id = co.id
                 and m.direccion = 'saliente' and m.tipo <> 'template'
                 and coalesce(m.contenido, '') not like '[mostrador]%'
                 and m.enviado_at >= $1::timestamptz and m.enviado_at < $2::timestamptz)
          order by
            exists (select 1 from derivaciones d
                     where d.conversacion_id = co.id and d.creado_at >= $1::timestamptz and d.creado_at < $2::timestamptz) desc,
            (select count(*) from mensajes m
              where m.conversacion_id = co.id and m.direccion = 'entrante'
                and m.enviado_at >= $1::timestamptz and m.enviado_at < $2::timestamptz) desc,
            co.id`,
        [desde, hasta, `${PREFIJO_TELEFONO_FICTICIO}%`],
      );
      return filas.map((f) => f.id);
    },

    async prepararNoche(fecha) {
      // Una charla que quedó «analizando» con los intentos gastados es de una corrida que se murió dos
      // veces con ella: queda como fallo, así la noche puede cerrar.
      await db.consulta(
        `update analisis_revisiones
            set estado = 'fallo', detalle = 'la corrida se cortó dos veces analizando esta charla', terminada_at = now()
          where fecha = $1::date and estado = 'analizando' and intentos >= $2
            and tomada_at < now() - ($3::int * interval '1 second')`,
        [fecha, TOPES.maxIntentos, Math.round(TOPES.vencimientoTomaMs / 1000)],
      );
      const filas = await db.consulta<{ id: string; estado: Revision["estado"]; intentos: number; costo: number; tomada_at: Date | string }>(
        `select conversacion_id::text as id, estado, intentos, costo_usd::float8 as costo, tomada_at
           from analisis_revisiones where fecha = $1::date`,
        [fecha],
      );
      return filas.map((f) => ({
        conversacionId: f.id,
        estado: f.estado,
        intentos: Number(f.intentos),
        costoUsd: Number(f.costo),
        tomadaAt: comoFecha(f.tomada_at),
      }));
    },

    async tomar(fecha, conversacionId) {
      // insert … on conflict: si dos corridas se pisan, una sola la toma. Se retoma solo una que falló
      // o una que quedó colgada (la corrida que la tenía se murió), con intentos de sobra.
      const filas = await db.consulta<{ intentos: number }>(
        `insert into analisis_revisiones as r (fecha, conversacion_id, estado, intentos, tomada_at)
         values ($1::date, $2::uuid, 'analizando', 1, now())
         on conflict (fecha, conversacion_id) do update
            set estado = 'analizando', intentos = r.intentos + 1, tomada_at = now(), detalle = null, terminada_at = null
          where r.intentos < $3
            and (r.estado = 'fallo'
                 or (r.estado = 'analizando' and r.tomada_at < now() - ($4::int * interval '1 second')))
         returning intentos`,
        [fecha, conversacionId, TOPES.maxIntentos, Math.round(TOPES.vencimientoTomaMs / 1000)],
      );
      return filas.length ? Number(filas[0].intentos) : null;
    },

    async cargarCharla(fecha, conversacionId) {
      const { desde, hasta } = limitesDelDia(fecha, tz);
      const [conv] = await db.consulta<{ estado: string; lucia_activa: boolean; cliente_id: string; nombre: string | null }>(
        `select co.estado, co.lucia_activa, c.id::text as cliente_id, c.nombre
           from conversaciones co join clientes c on c.id = co.cliente_id
          where co.id = $1::uuid`,
        [conversacionId],
      );
      if (!conv) throw new Error("la charla no existe");
      const [libreta, delDia, antes, eventos, turnos] = await Promise.all([
        leerFicha(db, conv.cliente_id),
        db.consulta<FilaMensaje>(
          `select ${COLUMNAS_MENSAJE} from mensajes
            where conversacion_id = $1::uuid and enviado_at >= $2::timestamptz and enviado_at < $3::timestamptz
            order by enviado_at, id`,
          [conversacionId, desde, hasta],
        ),
        db.consulta<FilaMensaje>(
          `select ${COLUMNAS_MENSAJE} from mensajes
            where conversacion_id = $1::uuid and enviado_at < $2::timestamptz
            order by enviado_at desc, id desc limit $3`,
          [conversacionId, desde, MENSAJES_DE_CONTEXTO],
        ),
        db.consulta<{ tipo: string; detalle: unknown; creado_at: Date | string }>(
          `select tipo, detalle, creado_at from eventos_agente
            where conversacion_id = $1::uuid and creado_at >= $2::timestamptz and creado_at < $3::timestamptz
            order by creado_at, id`,
          [conversacionId, desde, hasta],
        ),
        db.consulta<{ inicio: Date | string; estado: string; tipo: string | null; creado_at: Date | string }>(
          `select inicio, estado, tipo, creado_at from turnos
            where cliente_id = $1::uuid and (fin >= $2::timestamptz or creado_at >= $2::timestamptz)
            order by inicio limit 10`,
          [conv.cliente_id, desde],
        ),
      ]);
      const charla: CharlaDelDia = {
        conversacionId,
        cliente: libreta.nombre ?? conv.nombre,
        estado: conv.estado,
        luciaActiva: Boolean(conv.lucia_activa),
        libreta,
        antes: antes.map(aMensaje).reverse(),
        delDia: delDia.map(aMensaje),
        eventos: eventos.map((e) => ({
          at: comoFecha(e.creado_at),
          tipo: e.tipo,
          detalle: e.detalle && typeof e.detalle === "object" ? (e.detalle as Record<string, unknown>) : {},
        })),
        turnos: turnos.map((t) => ({ inicio: comoFecha(t.inicio), estado: t.estado, tipo: t.tipo, creadoAt: comoFecha(t.creado_at) })),
      };
      return charla;
    },

    async datosDeReferencia(fecha) {
      const [fragmentos, catalogo, accesorios, horario, sinTurnos] = await Promise.all([
        db.consulta<{ tema: string; titulo: string; texto: string }>(
          "select tema, titulo, texto from fragmentos where activo order by tema, titulo, id",
        ),
        db.consulta<{ modelo: string; precio: number }>(
          "select modelo, precio_base::float8 as precio from catalogo_alquiler where activo order by modelo, id",
        ),
        db.consulta<{ nombre: string; precio: number; precio_compra: number | null }>(
          "select nombre, precio::float8 as precio, precio_compra::float8 as precio_compra from accesorios_alquiler where activo order by nombre, id",
        ),
        leerHorarioDelLocal(db),
        diasSinTurnos(db, fecha, sumarDias(fecha, DIAS_DE_CALENDARIO - 1)),
      ]);
      return {
        fragmentos: fragmentos.map((f) => ({ tema: String(f.tema), titulo: String(f.titulo), texto: String(f.texto) })),
        catalogo: catalogo.map((c) => ({ modelo: String(c.modelo), precio: Number(c.precio) })),
        accesorios: accesorios.map((a) => ({
          nombre: String(a.nombre),
          precio: Number(a.precio),
          precioCompra: a.precio_compra === null ? null : Number(a.precio_compra),
        })),
        calendario: armarCalendario(fecha, horario, sinTurnos, DIAS_DE_CALENDARIO),
      };
    },

    async guardar(fecha, conversacionId, hallazgos, consumo) {
      // Una sola sentencia: los hallazgos, el consumo y la revisión quedan juntos o no queda nada (la
      // conexión es una sola para las charlas que se analizan a la vez: un begin/commit acá se
      // mezclaría con las sentencias de otra charla).
      // consumo_llm va sin conversacion_id: el análisis no es un turno de esa charla, y así el costo
      // de cada charla en la bitácora sigue siendo solo lo que gastó Lucía. El total del día (que sí
      // lo incluye) lo suma la Bitácora por fecha.
      await db.consulta(
        `with h as (
           insert into analisis_charlas
             (fecha, conversacion_id, mensaje_id, tipo, categoria, gravedad, autor_cita, cita, que_paso, que_conviene, tema, texto_sugerido, modelo)
           select $1::date, $2::uuid, x.mensaje_id, x.tipo, x.categoria, x.gravedad, x.autor_cita, x.cita, x.que_paso,
                  x.que_conviene, x.tema, x.texto_sugerido, $3
             from jsonb_to_recordset($4::jsonb) as x(
               mensaje_id uuid, tipo text, categoria text, gravedad text, autor_cita text, cita text, que_paso text,
               que_conviene text, tema text, texto_sugerido text)
           returning 1
         ), c as (
           insert into consumo_llm (conversacion_id, modelo, tokens_in, tokens_out, costo_usd)
           values (null, $3, $5, $6, $7)
           returning 1
         )
         update analisis_revisiones
            set estado = 'analizada', hallazgos = (select count(*) from h), modelo = $3,
                tokens_in = tokens_in + $5, tokens_out = tokens_out + $6, costo_usd = costo_usd + $7,
                detalle = null, terminada_at = now()
          where fecha = $1::date and conversacion_id = $2::uuid`,
        [
          fecha,
          conversacionId,
          consumo.modelo,
          JSON.stringify(hallazgos.map(aFila)),
          consumo.uso.tokensIn,
          consumo.uso.tokensOut,
          consumo.costoUsd,
        ],
      );
    },

    async fallo(fecha, conversacionId, detalle, consumo: Consumo | null) {
      await db.consulta(
        `with c as (
           insert into consumo_llm (conversacion_id, modelo, tokens_in, tokens_out, costo_usd)
           select null, $4::text, $5, $6, $7 where $4::text is not null
           returning 1
         )
         update analisis_revisiones
            set estado = 'fallo', detalle = left($3, 500), modelo = coalesce($4::text, modelo),
                tokens_in = tokens_in + $5, tokens_out = tokens_out + $6, costo_usd = costo_usd + $7,
                terminada_at = now()
          where fecha = $1::date and conversacion_id = $2::uuid`,
        [fecha, conversacionId, detalle, consumo?.modelo ?? null, consumo?.uso.tokensIn ?? 0, consumo?.uso.tokensOut ?? 0, consumo?.costoUsd ?? 0],
      );
    },

    async saltear(fecha, conversacionIds, detalle) {
      if (!conversacionIds.length) return;
      await db.consulta(
        `insert into analisis_revisiones (fecha, conversacion_id, estado, intentos, detalle, terminada_at)
         select $1::date, x, 'salteada', 0, $3, now() from unnest($2::uuid[]) as x
         on conflict (fecha, conversacion_id) do nothing`,
        [fecha, conversacionIds, detalle],
      );
    },

    async pedirRelevo(fecha, relevo) {
      await db.consulta("select analista_relevo($1::date, $2::int)", [fecha, relevo]);
    },
  };
}

// Un hallazgo como fila de analisis_charlas (para jsonb_to_recordset).
function aFila(h: Hallazgo) {
  return {
    mensaje_id: h.mensajeId,
    tipo: h.tipo,
    categoria: h.categoria,
    gravedad: h.gravedad,
    autor_cita: h.autorCita,
    cita: h.cita,
    que_paso: h.quePaso,
    que_conviene: h.queConviene,
    tema: h.tema,
    texto_sugerido: h.textoSugerido,
  };
}
