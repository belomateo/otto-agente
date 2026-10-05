// Turnos para todo el equipo (pedido de Mateo, 5/10): buscar a quién darle el turno, «Mover» (otro
// horario, otro día u otro tipo) y darle turno igual a un cliente con el evento hoy o mañana, todo
// con la sesión de un usuario 'equipo'. Lo corren probar-api.mjs (dentro de todo el arnés) y
// probar-turnos-equipo.mjs (solo esto). No toca ninguna fila real: crea sus propios clientes y
// turnos, en fechas de 2031, y los borra al terminar aunque algo falle en el medio.
//
// ctx: { api, q, ok, seccion } del arnés, `sesion` (un 'equipo' aprobado) y su `email`.

const MARCA = "PRUEBA turnos equipo";
const TEL = "+549000009811";
const TEL_INMINENTE = "+549000009812";
// Días lejanos que no usa el resto del arnés, antes del evento del cliente (2031-01-20).
const DIA = "2031-01-02";
const OTRO_DIA = "2031-01-03";
const DIA_OCUPADO = "2031-01-07";
const DIA_INMINENTE = "2031-01-06";

export async function probarTurnosEquipo({ api, q, ok, seccion, sesion, email }) {
  seccion("Turnos para todo el equipo (pedido de Mateo, 5/10): buscar cliente, mover, evento hoy o mañana");
  const historial = (id) => q("select version from historial_ediciones where tabla = 'turnos' and fila_id = $1", [id]);
  const version = async (id) => (await q("select version from turnos where id = $1", [id]))[0].version;

  // Lo que haya quedado de una corrida que se cortó antes de limpiar.
  await limpiarTelefonos(q);
  const clientes = [];
  try {
    const cli = (await q(
      "insert into clientes (telefono, nombre, evento, fecha_evento) values ($1, $2, 'casamiento', '2031-01-20') returning id",
      [TEL, MARCA]
    ))[0].id;
    clientes.push(cli);

    // Buscar a quién darle el turno. «Nuevo turno» buscaba en /api/clientes (la pestaña Clientes,
    // solo de la dueña) y al equipo le salía "Solo un admin puede hacer esto".
    const porNombre = await api(sesion, "GET", `/api/turnos/clientes?q=${encodeURIComponent("prueba TURNOS Équipo")}`);
    const lista = porNombre.datos.clientes ?? [];
    ok(
      porNombre.status === 200 && lista.some((c) => c.id === cli) && lista.every((c) => Object.keys(c).sort().join(",") === "id,n,tel"),
      `un 'equipo' busca a quién darle un turno, sin importar mayúsculas ni tildes: solo nombre y teléfono (${porNombre.status}, ${JSON.stringify(lista.find((c) => c.id === cli))})`
    );
    const porTelefono = await api(sesion, "GET", `/api/turnos/clientes?q=${encodeURIComponent("000 00-9811")}`);
    ok(
      porTelefono.status === 200 && porTelefono.datos.clientes?.some((c) => c.id === cli && c.n === MARCA),
      `y por teléfono, escrito con espacios y guiones (${porTelefono.status}, ${porTelefono.datos.clientes?.length})`
    );
    const unaLetra = await api(sesion, "GET", "/api/turnos/clientes?q=a");
    ok(unaLetra.status === 200 && unaLetra.datos.clientes?.length === 0, `con una sola letra no trae a nadie (${unaLetra.status}, ${unaLetra.datos.clientes?.length})`);
    const pestana = await api(sesion, "GET", "/api/clientes?q=prueba");
    ok(pestana.status === 403, `la pestaña Clientes sigue siendo solo de la dueña (${pestana.status})`);

    // Mover: el botón estaba en el panel sin conectar, ni para el admin.
    const huecosDia = await api(sesion, "GET", `/api/turnos/huecos?fecha=${DIA}&tipo=invitado&cliente_id=${cli}`);
    const h1 = huecosDia.datos.huecos?.[0];
    const alta = await api(sesion, "POST", "/api/turnos", { cliente_id: cli, tipo: "invitado", inicio: h1?.inicio, probador: h1?.probador });
    const movil = alta.datos?.fila?.id;
    ok(alta.status === 201, `(preparación) un 'equipo' da de alta el turno que va a mover (${alta.status}: ${alta.datos?.error ?? "ok"})`);
    if (!movil) return;
    // Confirmado, como si el cliente hubiera tocado el botón: mover tiene que volver a empezar el ciclo.
    await q("update turnos set estado = 'confirmado', confirmado = true, confirmado_at = now(), confirmado_por = 'cliente' where id = $1", [movil]);

    const sinExcluir = await api(sesion, "GET", `/api/turnos/huecos?fecha=${DIA}&tipo=invitado`);
    const conExcluir = await api(sesion, "GET", `/api/turnos/huecos?fecha=${DIA}&tipo=invitado&excluir=${movil}`);
    ok(
      sinExcluir.status === 200 &&
        conExcluir.status === 200 &&
        !sinExcluir.datos.huecos?.some((h) => h.inicio === h1.inicio) &&
        conExcluir.datos.huecos?.some((h) => h.inicio === h1.inicio),
      `huecos con excluir=<turno>: su propio horario aparece libre; sin excluir, no (${sinExcluir.status}, ${conExcluir.status})`
    );
    const malExcluir = await api(sesion, "GET", `/api/turnos/huecos?fecha=${DIA}&tipo=invitado&excluir=abc`);
    ok(malExcluir.status === 400, `huecos › excluir mal escrito → 400 (${malExcluir.status})`);

    // Correrlo 15 minutos se pisa con su propio lugar viejo: por eso no cuenta como ocupado.
    const quinceDespues = conExcluir.datos.huecos?.find((h) => new Date(h.inicio) - new Date(h1.inicio) === 15 * 60_000);
    const v0 = await version(movil);
    const vieja = await api(sesion, "POST", `/api/turnos/${movil}/mover`, { version: v0 - 1, inicio: quinceDespues?.inicio });
    ok(vieja.status === 409, `mover con una versión vieja → 409, no se pisa (${vieja.status})`);
    const corrido = await api(sesion, "POST", `/api/turnos/${movil}/mover`, { version: v0, inicio: quinceDespues?.inicio, probador: quinceDespues?.probador });
    const f1 = (await q("select inicio, fin, estado, confirmado, confirmado_por, editado_por, version from turnos where id = $1", [movil]))[0];
    ok(
      corrido.status === 200 &&
        +f1.inicio === +new Date(quinceDespues.inicio) &&
        +f1.fin - +f1.inicio === 45 * 60_000 &&
        f1.estado === "sin-confirmar" &&
        f1.confirmado === false &&
        f1.confirmado_por === null &&
        f1.editado_por === email,
      `un 'equipo' corre el turno 15 minutos: vuelve a sin-confirmar y queda firmado por quien lo movió (${corrido.status}: ${corrido.datos?.error ?? f1.estado}, ${f1.editado_por})`
    );
    ok(corrido.datos.avisar_al_cliente === false, `sin recordatorio enviado, no pide avisarle a mano (${corrido.datos.avisar_al_cliente})`);
    const versiones = await historial(movil);
    ok(versiones.length >= 2, `el movimiento queda en el historial del turno (${versiones.length} versiones anteriores)`);

    // Otro día y otro tipo: de invitado a doble (la duración sale de duraciones_turno).
    const dobleMin = (await q("select duracion_min from duraciones_turno where tipo = 'doble'"))[0].duracion_min;
    const huecosDoble = await api(sesion, "GET", `/api/turnos/huecos?fecha=${OTRO_DIA}&tipo=doble&cliente_id=${cli}&excluir=${movil}`);
    const destino = huecosDoble.datos.huecos?.[0];
    const aDoble = await api(sesion, "POST", `/api/turnos/${movil}/mover`, { version: f1.version, inicio: destino?.inicio, probador: destino?.probador, tipo: "doble" });
    const f2 = (await q("select tipo, duracion_min, inicio, fin, version from turnos where id = $1", [movil]))[0];
    ok(
      aDoble.status === 200 && f2.tipo === "doble" && f2.duracion_min === dobleMin && +f2.fin - +f2.inicio === dobleMin * 60_000 && +f2.inicio === +new Date(destino.inicio),
      `a otro día y de invitado a doble: cambia la duración (${aDoble.status}: ${aDoble.datos?.error ?? `${f2.tipo} ${f2.duracion_min}'`})`
    );

    // A una hora que ya tiene otro turno: 409 con alternativas, y no se mueve nada.
    const ocupadoA = `${DIA_OCUPADO}T13:00:00.000Z`;
    await q(
      `insert into turnos (cliente_id, tipo, duracion_min, probador, inicio, fin)
       values ($1, 'invitado', 45, 1, $2::timestamptz, $2::timestamptz + interval '45 minutes')`,
      [cli, ocupadoA]
    );
    const ocupado = await api(sesion, "POST", `/api/turnos/${movil}/mover`, { version: f2.version, inicio: ocupadoA });
    ok(
      ocupado.status === 409 && ocupado.datos.detalle?.motivo === "sin_hueco" && ocupado.datos.detalle.alternativas?.length > 0 && (await version(movil)) === f2.version,
      `a una hora ocupada → 409 con alternativas, sin tocar el turno (${ocupado.status}, ${ocupado.datos.detalle?.alternativas?.length})`
    );

    // Si el recordatorio del horario viejo ya salió, el nuevo no le llega solo: el panel pide avisarle.
    await q(
      "insert into envios_programados (tipo, referencia, cliente_id, plantilla, estado, enviado_at) values ('recordatorio_18h', $1, $2, 'prueba_paneles', 'enviado', now())",
      [movil, cli]
    );
    const huecosVuelta = await api(sesion, "GET", `/api/turnos/huecos?fecha=${DIA}&tipo=doble&cliente_id=${cli}&excluir=${movil}`);
    const vuelta = huecosVuelta.datos.huecos?.[0];
    const conAviso = await api(sesion, "POST", `/api/turnos/${movil}/mover`, { version: f2.version, inicio: vuelta?.inicio, probador: vuelta?.probador });
    ok(
      conAviso.status === 200 && conAviso.datos.avisar_al_cliente === true,
      `con el recordatorio ya enviado, avisar_al_cliente: true (${conAviso.status}, ${conAviso.datos.avisar_al_cliente})`
    );

    // Un turno cancelado ya no se mueve. Y lo de siempre: id que no existe, mal escrito, sin versión, sin sesión.
    const cancelar = await api(sesion, "PATCH", `/api/turnos/${movil}`, { version: await version(movil), estado: "cancelado", motivo_cancelacion: `${MARCA}: mover` });
    const v4 = await version(movil);
    const cancelado = await api(sesion, "POST", `/api/turnos/${movil}/mover`, { version: v4, inicio: vuelta?.inicio });
    ok(cancelar.status === 200 && cancelado.status === 409, `un turno cancelado ya no se mueve → 409 (${cancelar.status}, ${cancelado.status}: ${cancelado.datos?.error})`);
    const noExiste = await api(sesion, "POST", "/api/turnos/11111111-1111-1111-1111-111111111111/mover", { version: 1, inicio: vuelta?.inicio });
    const malId = await api(sesion, "POST", "/api/turnos/abc/mover", { version: 1, inicio: vuelta?.inicio });
    const sinVersion = await api(sesion, "POST", `/api/turnos/${movil}/mover`, { inicio: vuelta?.inicio });
    const sinSesion = await api(null, "POST", `/api/turnos/${movil}/mover`, { version: v4, inicio: vuelta?.inicio });
    ok(
      noExiste.status === 404 && malId.status === 400 && sinVersion.status === 400 && sinSesion.status === 401,
      `mover: no existe → 404, id mal escrito → 400, sin versión → 400, sin sesión → 401 (${noExiste.status}, ${malId.status}, ${sinVersion.status}, ${sinSesion.status})`
    );

    // Evento hoy o mañana (decisión #8): Lucía no da ese turno y desde el 5/10 le pasa al cliente el
    // teléfono del local. El equipo sí lo puede dar, tildándolo (aceptar_evento_inminente). Un turno
    // lejano alcanza para probarlo: aceptarlo saca la fecha del evento de la cuenta.
    const manana = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date(Date.now() + 24 * 3600_000));
    const cliInminente = (await q(
      "insert into clientes (telefono, nombre, evento, fecha_evento) values ($1, $2, 'casamiento', $3) returning id",
      [TEL_INMINENTE, `${MARCA} inminente`, manana]
    ))[0].id;
    clientes.push(cliInminente);
    const huecosSinAceptar = await api(sesion, "GET", `/api/turnos/huecos?fecha=${DIA_INMINENTE}&tipo=invitado&cliente_id=${cliInminente}`);
    ok(
      huecosSinAceptar.status === 409 && huecosSinAceptar.datos.detalle?.motivo === "evento_inminente",
      `huecos para un cliente con el evento mañana → 409 evento_inminente (${huecosSinAceptar.status})`
    );
    const huecosAceptando = await api(sesion, "GET", `/api/turnos/huecos?fecha=${DIA_INMINENTE}&tipo=invitado&cliente_id=${cliInminente}&evento_inminente=1`);
    const hi = huecosAceptando.datos.huecos?.[0];
    ok(huecosAceptando.status === 200 && Boolean(hi), `aceptándolo, los huecos vienen (${huecosAceptando.status}, ${huecosAceptando.datos.huecos?.length})`);
    const sinAceptar = await api(sesion, "POST", "/api/turnos", { cliente_id: cliInminente, tipo: "invitado", inicio: hi?.inicio });
    ok(
      sinAceptar.status === 409 && sinAceptar.datos.detalle?.motivo === "evento_inminente",
      `el alta sin aceptarlo → 409 evento_inminente (${sinAceptar.status}: ${sinAceptar.datos.error})`
    );
    const aceptando = await api(sesion, "POST", "/api/turnos", { cliente_id: cliInminente, tipo: "invitado", inicio: hi?.inicio, aceptar_evento_inminente: true });
    ok(aceptando.status === 201, `un 'equipo' le da el turno igual, aceptándolo (${aceptando.status}: ${aceptando.datos?.error ?? "ok"})`);
  } finally {
    const turnos = await limpiarTelefonos(q);
    const restos = (await q(
      `select (select count(*) from clientes where telefono = any($1))::int clientes,
              (select count(*) from turnos where cliente_id = any($2::uuid[]))::int turnos,
              (select count(*) from historial_ediciones where fila_id = any($2::uuid[]) or fila_id = any($3::uuid[]))::int historial,
              (select count(*) from envios_programados where cliente_id = any($2::uuid[]))::int envios`,
      [[TEL, TEL_INMINENTE], clientes, turnos]
    ))[0];
    ok(
      Object.values(restos).every((n) => n === 0),
      `no quedó nada de esta prueba (${Object.entries(restos).map(([k, n]) => `${k}: ${n}`).join(", ")})`
    );
  }
}

// Turnos (con su historial y sus envíos) y clientes de los dos teléfonos de esta prueba. Primero
// las filas y después el historial: así no importa si un borrado escribe historial o no.
// Devuelve los ids de los turnos que borró, para revisar que no les quedó historial.
async function limpiarTelefonos(q) {
  const clientes = (await q("select id from clientes where telefono = any($1)", [[TEL, TEL_INMINENTE]])).map((r) => r.id);
  if (!clientes.length) return [];
  const turnos = (await q("select id from turnos where cliente_id = any($1::uuid[])", [clientes])).map((r) => r.id);
  await q("delete from envios_programados where referencia = any($1::uuid[]) or cliente_id = any($2::uuid[])", [turnos, clientes]);
  await q("delete from turnos where id = any($1::uuid[])", [turnos]);
  await q("delete from historial_ediciones where fila_id = any($1::uuid[])", [turnos]);
  await q("delete from clientes where id = any($1::uuid[])", [clientes]);
  await q("delete from historial_ediciones where fila_id = any($1::uuid[])", [clientes]);
  return turnos;
}
