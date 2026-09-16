// El worker de 2.1 contra la base real, adentro de una transacción que termina en rollback: el
// turno de Lucía es un doble (no se llama al LLM) y Meta también (un fetch que anota lo que se le
// mandó). Se prueba lo de logica: a quién le contesta Lucía, un solo turno por ráfaga, la espera
// de 4 s, la entrega burbuja por burbuja, qué pasa si Meta falla y el botón "Confirmo".
// Correr: deno test --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=.env supabase/functions/worker

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { calendarioPropio } from "../_shared/agenda/calendario_propio.ts";
import { type ClienteSql, type Db, dbDesde } from "../_shared/db.ts";
import type { ParametrosTurno, ResultadoTurno } from "../_shared/turno/turno.ts";
import { HASTA_UN_MENSAJE } from "../_shared/whatsapp/preparar.ts";
import {
  atenderCola,
  type Dependencias,
  esperaDeRafagaMs,
  leerListaTelefonos,
  PAUSA_REINTENTO_MS,
  QUIETUD_RAFAGA_MS,
  urlDeFoto,
} from "./atender.ts";

// Teléfonos que no existen (característica 000). TEL no lleva el prefijo de los ficticios: para el
// worker es un número de verdad y le "manda" por Meta, que acá es un doble.
const TEL = "5490000019101"; // en la lista de Lucía
const TEL_AFUERA = "5490000019102"; // fuera de la lista
const TEL_FICTICIO = "5490000000103"; // ficticio: no sale nada por Meta
const BASE_FOTOS = "https://ejemplo.supabase.co/storage/v1/object/public/catalogo/";
// Dos párrafos ya preparados (sin ¡ ni ¿) que juntos pasan los 300 caracteres: salen como dos
// mensajes, uno por párrafo (2.2).
const RESPUESTAS = [
  "Hola, soy Lucía, de Mr Otto. Te cuento cómo es: venís con turno al local, te probás los modelos que más te gusten y en sastrería lo ajustan a tu medida para el día del evento.",
  "Para qué evento es el traje? Si ya tenés la fecha, pasámela y te busco un horario para que vengas a probártelo con tiempo, sin apuro y con asesoramiento.",
];

function urlDeLaBase(): string {
  const u = Deno.env.get("SUPABASE_DB_URL");
  if (!u) throw new Error("Falta SUPABASE_DB_URL: corré los tests con --env-file=.env");
  return u;
}

type Contexto = { sql: pg.Client; db: Db; t0: Date };

function prueba(nombre: string, fn: (c: Contexto) => Promise<void>) {
  Deno.test({
    name: nombre,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const sql = new pg.Client({ connectionString: urlDeLaBase() });
      await sql.connect();
      try {
        await sql.query("begin");
        try {
          // El worker toma el trabajo pendiente más viejo: con uno real en la cola, la prueba se
          // llevaría el de un cliente de verdad.
          const reales = (await sql.query("select count(*)::int as n from cola_trabajos where estado = 'pendiente'")).rows[0].n;
          if (reales > 0) throw new Error(`hay ${reales} trabajo(s) reales pendientes en la cola: esperá a que el worker los tome`);
          // Que el trigger no despierte al worker desplegado por los trabajos de la prueba.
          await sql.query("set local otto.sin_disparo = 'on'");
          const t0 = (await sql.query("select now() as n")).rows[0].n as Date;
          await fn({ sql, db: dbDesde(sql as unknown as ClienteSql), t0 });
        } finally {
          await sql.query("rollback");
        }
      } finally {
        await sql.end();
      }
    },
  });
}

// Como lo haría el webhook: cliente, charla, mensaje y trabajo, con la hora de Meta.
async function mensajeDelCliente(c: Contexto, telefono: string, texto: string, segundos = 0, crudo?: Record<string, unknown>) {
  const tipo = crudo?.type === "button" ? "button" : "texto";
  await c.sql.query("select registrar_mensaje_entrante($1, $2, null, $3, $4, $5::timestamptz, $6::jsonb)", [
    `wamid.PRUEBA21-${crypto.randomUUID()}`,
    telefono,
    tipo,
    texto,
    new Date(c.t0.getTime() + segundos * 1000).toISOString(),
    JSON.stringify(crudo ?? { type: "text", text: { body: texto } }),
  ]);
}

// Hace lo mismo que correrTurno con la base (paso 9: cada burbuja como fila 'saliente', sin
// wamid) y devuelve lo que se le diga.
function turnoDoble(respuestas: string[], extra: Partial<ResultadoTurno> = {}) {
  const llamadas: ParametrosTurno[] = [];
  const fn = async (db: Db, p: ParametrosTurno): Promise<ResultadoTurno> => {
    llamadas.push(p);
    let t = p.ahora.getTime();
    for (const texto of respuestas) {
      t += 10;
      await db.consulta(
        "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, 'saliente', 'texto', $2, $3::timestamptz)",
        [p.conversacionId, texto, new Date(t).toISOString()],
      );
    }
    return { mensajesAlCliente: respuestas, imagenes: [], derivo: false, bloqueadoPorVentana: false, ...extra };
  };
  return { fn, llamadas };
}

function metaDoble(falla: (intento: number) => boolean = () => false) {
  const envios: Record<string, unknown>[] = [];
  let intentos = 0;
  const fetcher = ((_url: string | URL | Request, init?: RequestInit) => {
    const i = intentos++;
    if (falla(i)) return Promise.resolve(Response.json({ error: { message: "Meta caída (doble)" } }, { status: 500 }));
    envios.push(JSON.parse(String(init?.body)));
    return Promise.resolve(Response.json({ messages: [{ id: `wamid.SALIDA-${i}` }] }));
  }) as typeof fetch;
  return { fetcher, envios };
}

function reloj(inicio: Date) {
  let t = inicio.getTime();
  const dormidas: number[] = [];
  return {
    ahora: () => new Date(t),
    dormir: (ms: number) => {
      dormidas.push(ms);
      t += ms;
      return Promise.resolve();
    },
    dormidas,
  };
}

type Opciones = { respuestas?: string[]; resultado?: Partial<ResultadoTurno>; falla?: (i: number) => boolean; desdeSeg?: number };

function armar(c: Contexto, o: Opciones = {}) {
  const turno = turnoDoble(o.respuestas ?? RESPUESTAS, o.resultado);
  const meta = metaDoble(o.falla);
  const r = reloj(new Date(c.t0.getTime() + (o.desdeSeg ?? 10) * 1000));
  const d: Dependencias = {
    wa: { token: "t", phoneNumberId: "1" },
    telefonosLucia: leerListaTelefonos(`${TEL}, ${TEL_FICTICIO}`),
    enviosEncendidos: false,
    tz: "America/Argentina/Cordoba",
    derivacionTel: null,
    baseFotos: BASE_FOTOS,
    calendario: calendarioPropio,
    turno: turno.fn,
    fetcher: meta.fetcher,
    ahora: r.ahora,
    dormir: r.dormir,
  };
  return { d, turno, meta, reloj: r };
}

async function salientes(c: Contexto, telefono: string) {
  return (await c.sql.query(
    `select m.tipo, m.contenido, m.wa_message_id from mensajes m
       join conversaciones cv on cv.id = m.conversacion_id join clientes cl on cl.id = cv.cliente_id
      where cl.telefono = $1 and m.direccion = 'saliente' order by m.enviado_at`,
    [telefono],
  )).rows as { tipo: string; contenido: string; wa_message_id: string | null }[];
}

async function trabajos(c: Contexto, telefono: string) {
  return (await c.sql.query(
    `select t.estado, t.payload from cola_trabajos t
       join conversaciones cv on cv.id = t.conversacion_id join clientes cl on cl.id = cv.cliente_id
      where cl.telefono = $1 order by t.creado_at, t.id`,
    [telefono],
  )).rows as { estado: string; payload: Record<string, unknown> }[];
}

async function eventos(c: Contexto, telefono: string) {
  return (await c.sql.query(
    `select e.tipo, e.detalle from eventos_agente e
       join conversaciones cv on cv.id = e.conversacion_id join clientes cl on cl.id = cv.cliente_id
      where cl.telefono = $1 order by e.creado_at`,
    [telefono],
  )).rows as { tipo: string; detalle: Record<string, unknown> }[];
}

const textoDe = (envio: Record<string, unknown>) => (envio.text as { body: string } | undefined)?.body;

// ── puras ────────────────────────────────────────────────────────────────────────────────────

Deno.test("LUCIA_TELEFONOS: lista con espacios, '*' para todos y vacío para nadie", () => {
  const lista = leerListaTelefonos(" 5493410000001 ,5493410000002,");
  assertEquals([...lista.numeros], ["5493410000001", "5493410000002"]);
  assertEquals(lista.todos, false);
  assertEquals(leerListaTelefonos("*").todos, true);
  const nadie = leerListaTelefonos(undefined);
  assertEquals([nadie.todos, nadie.numeros.size], [false, 0]);
});

Deno.test("foto del catálogo: la ruta del bucket se vuelve el link público; un link entero queda igual", () => {
  assertEquals(urlDeFoto(BASE_FOTOS, "modelo-1/frente azul.png"), `${BASE_FOTOS}modelo-1/frente%20azul.png`);
  assertEquals(urlDeFoto(BASE_FOTOS.slice(0, -1), "/a.png"), `${BASE_FOTOS}a.png`);
  assertEquals(urlDeFoto(BASE_FOTOS, "https://otro.com/x.jpg"), "https://otro.com/x.jpg");
});

Deno.test("quietud de la ráfaga: cuánto falta para los 4 s desde el último mensaje", () => {
  const t = new Date("2030-06-05T15:00:00-03:00");
  assertEquals(esperaDeRafagaMs(t, new Date(t.getTime() + 1_000)), QUIETUD_RAFAGA_MS - 1_000);
  assertEquals(esperaDeRafagaMs(t, new Date(t.getTime() + 5_000)), 0);
});

// ── contra la base ───────────────────────────────────────────────────────────────────────────

prueba("Lucía contesta: corre el turno una vez, manda cada burbuja por Meta y guarda su wamid", async (c) => {
  await mensajeDelCliente(c, TEL, "hola, quiero sacar un turno");
  const { d, turno, meta } = armar(c);

  assertEquals(await atenderCola(c.db, d, "worker-prueba"), 1);
  assertEquals(turno.llamadas.length, 1);
  assertEquals(turno.llamadas[0].calendario, calendarioPropio);
  assertEquals(meta.envios.map((e) => [e.to, textoDe(e)]), RESPUESTAS.map((r) => [TEL, r]));
  assertEquals((await salientes(c, TEL)).map((s) => [s.contenido, s.wa_message_id]), [
    [RESPUESTAS[0], "wamid.SALIDA-0"],
    [RESPUESTAS[1], "wamid.SALIDA-1"],
  ]);
  assertEquals((await trabajos(c, TEL)).map((t) => t.estado), ["hecho"]);
  const ev = (await eventos(c, TEL)).find((e) => e.detalle.etapa === "worker-lucia");
  assertEquals([ev?.tipo, ev?.detalle.enviadas], ["ok", 2]);
});

prueba("lo que sale va preparado (2.2): sin ¡ ni ¿, lo corto en un solo mensaje, y la charla guarda eso mismo", async (c) => {
  assert(RESPUESTAS.join("\n\n").length > HASTA_UN_MENSAJE); // las de siempre siguen siendo dos mensajes
  await mensajeDelCliente(c, TEL, "hola");
  const { d, meta } = armar(c, { respuestas: ["¡Hola! Soy Lucía, de Mr Otto.", "¿Para qué evento es el traje?"] });

  await atenderCola(c.db, d, "worker-prueba");
  const esperado = "Hola! Soy Lucía, de Mr Otto.\n\nPara qué evento es el traje?";
  assertEquals(meta.envios.map(textoDe), [esperado]);
  assertEquals((await salientes(c, TEL)).map((s) => [s.contenido, s.wa_message_id]), [[esperado, "wamid.SALIDA-0"]]);
});

prueba("ráfaga: tres mensajes seguidos → un solo turno, y los otros dos trabajos quedan absorbidos", async (c) => {
  await mensajeDelCliente(c, TEL, "hola");
  await mensajeDelCliente(c, TEL, "quiero alquilar un traje", 1);
  await mensajeDelCliente(c, TEL, "es para un casamiento", 2);
  const { d, turno, meta } = armar(c);

  assertEquals(await atenderCola(c.db, d, "worker-prueba"), 1);
  assertEquals(turno.llamadas.length, 1);
  assertEquals(meta.envios.length, RESPUESTAS.length);
  const ts = await trabajos(c, TEL);
  assertEquals(ts.map((t) => t.estado), ["hecho", "hecho", "hecho"]);
  assertEquals(ts.filter((t) => t.payload.absorbido_por).length, 2);
});

prueba("un mensaje que llega después de que arrancó el turno no se absorbe: tiene su propio turno", async (c) => {
  await mensajeDelCliente(c, TEL, "hola");
  await mensajeDelCliente(c, TEL, "y cuanto sale?", 20); // Meta lo fechó después del arranque (t0 + 10 s)
  const { d, turno } = armar(c);

  assertEquals(await atenderCola(c.db, d, "worker-prueba"), 2);
  assertEquals(turno.llamadas.length, 2);
  assertEquals((await trabajos(c, TEL)).filter((t) => t.payload.absorbido_por).length, 0);
});

prueba("espera 4 s de quietud desde el último mensaje antes de correr el turno", async (c) => {
  await mensajeDelCliente(c, TEL, "hola");
  const { d, turno, reloj: r } = armar(c, { desdeSeg: 1 });

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals(r.dormidas, [QUIETUD_RAFAGA_MS - 1_000]);
  assertEquals(turno.llamadas[0].ahora.getTime(), c.t0.getTime() + QUIETUD_RAFAGA_MS);
});

prueba("número fuera de LUCIA_TELEFONOS: ni turno ni Meta, y queda anotado", async (c) => {
  await mensajeDelCliente(c, TEL_AFUERA, "hola");
  const { d, turno, meta } = armar(c);

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals([turno.llamadas.length, meta.envios.length], [0, 0]);
  assertEquals((await trabajos(c, TEL_AFUERA)).map((t) => t.estado), ["hecho"]);
  assert((await eventos(c, TEL_AFUERA)).some((e) => String(e.detalle.nota).includes("fuera de LUCIA_TELEFONOS")));
});

prueba("charla derivada: la tiene una persona, Lucía no contesta", async (c) => {
  await mensajeDelCliente(c, TEL, "hola");
  await c.sql.query(
    "update conversaciones set estado = 'derivada' where cliente_id = (select id from clientes where telefono = $1)",
    [TEL],
  );
  const { d, turno, meta } = armar(c);

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals([turno.llamadas.length, meta.envios.length], [0, 0]);
});

prueba("teléfono ficticio: corre el turno y guarda la respuesta, pero no sale nada por Meta", async (c) => {
  await mensajeDelCliente(c, TEL_FICTICIO, "hola");
  const { d, turno, meta } = armar(c);

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals([turno.llamadas.length, meta.envios.length], [1, 0]);
  assertEquals((await salientes(c, TEL_FICTICIO)).map((s) => [s.contenido, s.wa_message_id]), RESPUESTAS.map((r) => [r, null]));
  const ev = (await eventos(c, TEL_FICTICIO)).find((e) => e.detalle.etapa === "worker-lucia");
  assertEquals(ev?.detalle.simulado, true);
});

prueba("un teléfono ficticio no necesita estar en LUCIA_TELEFONOS: Lucía le contesta igual, sin Meta", async (c) => {
  const OTRO_FICTICIO = "5490000000104";
  await mensajeDelCliente(c, OTRO_FICTICIO, "hola");
  const { d, turno, meta } = armar(c);

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals([turno.llamadas.length, meta.envios.length], [1, 0]);
});

prueba("el mostrador: el mensaje del equipo sale por Meta sin la marca, con su wamid, y no pasa por Lucía", async (c) => {
  await mensajeDelCliente(c, TEL_AFUERA, "hola, necesito hablar con alguien"); // fuera de la lista: igual sale
  const conv = (await c.sql.query(
    "select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1",
    [TEL_AFUERA],
  )).rows[0].id;
  await c.sql.query("update conversaciones set estado = 'derivada' where id = $1", [conv]);
  const texto = "Hola, soy Ana del local. ¿Te llamo?";
  const { mensaje_id } = (await c.sql.query("select mostrador_enviar($1, $2) as r", [conv, texto])).rows[0].r;
  const { d, turno, meta } = armar(c);

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals(turno.llamadas.length, 0);
  assertEquals(meta.envios.map(textoDe), [texto]);
  const m = (await c.sql.query("select contenido, wa_message_id from mensajes where id = $1", [mensaje_id])).rows[0];
  assertEquals([m.contenido, m.wa_message_id], [`[mostrador] ${texto}`, "wamid.SALIDA-0"]);
  const ev = (await eventos(c, TEL_AFUERA)).find((e) => e.detalle.etapa === "mostrador");
  assertEquals(ev?.tipo, "ok");
});

prueba("una caída de Meta se salva con el reintento: salen las dos burbujas", async (c) => {
  await mensajeDelCliente(c, TEL, "hola");
  const { d, meta, reloj: r } = armar(c, { falla: (i) => i === 0 });

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals(meta.envios.map(textoDe), RESPUESTAS);
  assert(r.dormidas.includes(PAUSA_REINTENTO_MS));
  assertEquals((await salientes(c, TEL)).every((s) => s.wa_message_id), true);
});

prueba("Meta falla dos veces en la segunda burbuja: sale la primera, la otra se borra de la charla y queda en la bitácora", async (c) => {
  await mensajeDelCliente(c, TEL, "hola");
  const { d, turno, meta } = armar(c, { falla: (i) => i >= 1 });

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals(turno.llamadas.length, 1); // el turno no se repite
  assertEquals(meta.envios.map(textoDe), [RESPUESTAS[0]]);
  assertEquals((await salientes(c, TEL)).map((s) => s.contenido), [RESPUESTAS[0]]);
  const error = (await eventos(c, TEL)).find((e) => e.tipo === "error" && e.detalle.etapa === "envio");
  assertEquals(error?.detalle.sin_enviar, [RESPUESTAS[1]]);
  assertEquals((await trabajos(c, TEL)).map((t) => t.estado), ["hecho"]);
});

prueba("fotos del catálogo: después del texto sale cada foto con su link público y queda en la charla", async (c) => {
  await mensajeDelCliente(c, TEL, "tenes fotos?");
  const { d, meta } = armar(c, { respuestas: ["Te paso las fotos."], resultado: { imagenes: ["modelo-1/frente azul.png"] } });

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals(meta.envios.map((e) => e.type), ["text", "image"]);
  assertEquals((meta.envios[1].image as { link: string }).link, `${BASE_FOTOS}modelo-1/frente%20azul.png`);
  assertEquals((await salientes(c, TEL)).map((s) => s.tipo), ["texto", "imagen"]);
});

prueba("fuera de la ventana de 24 hs no sale texto libre: se borra de la charla y queda el error", async (c) => {
  await mensajeDelCliente(c, TEL, "hola", -25 * 3600); // Meta lo fechó hace 25 hs
  const { d, meta } = armar(c);

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals(meta.envios.length, 0);
  assertEquals((await salientes(c, TEL)).length, 0);
  assert((await eventos(c, TEL)).some((e) => e.tipo === "error" && String(e.detalle.error).includes("ventana")));
});

prueba("el botón Confirmo sigue confirmando el turno en código, sin pasar por Lucía", async (c) => {
  const cliente = (await c.sql.query("insert into clientes (telefono, nombre) values ($1, 'Prueba 2.1') returning id", [TEL])).rows[0].id;
  const turnoId = (await c.sql.query(
    `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin)
     values ($1, 'invitado', 45, 1, '2030-06-12T14:00:00-03:00', '2030-06-12T14:45:00-03:00') returning id`,
    [cliente],
  )).rows[0].id;
  await mensajeDelCliente(c, TEL, "Confirmo", 0, { type: "button", button: { text: "Confirmo", payload: `CONFIRMO:${turnoId}` } });
  const { d, turno, meta } = armar(c);

  await atenderCola(c.db, d, "worker-prueba");
  assertEquals(turno.llamadas.length, 0);
  const t = (await c.sql.query("select confirmado, confirmado_por from turnos where id = $1", [turnoId])).rows[0];
  assertEquals([t.confirmado, t.confirmado_por], [true, "cliente"]);
  assertEquals(meta.envios.length, 1); // el texto fijo texto_turno_confirmado
});
