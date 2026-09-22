// Los 20 guiones de AGENTE.md § 13 (los 14 originales; evento-manana-deriva —decisión #8 del
// 14/9—; cliente-enojado-deriva y mail-no-bloquea-la-reserva —pedido/hallazgo del 16/9—;
// catalogo-modelo-puntual y dos-turnos-permitidos —pedidos de Mateo, 16/9—;
// derivada-reclamo-sigue-agresion-calla —auditoría del 22/9—): un solo lugar con
// las conversaciones y los chequeos contra la base,
// para que el emulador (scripts/probar-turno.js) y el worker desplegado
// (tests/sql/guiones-desplegado.mjs) prueben EXACTAMENTE lo mismo — la misma razón por la que
// _shared/turno/turno.ts es un solo archivo para los dos: si cada runner tuviera su propia copia
// de los guiones, con el tiempo se desalinean y ninguna corrida prueba lo que dice probar.
//
// Cada guion es transporte-agnóstico: no tiene teléfono propio (cada runner arma el suyo, según
// su propia convención de teléfonos ficticios) ni sabe cómo se manda un mensaje. `verificar`
// recibe siempre lo mismo pase lo que pase por debajo: la conexión sql, el teléfono, la lista de
// respuestas (un array de arrays de string, una entrada por mensaje mandado) y, si el runner
// puede armarlo, un resumen del resultado final ({ motivo_derivacion } o null). Se verifica
// contra la BASE, no contra lo que dijo Lucía (principio 9): si dijo que agendó, hay fila en
// turnos; si derivó, hay fila en derivaciones con un motivo del enum; si dio un precio, hay
// consultar_catalogo en eventos_agente de ese turno.
"use strict";

const TZ = "America/Argentina/Cordoba";

// "Hoy" para estas fechas tiene que ser el "hoy" de Argentina (NEGOCIO_TZ, _shared/tiempo.ts), no
// el de UTC (ver la nota igual de probar-turno.js: pasadas las 21 hs en Rosario, UTC ya cruzó a
// mañana).
const formateadorArgentina = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
function fechaEnArgentina(diasDesdeAhora) {
  const partes = formateadorArgentina.formatToParts(new Date(Date.now() + diasDesdeAhora * 86_400_000));
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return { ymd: `${obj.year}-${obj.month}-${obj.day}`, esDomingo: obj.weekday === "Sun" };
}
function hoyMasDias(dias) {
  return fechaEnArgentina(dias).ymd;
}
const manana = () => hoyMasDias(1);

// Un domingo el local no atiende: nunca ofrecer ese día como "otro día para venir".
function diaHabilFuturo(dias) {
  let d = dias;
  while (fechaEnArgentina(d).esDomingo) d++;
  return fechaEnArgentina(d).ymd;
}

async function fila(sql, texto, valores = []) {
  return (await sql.query(texto, valores)).rows;
}

async function conversacionDe(sql, telefono) {
  return (await sql.query(
    `select c.id from conversaciones c join clientes cl on cl.id = c.cliente_id where cl.telefono = $1 order by c.iniciado_at desc limit 1`,
    [telefono],
  )).rows[0]?.id ?? null;
}

// El catálogo real puede estar vacío o tener otra cosa cargada (supuesto #15): los guiones que
// necesitan un precio siembran modelos TEMPORALES antes de correr y los borran al terminar.
async function sembrarCatalogo(sql) {
  await sql.query("update catalogo_alquiler set activo = false where activo");
  const ids = [];
  let orden = 0;
  for (const [modelo, precio, colores, talles] of [
    ["Clásico azul marino", 165000, ["Azul marino", "Negro"], ["44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64", "66", "68"]],
    ["Slim gris oxford", 195000, ["Gris"], ["44", "46", "48", "50", "52"]],
  ]) {
    const r = await sql.query(
      "insert into catalogo_alquiler (modelo, precio_base, colores, talles, fotos, orden) values ($1, $2, $3::jsonb, $4, $5, $6) returning id",
      [modelo, precio, JSON.stringify(colores.map((nombre) => ({ nombre, hex: "#000000" }))), talles, ["foto-de-prueba.jpg"], ++orden],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

async function borrarCatalogo(sql, ids) {
  for (const id of ids) await sql.query("delete from catalogo_alquiler where id = $1", [id]);
  await sql.query("update catalogo_alquiler set activo = true where not activo");
}

// Deja el teléfono como si nunca hubiera escrito: mensajes, bitácora, derivaciones, turnos,
// notas, la charla y (si el runner la usa) su cola. Sirve antes de arrancar (restos de una
// corrida cortada) y al terminar.
async function limpiarTelefono(sql, telefono) {
  const cli = (await sql.query("select id from clientes where telefono = $1", [telefono])).rows[0];
  if (!cli) return;
  const convs = (await sql.query("select id from conversaciones where cliente_id = $1", [cli.id])).rows.map((r) => r.id);
  for (const cid of convs) {
    await sql.query("delete from consumo_llm where conversacion_id = $1", [cid]);
    await sql.query("delete from eventos_agente where conversacion_id = $1", [cid]);
    await sql.query("delete from derivaciones where conversacion_id = $1", [cid]);
    await sql.query("delete from cola_trabajos where conversacion_id = $1", [cid]);
    await sql.query("delete from mensajes where conversacion_id = $1", [cid]);
  }
  const turnos = (await sql.query("select id from turnos where cliente_id = $1", [cli.id])).rows.map((r) => r.id);
  if (turnos.length) {
    await sql.query("delete from historial_ediciones where tabla = 'turnos' and fila_id = any($1::uuid[])", [turnos]);
    await sql.query("delete from turnos where id = any($1::uuid[])", [turnos]);
  }
  await sql.query("delete from historial_ediciones where tabla = 'clientes' and fila_id = $1", [cli.id]);
  await sql.query("delete from notas where cliente_id = $1", [cli.id]);
  await sql.query("delete from conversaciones where cliente_id = $1", [cli.id]);
  await sql.query("delete from clientes where id = $1", [cli.id]);
}

// crearGuiones() se llama una vez por corrida: EN_4_DIAS/EN_2_MESES quedan fijos apenas arranca
// (son datos DENTRO de un mensaje, no importa si de acá a que se verifiquen pasan minutos).
function crearGuiones() {
  const EN_4_DIAS = hoyMasDias(4);
  const EN_2_MESES = hoyMasDias(60);

  return {
    "novio-noche": {
      mensajes: ["hola", "me caso en octubre y quiero ver trajes", "es de noche, en un salon"],
      async verificar(sql, telefono, respuestas) {
        const todo = respuestas.flat().join(" ").toLowerCase();
        const cli = (await fila(sql, "select rol, evento, dia_o_noche from clientes where telefono=$1", [telefono]))[0];
        return [
          [/felicit/.test(todo), "en algún momento la dice felicitaciones (guion de novio)"],
          [cli?.evento === "casamiento", `evento quedó casamiento (fue: ${cli?.evento})`],
          [cli?.rol === "novio", `rol quedó novio (fue: ${cli?.rol})`],
          [cli?.dia_o_noche === "noche", `dia_o_noche quedó noche (fue: ${cli?.dia_o_noche})`],
        ];
      },
    },

    "invitado-casamiento": {
      mensajes: ["hola buenas", "me invitaron a un casamiento el mes que viene y no se q ponerme", "es de dia"],
      async verificar(sql, telefono) {
        const cli = (await fila(sql, "select rol, evento, dia_o_noche from clientes where telefono=$1", [telefono]))[0];
        return [
          [cli?.evento === "casamiento", `evento quedó casamiento (fue: ${cli?.evento})`],
          [cli?.rol === "invitado" || cli?.rol === null, `rol es invitado o no se aventuró (fue: ${cli?.rol})`],
        ];
      },
    },

    "graduado-desde-otra-ciudad": {
      mensajes: ["hola, estuve mirando la pagina", "mi hijo se recibe del secundario en noviembre y necesito un ambo", "somos de roldan, no de rosario"],
      async verificar(sql, telefono, respuestas) {
        const todo = respuestas.flat().join(" ").toLowerCase();
        const cli = (await fila(sql, "select evento, ciudad from clientes where telefono=$1", [telefono]))[0];
        return [
          [cli?.evento === "graduacion", `evento quedó graduacion (fue: ${cli?.evento})`],
          [cli?.ciudad !== null, `guardó la ciudad (fue: ${cli?.ciudad})`],
          [!/envia|mandamos a roldan/.test(todo), "no ofrece enviar el traje a otra ciudad (regla 10)"],
        ];
      },
    },

    "solo-precio": {
      necesitaCatalogo: true,
      mensajes: ["cuanto sale el alquiler de un traje"],
      async verificar(sql, telefono, respuestas) {
        const todo = respuestas.flat().join(" ");
        const convId = await conversacionDe(sql, telefono);
        const usoTool = (await fila(sql, "select 1 from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='consultar_catalogo' and (detalle->>'ok')::boolean", [convId])).length > 0;
        return [
          [usoTool, "hay consultar_catalogo en la bitácora de este turno"],
          // Corregido, auditoría 22/9: el `|| /\$/.test(todo)` de acá anulaba el chequeo entero —
          // cualquier $ suelto (aunque fuera un monto inventado) hacía pasar la condición. Sin
          // esa salida, solo pasa si el monto es EXACTAMENTE el que sembró sembrarCatalogo().
          [/\$\s?1[69]5\.?000|\$\s?165000|\$\s?195000/.test(todo.replace(/\s/g, "")), "el precio que dice es el monto exacto del catálogo sembrado"],
          [/sastrer|tintorer/i.test(todo), "menciona sastrería/tintorería junto con el precio"],
          [/\?/.test(todo), "no se queda solo en el precio: suma una pregunta (regla de oro)"],
        ];
      },
    },

    "urgente-misma-semana": {
      mensajes: [`hola, necesito un traje urgente, el evento es el ${EN_4_DIAS}`, "es un cumpleaños de 15 de mi sobrina"],
      async verificar(sql, telefono, respuestas) {
        const todo = respuestas.flat().join(" ").toLowerCase();
        return [
          // Corregido, auditoría 22/9: las dos de abajo son negativas y pasan igual con Lucía
          // completamente muda (una regex no matchea nada en un string vacío). Esta primera
          // asegura que en verdad contestó algo.
          [respuestas.flat().length > 0, "contestó algo, no se quedó muda"],
          [!/no (se puede|hay lugar|podemos)/.test(todo), "no dice que no se puede por lo urgente"],
          [!/no tenemos lugar|sin lugar/.test(todo), "no dice que no hay lugar sin antes buscar"],
        ];
      },
    },

    "pregunta-horarios": {
      mensajes: ["q horario tienen"],
      async verificar(sql, telefono, respuestas) {
        const todo = respuestas.flat().join(" ");
        const convId = await conversacionDe(sql, telefono);
        const usoInfo = (await fila(sql, "select 1 from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='buscar_informacion' and (detalle->>'ok')::boolean", [convId])).length > 0;
        return [
          [usoInfo, "llamó a buscar_informacion (no dice el horario de memoria)"],
          [/lunes|sabado/i.test(todo), "el horario que dice menciona los días"],
          [/\?/.test(todo), "suma una pregunta (qué día vendría), no se queda solo en el horario"],
        ];
      },
    },

    accesorios: {
      mensajes: ["hola, alquilan zapatos y cinturon tambien o solo el traje"],
      async verificar(sql, telefono) {
        const convId = await conversacionDe(sql, telefono);
        const usoTool = (await fila(sql, "select 1 from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='consultar_accesorios' and (detalle->>'ok')::boolean", [convId])).length > 0;
        return [[usoTool, "llamó a consultar_accesorios antes de contestar sobre zapatos/cinturón"]];
      },
    },

    "es-caro": {
      necesitaCatalogo: true,
      mensajes: ["hola cuanto sale un traje para casamiento", "uy que caro, en otro lado alquilan mas barato"],
      async verificar(sql, telefono, respuestas, resultadoFinal) {
        const ultima = (respuestas[respuestas.length - 1] || []).join(" ").toLowerCase();
        return [
          [resultadoFinal?.motivo_derivacion !== "barandilla_doble", "no terminó en barandilla_doble (no_a_secas no falló dos veces)"],
          [/medida|sastrer|tintorer|calidad|servicio/.test(ultima), "responde apoyándose en el valor (a medida, sastrería, calidad), no solo bajando el precio"],
        ];
      },
    },

    "lo-voy-a-pensar": {
      mensajes: ["hola, info de alquiler de trajes para una boda", "dale, lo voy a pensar y despues te aviso"],
      async verificar(sql, telefono, respuestas) {
        // "Cuando lo confirmes, buscamos un turno" (futuro, sin pregunta) es aceptar el freno sin
        // culpa; lo que no puede pasar es que vuelva a preguntar algo en el mismo mensaje, porque
        // eso sí es la insistencia que la regla prohíbe.
        const ultima = (respuestas[respuestas.length - 1] || []).join(" ").toLowerCase();
        return [
          // Corregido, auditoría 22/9: la única aserción de acá era negativa (sin "?") y pasaba
          // igual con Lucía muda — un string vacío tampoco tiene "?".
          [ultima.trim().length > 0, "contestó algo al frenar, no se quedó muda"],
          [!/\?/.test(ultima), "no insiste con otra pregunta después de que el cliente frenó"],
        ];
      },
    },

    // Corregido, auditoría 22/9: la última aserción decía que reclamo "va sin despedida armada"
    // y pedía CERO mensajes — esa era la regla de ANTES del 19/9. Desde el 19/9 (pedido de
    // Mateo: ninguna derivación queda muda) manda el texto fijo texto_derivacion_reclamo; un
    // guión que pide silencio total pasa igual si el sistema queda mudo de verdad, que es
    // exactamente la falla que se está por auditar.
    "reclamo-deriva": {
      mensajes: ["hola, tengo un reclamo, el traje que alquile la semana pasada vino manchado"],
      async verificar(sql, telefono, respuestas) {
        const convId = await conversacionDe(sql, telefono);
        const der = (await fila(sql, "select motivo, estado from derivaciones where conversacion_id=$1", [convId]))[0];
        const conv = (await fila(sql, "select estado from conversaciones where id=$1", [convId]))[0];
        return [
          [!!der, "hay una fila en derivaciones"],
          [der?.motivo === "reclamo" || der?.motivo === "prenda_danada", `motivo es reclamo o prenda_danada (fue: ${der?.motivo})`],
          [conv?.estado === "derivada", "la conversación quedó derivada"],
          [respuestas.flat().length > 0, "no queda muda: manda el texto fijo de reclamo (pedido de Mateo, 19/9)"],
        ];
      },
    },

    // Pedido de Mateo, 16/9: un cliente agresivo tiene que derivar aunque no diga "reclamo" ni
    // nombre nada roto — lo detecta el clasificador por el TONO, no por una palabra clave.
    // Corregido, auditoría 22/9: mismo error que reclamo-deriva, ver el comentario de arriba.
    "cliente-enojado-deriva": {
      mensajes: ["ESTO ES UNA VERGUENZA, son todos unos inutiles, quiero que me devuelvan la plata YA o hago un escandalo en las redes"],
      async verificar(sql, telefono, respuestas) {
        const convId = await conversacionDe(sql, telefono);
        const der = (await fila(sql, "select motivo, estado from derivaciones where conversacion_id=$1", [convId]))[0];
        const conv = (await fila(sql, "select estado from conversaciones where id=$1", [convId]))[0];
        return [
          [!!der, "hay una fila en derivaciones"],
          [der?.motivo === "cliente_enojado", `motivo es cliente_enojado (fue: ${der?.motivo})`],
          [conv?.estado === "derivada", "la conversación quedó derivada"],
          [respuestas.flat().length > 0, "no queda muda: manda el texto fijo de reclamo (pedido de Mateo, 19/9)"],
        ];
      },
    },

    // Nuevo, auditoría 22/9 (logica): probar-agente cortaba en seco toda charla derivada, así
    // que NINGÚN guión podía ejercitar el arreglo del 21/9 ("una charla derivada ya no es
    // muda") — eso es parte de por qué la falla del emulador pasó un día entero sin que nadie
    // la notara. Con el corte arreglado (solo 'cerrada' corta, 'derivada' pasa con yaDerivada),
    // este guión ejercita las dos ramas: un reclamo tranquilo la deriva y AHÍ SIGUE
    // contestando (no calla ya derivada); una agresión, en cambio, la calla.
    "derivada-reclamo-sigue-agresion-calla": {
      mensajes: [
        "hola, tengo un reclamo, el traje que alquile vino manchado",
        "¿tienen otro modelo para cuando me traigan uno nuevo?",
        "ESTO ES UNA VERGUENZA, quiero que me devuelvan la plata YA",
      ],
      async verificar(sql, telefono, respuestas) {
        const convId = await conversacionDe(sql, telefono);
        const conv = (await fila(sql, "select estado from conversaciones where id=$1", [convId]))[0];
        const derivaciones = await fila(sql, "select motivo from derivaciones where conversacion_id=$1", [convId]);
        return [
          [conv?.estado === "derivada", "la conversación quedó derivada (por el reclamo del primer mensaje)"],
          [(respuestas[1] || []).length > 0, "sigue contestando la pregunta calma, ya derivada (no se calla por un reclamo tranquilo)"],
          [(respuestas[2] || []).length === 0, "se calla ante la agresión, estando ya derivada"],
          [derivaciones.length === 1, `no crea una segunda fila en derivaciones por la agresión: ya hay una persona con la charla (hay ${derivaciones.length})`],
        ];
      },
    },

    "corporativo-deriva": {
      mensajes: ["hola, necesito cotizar uniformes corporativos para mi empresa"],
      async verificar(sql, telefono) {
        const convId = await conversacionDe(sql, telefono);
        const der = (await fila(sql, "select motivo, estado from derivaciones where conversacion_id=$1", [convId]))[0];
        return [
          [!!der, "hay una fila en derivaciones"],
          [der?.motivo === "corporativo", `motivo es corporativo (fue: ${der?.motivo})`],
        ];
      },
    },

    "fuera-de-horario-agenda-igual": {
      necesitaCatalogo: true,
      // Ni el emulador ni el worker desplegado fuerzan que "ahora" sea de madrugada, así que lo
      // que se verifica es lo que sí es siempre cierto pase la hora que pase: que cualquier
      // horario que ofrezca esté dentro de una franja de turnos real, nunca inventado.
      mensajes: [
        "hola, quiero reservar un turno para probarme un traje",
        "es para un cumpleaños de 15 en dos meses, " + EN_2_MESES,
        "soy martina perez",
        "dale, la primera que me ofrezcas",
      ],
      async verificar(sql, telefono) {
        const convId = await conversacionDe(sql, telefono);
        const huecos = await fila(
          sql,
          "select detalle->'argumentos' as args from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='buscar_horarios'",
          [convId],
        );
        return [[huecos.length > 0, "en algún momento llamó a buscar_horarios (no inventa un horario)"]];
      },
    },

    reprograma: {
      necesitaCatalogo: true,
      // Todo lo obligatorio en el primer mensaje (nombre, evento, fecha, tipo) para no depender
      // de en qué orden pregunta cada cosa; y en el pedido de cambio, un día concreto en vez de
      // "la segunda opción", para no depender de que haya enumerado horarios antes tal cual.
      mensajes: [
        `hola soy lucas gomez, necesito un turno de invitado para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
        "dale, la primera que tengas me sirve",
        // Tiene que ser antes de la fecha del evento (EN_2_MESES = ~60 días): si no,
        // agendar_turno la rechaza con turno_despues_del_evento, y con razón.
        `en realidad ese dia no puedo, ¿tenes algo para el ${diaHabilFuturo(40)}?`,
        "dale, la mas temprano de esas dos",
      ],
      async verificar(sql, telefono) {
        const cli = (await fila(sql, "select id from clientes where telefono=$1", [telefono]))[0];
        const turnos = await fila(sql, "select estado, version from turnos where cliente_id=$1 order by creado_at", [cli.id]);
        return [
          [turnos.length === 1, `queda exactamente 1 turno, no uno nuevo encima del viejo (hay ${turnos.length})`],
          [turnos[0]?.version > 1, `el turno único tiene más de una versión, o sea que se movió (v${turnos[0]?.version})`],
          [turnos[0]?.estado === "sin-confirmar", `el turno movido vuelve a sin-confirmar (fue: ${turnos[0]?.estado})`],
        ];
      },
    },

    "talle-grande": {
      necesitaCatalogo: true,
      mensajes: ["hola soy bastante grande, uso talle 62, tienen para mi?"],
      async verificar(sql, telefono, respuestas) {
        const todo = respuestas.flat().join(" ").toLowerCase();
        return [
          [!/^no\b/.test(todo.trim()), "no dice que no a secas"],
          [/62|68|medida|confeccion/.test(todo), "menciona el talle, el rango hasta el 68, o que se puede confeccionar"],
        ];
      },
    },

    // Hallazgo de logica probando en vivo, 16/9: Lucía pedía el mail al ofrecer horarios (bien),
    // pero volvía a pedirlo en el turno en que el cliente decía "confirmame ese horario" — y
    // como nunca llegó a agendar_turno, el cliente se quedó sin turno (supuesto #35 violado: el
    // mail no puede frenar una reserva).
    "mail-no-bloquea-la-reserva": {
      necesitaCatalogo: true,
      mensajes: [
        `hola soy lucas gomez, necesito un turno de invitado para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
        "dale, la primera que tengas me sirve",
        "si, confirmame ese horario porfa",
      ],
      async verificar(sql, telefono) {
        const cli = (await fila(sql, "select id from clientes where telefono=$1", [telefono]))[0];
        const turnos = await fila(sql, "select estado from turnos where cliente_id=$1", [cli?.id]);
        return [
          [turnos.length === 1, `quedó un turno agendado a pesar de no haber dado el mail (hay ${turnos.length})`],
          // Corregido, auditoría 22/9: esto pedía "sin-confirmar" — cierto cuando se escribió (el
          // botón «Confirmo» era la única forma de confirmar), pero desde la decisión de Mateo del
          // 16/9 (supuesto #30) confirmar_turno se dispara por INTENCIÓN, así que "confirmame ese
          // horario" en el tercer mensaje de este mismo guion tiene que confirmarlo de verdad. El
          // guion no había cambiado desde antes de esa decisión.
          [turnos[0]?.estado === "confirmado", `el turno quedó confirmado: el tercer mensaje lo pide explícito (fue: ${turnos[0]?.estado})`],
        ];
      },
    },

    // Decisión de Mateo, 16/9 (pedido 1b): consultar_catalogo ya no trae el catálogo entero
    // cuando el cliente pregunta por un modelo puntual: filtra a esa prenda sola.
    "catalogo-modelo-puntual": {
      necesitaCatalogo: true,
      mensajes: ["hola, cuanto sale el clasico azul marino"],
      async verificar(sql, telefono, respuestas) {
        const todo = respuestas.flat().join(" ").toLowerCase();
        const convId = await conversacionDe(sql, telefono);
        const llamadas = await fila(
          sql,
          "select detalle->'argumentos' as a from eventos_agente where conversacion_id=$1 and tipo='herramienta' and detalle->>'herramienta'='consultar_catalogo' and (detalle->>'ok')::boolean",
          [convId],
        );
        const mandoModelo = llamadas.some((f) => typeof f.a?.modelo === "string" && f.a.modelo.trim() !== "");
        return [
          [mandoModelo, "consultar_catalogo se llamó con un modelo puntual, no sin filtro"],
          [!/slim|oxford/.test(todo), "no menciona el otro modelo del catálogo (se filtró a uno solo)"],
        ];
      },
    },

    // Decisión de Mateo, 16/9 (pedido 2): dos turnos activos para la misma persona se permiten.
    // Antes agendar_turno rechazaba con turno_activo si ya tenía uno; ahora agenda el segundo y
    // solo lo avisa (no frena la reserva).
    "dos-turnos-permitidos": {
      necesitaCatalogo: true,
      mensajes: [
        `hola soy lucas gomez, necesito un turno de invitado para un cumpleaños de 15 el ${EN_2_MESES}, de tarde`,
        "dale, la primera que tengas me sirve",
        `en realidad quiero sacar otro turno más para volver a probarme antes del evento, ¿tenes algo para el ${diaHabilFuturo(40)}?`,
        "dale, la mas temprano de esas dos",
      ],
      async verificar(sql, telefono) {
        const cli = (await fila(sql, "select id from clientes where telefono=$1", [telefono]))[0];
        const turnos = await fila(sql, "select estado from turnos where cliente_id=$1 order by creado_at", [cli.id]);
        return [
          [turnos.length === 2, `quedan dos turnos, ninguno pisó al otro (hay ${turnos.length})`],
          [turnos.every((t) => t.estado === "sin-confirmar"), "los dos quedan sin-confirmar, como cualquier reserva nueva"],
        ];
      },
    },

    "evento-manana-deriva": {
      mensajes: ["hola buenas tardes", "necesito alquilar un traje para un casamiento es mañana a la noche", "tienen algo? puedo pasar hoy mismo o mañana temprano"],
      async verificar(sql, telefono, respuestas) {
        const convId = await conversacionDe(sql, telefono);
        const der = (await fila(sql, "select motivo, estado from derivaciones where conversacion_id=$1", [convId]))[0];
        const conv = (await fila(sql, "select estado from conversaciones where id=$1", [convId]))[0];
        const cli = (await fila(sql, "select fecha_evento::text as f from clientes where telefono=$1", [telefono]))[0];
        const texto = respuestas.flat().join(" ").toLowerCase();
        const esperada = manana();
        return [
          [!!der && der.motivo === "evento_inminente", `motivo es evento_inminente (fue: ${der?.motivo})`],
          [conv?.estado === "derivada", "la conversación quedó derivada"],
          [cli?.f === esperada, `la fecha del evento quedó guardada como mañana (fue: ${cli?.f}, esperado ${esperada})`],
          [!texto.includes(" no ") && !texto.startsWith("no"), "el texto al cliente no dice que no"],
          [!/\d{1,2}:\d{2}/.test(texto), "no ofrece ningún horario (no hay que ofrecer turnos en este caso)"],
        ];
      },
    },
  };
}

module.exports = {
  crearGuiones,
  fila,
  conversacionDe,
  sembrarCatalogo,
  borrarCatalogo,
  limpiarTelefono,
  hoyMasDias,
  diaHabilFuturo,
  manana,
};
