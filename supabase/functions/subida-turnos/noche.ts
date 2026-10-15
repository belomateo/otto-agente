// Subida de turnos — la corrida de la noche. Para cada charla de WhatsApp con movimiento desde el principio de
// ayer (Lucía, el local, charlas pasadas al equipo o con Lucía apagada): el lector la lee, el verificador decide
// y el cargador escribe. Todo queda registrado en subida_turnos (0105), también en modo prueba.
//
// Dos modos (SUBIDA_TURNOS_MODO, o el campo `modo` del pedido):
//  · «prueba» (el de siempre mientras Mateo no diga otra cosa): lee, decide y anota qué haría. No toca turnos
//    ni etiquetas.
//  · «real»: además carga o mueve el turno y pone la etiqueta «Falta datos para agendar».
// Una charla ya registrada en la corrida de hoy no se vuelve a leer (correrla dos veces no gasta ni duplica).

import type { Db } from "../_shared/db.ts";
import { TIPOS_TURNO, type TipoTurno } from "../_shared/enums.ts";
import { diasSinTurnos } from "../_shared/agenda/huecos.ts";
import { leerFicha } from "../_shared/herramientas/ficha.ts";
import { fechaLocal, instanteLocal, sumarDias } from "../_shared/tiempo.ts";
import { cargarTurno, duracionDelTipo, moverTurno } from "./cargador.ts";
import { type Acuerdo, charlaParaElLector, leerAcuerdo, type MensajeDeLaCharla } from "./lector.ts";
import { type Decision, type TurnoDelCliente, verificar } from "./verificador.ts";

export const ETIQUETA_FALTA_DATOS = "Falta datos para agendar";
export type Modo = "prueba" | "real";

export type ResumenNoche = {
  corrida: string;
  modo: Modo;
  charlas: number;
  leidas: number;
  cargados: string[];
  movidos: string[];
  yaEstaban: number;
  pasados: number;
  faltaDatos: string[];
  dudosos: string[];
  sinAcuerdo: number;
  fallos: string[];
  pendientes: number;
};

export type DepsNoche = {
  leer?: (charla: string) => Promise<Acuerdo | null>;
  ahora: Date;
  tz: string;
  modo: Modo;
  // Tope por llamada: una Edge Function vive ~150 s. Lo que no entra queda para la corrida de contención.
  tiempoMaximoMs?: number;
  desde?: Date; // por defecto: el principio de ayer en hora local
  conversaciones?: string[]; // solo estas (las pruebas); por defecto, todas
};

type Charla = { id: string; clienteId: string; nombre: string; tel: string; etiquetas: string[] };

export async function correrNoche(db: Db, deps: DepsNoche): Promise<ResumenNoche> {
  const leer = deps.leer ?? ((c: string) => leerAcuerdo(c));
  const hoy = fechaLocal(deps.ahora, deps.tz);
  const desde = deps.desde ?? instanteLocal(sumarDias(hoy, -1), "00:00", deps.tz);
  const limite = Date.now() + (deps.tiempoMaximoMs ?? 120_000);
  const resumen: ResumenNoche = {
    corrida: hoy, modo: deps.modo, charlas: 0, leidas: 0, cargados: [], movidos: [], yaEstaban: 0, pasados: 0,
    faltaDatos: [], dudosos: [], sinAcuerdo: 0, fallos: [], pendientes: 0,
  };

  const charlas = await db.consulta<{ id: string; cliente_id: string; nombre: string | null; tel: string; etiquetas: string[] | null }>(
    `select v.id::text as id, v.cliente_id::text as cliente_id, c.nombre, right(c.telefono, 4) as tel, v.etiquetas
       from conversaciones v join clientes c on c.id = v.cliente_id
      where (v.canal = 'whatsapp' or $3::uuid[] is not null)
        and exists (select 1 from mensajes m where m.conversacion_id = v.id and m.enviado_at >= $1::timestamptz)
        and not exists (select 1 from subida_turnos s where s.corrida = $2::date and s.conversacion_id = v.id and s.accion <> 'fallo')
        and ($3::uuid[] is null or v.id = any($3::uuid[]))
      order by (select max(enviado_at) from mensajes m where m.conversacion_id = v.id) desc`,
    [desde.toISOString(), hoy, deps.conversaciones ?? null],
  );
  resumen.charlas = charlas.length;

  // Domingos, feriados y días cerrados (cierres_agenda y feriados_posibles), 90 días hacia adelante.
  const cierres = await diasSinTurnos(db, hoy, sumarDias(hoy, 90));
  const diaSinTurnos = (ymd: string) => {
    const c = cierres.get(ymd);
    return c ? (c.motivo || "el local está cerrado ese día") + (c.posibleFeriado ? " (posible feriado sin definir)" : "") : null;
  };

  for (let i = 0; i < charlas.length; i++) {
    if (Date.now() > limite) {
      resumen.pendientes = charlas.length - i;
      break;
    }
    const ch: Charla = { id: charlas[i].id, clienteId: charlas[i].cliente_id, nombre: charlas[i].nombre ?? "(sin nombre)", tel: charlas[i].tel, etiquetas: charlas[i].etiquetas ?? [] };
    const etiqueta = `${ch.nombre} …${ch.tel}`;
    try {
      const mensajes = (await db.consulta<{ direccion: "entrante" | "saliente"; contenido: string | null; transcripcion: string | null; tipo: string | null; enviado_at: string }>(
        `select direccion, contenido, transcripcion, tipo, enviado_at from (
            select direccion, contenido, transcripcion, tipo, enviado_at from mensajes
             where conversacion_id = $1::uuid order by enviado_at desc limit 30) x
          order by enviado_at`,
        [ch.id],
      )).map((m): MensajeDeLaCharla => ({ ...m, enviadoAt: new Date(m.enviado_at) }));
      if (!mensajes.length) continue;

      const acuerdo = await leer(charlaParaElLector(mensajes, deps.ahora, deps.tz));
      resumen.leidas++;
      const turnos = (await db.consulta<{ id: string; inicio: string; estado: string }>(
        `select id::text as id, inicio, estado from turnos
          where cliente_id = $1::uuid and estado in ('sin-confirmar','confirmado') and fin > $2::timestamptz order by inicio`,
        [ch.clienteId, deps.ahora.toISOString()],
      )).map((t): TurnoDelCliente => ({ id: t.id, inicio: new Date(t.inicio), estado: t.estado }));

      const decision = verificar({
        acuerdo,
        textos: mensajes.map((m) => (m.contenido ?? "") + " " + (m.transcripcion ?? "")),
        turnosDelCliente: turnos,
        ahora: deps.ahora,
        tz: deps.tz,
        diaSinTurnos,
      });
      await aplicar(db, deps, resumen, ch, etiqueta, acuerdo, decision);
    } catch (e) {
      const motivo = String((e as Error)?.message ?? e).slice(0, 200);
      resumen.fallos.push(`${etiqueta}: ${motivo}`);
      await registrar(db, hoy, deps.modo, ch, "fallo", null, motivo, null, null).catch(() => {});
    }
  }
  return resumen;
}

async function aplicar(db: Db, deps: DepsNoche, r: ResumenNoche, ch: Charla, etiqueta: string, a: Acuerdo | null, d: Decision) {
  const real = deps.modo === "real";
  const cuando = (inicio: Date) => `${fechaLocal(inicio, deps.tz)} ${new Intl.DateTimeFormat("es-AR", { timeZone: deps.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(inicio)}`;
  const frase = a?.frase ?? null;
  switch (d.accion) {
    case "cargar":
    case "mover": {
      const ficha = await leerFicha(db, ch.clienteId);
      const rol = ficha.rol as TipoTurno | null;
      const tipo: TipoTurno = rol && (TIPOS_TURNO as readonly string[]).includes(rol) ? rol : "invitado";
      const dur = await duracionDelTipo(db, tipo);
      if (!real) {
        (d.accion === "cargar" ? r.cargados : r.movidos).push(`${etiqueta}: ${cuando(d.inicio)} (prueba, no se escribió)`);
        await registrar(db, r.corrida, deps.modo, ch, d.accion, d.inicio, `modo prueba: ${d.accion === "cargar" ? "cargaría" : "movería"}`, frase, null);
        return;
      }
      const res = d.accion === "cargar"
        ? await cargarTurno(db, { clienteId: ch.clienteId, tipo, inicio: d.inicio, duracionMin: dur })
        : await moverTurno(db, { turnoId: d.turnoId, inicio: d.inicio, duracionMin: dur });
      if (res.ok) {
        (d.accion === "cargar" ? r.cargados : r.movidos).push(`${etiqueta}: ${cuando(d.inicio)} (probador ${res.probador})`);
        await quitarEtiqueta(db, ch);
        await registrar(db, r.corrida, deps.modo, ch, d.accion, d.inicio, "listo", frase, res.turnoId);
      } else {
        r.dudosos.push(`${etiqueta}: ${cuando(d.inicio)} — ${res.motivo}`);
        await registrar(db, r.corrida, deps.modo, ch, "dudoso", d.inicio, res.motivo, frase, null);
      }
      return;
    }
    case "ya_esta":
      r.yaEstaban++;
      if (real) await quitarEtiqueta(db, ch);
      await registrar(db, r.corrida, deps.modo, ch, "ya_esta", d.inicio, "ya estaba cargado", frase, null);
      return;
    case "pasado":
      r.pasados++;
      await registrar(db, r.corrida, deps.modo, ch, "pasado", d.inicio, "el horario acordado ya pasó", frase, null);
      return;
    case "falta_datos":
      r.faltaDatos.push(`${etiqueta}: ${d.motivo}`);
      if (real) await ponerEtiqueta(db, ch);
      await registrar(db, r.corrida, deps.modo, ch, "falta_datos", null, d.motivo, frase, null);
      return;
    case "dudoso":
      r.dudosos.push(`${etiqueta}: ${d.motivo}`);
      await registrar(db, r.corrida, deps.modo, ch, "dudoso", null, d.motivo, frase, null);
      return;
    case "sin_acuerdo":
      r.sinAcuerdo++;
      await registrar(db, r.corrida, deps.modo, ch, "sin_acuerdo", null, a?.motivo ?? "", frase, null);
  }
}

async function registrar(db: Db, corrida: string, modo: Modo, ch: Charla, accion: string, inicio: Date | null, motivo: string, frase: string | null, turnoId: string | null) {
  await db.consulta(
    `insert into subida_turnos (corrida, conversacion_id, cliente_id, modo, accion, inicio, motivo, frase, turno_id)
     values ($1::date, $2::uuid, $3::uuid, $4, $5, $6::timestamptz, $7, $8, $9::uuid)
     on conflict (corrida, conversacion_id) do update
       set modo = excluded.modo, accion = excluded.accion, inicio = excluded.inicio, motivo = excluded.motivo,
           frase = excluded.frase, turno_id = excluded.turno_id, creado_at = now()`,
    [corrida, ch.id, ch.clienteId, modo, accion, inicio?.toISOString() ?? null, motivo.slice(0, 500), frase?.slice(0, 300) ?? null, turnoId],
  );
}

async function ponerEtiqueta(db: Db, ch: Charla) {
  await db.consulta(
    `update conversaciones set etiquetas = array_append(etiquetas, $2::text)
      where id = $1::uuid and not (etiquetas @> array[$2::text])`,
    [ch.id, ETIQUETA_FALTA_DATOS],
  );
}

async function quitarEtiqueta(db: Db, ch: Charla) {
  await db.consulta(`update conversaciones set etiquetas = array_remove(etiquetas, $2::text) where id = $1::uuid`, [ch.id, ETIQUETA_FALTA_DATOS]);
}
