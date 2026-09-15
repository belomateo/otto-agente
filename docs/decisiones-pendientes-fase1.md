# Decisiones pendientes antes de Fase 1 (de docs/informes/0-verificador.md)

No son bugs de Fase 0: son decisiones de modelo/producto que conviene tomar
antes de que `logica` (H1.13, huecos) y `front`/`paneles` (turnos) las
necesiten, para no descubrirlas a mitad de hito. Detalle completo en el
informe del verificador, §3.3 a §3.5.

## Resueltas por Mateo (12/9, al arrancar Fase 1)

- **#1 → sí:** restricción `EXCLUDE` en la base para que dos turnos del mismo
  probador no se pisen. Migración de `paneles` (rango 0011–0019).
- **#2 → las dos cosas:** se suman `cancelado` y `no-vino` a `turnos.estado`, y
  `con-aviso` sale del estado a una columna aparte (`aviso`, alerta de
  sincronización con Calendar). Migración de `paneles`; `front` ajusta
  `BloqueTurno` y el mock; `logica` escribe el aviso en H1.12.
- **#3 → todos cortan 14–15:** la excepción 13–14 de la ficha no aplica. No hace
  falta tocar `horarios`.
- **Pestaña:** se llama **Bitácora** (ruta `/bitacora`), no Estadísticas. `front`.
- **Letra (13/9):** en el celular ningún texto baja de 14 px; vale DISENO.md por encima del
  canvas. `front`, en 1.1.
- **Configuración (13/9):** `front` suma en 1.2 las subpestañas Agenda, Herramientas, Enlaces
  y Notas con mock, para que `paneles` tenga dónde conectar la edición del dueño.
- **Propuestas en Conocimiento (13/9):** la tarjeta pasa a ser un link de una línea a
  Bitácora › Propuestas.
- **Modo de trabajo (13/9):** Mateo abre las sesiones de `front`, `agente` y `paneles` en VS
  Code; `logica` sigue en la sesión principal. Los hitos de los cuatro roles están aprobados.
- **Nuevo, #6:** falta dónde guardar la configuración de agenda (duraciones por
  tipo de turno, cantidad de probadores, escalonado de 15'). Hoy no hay tabla y
  terminaría en código, contra el principio 2. `paneles` la crea (`*negocio*`)
  antes de que `logica` haga H1.13, que la consume.

## Resueltas por Mateo (14/9, con las notas de Otto España que pasó Sofía)

- **#7 → turnos por franjas.** Otto España: «solo 3 probadores, a partir de las 13hs
  (lunes a viernes) · y los sábados hasta el mediodía, a partir de las 13.30hs (2
  probadores)». Mateo lo leyó así: de lunes a viernes, turnos de 13 a 19 con 3 probadores
  (a la mañana no hay turnos); el sábado, de 9:30 a 12 con 3 y de 13:30 a 18:30 con 2. La
  agenda de hoy no lo puede guardar (un horario por día y una cantidad fija de
  probadores), así que:
  - `paneles` crea `franjas_turnos` en una migración `*negocio*` de su rango nuevo,
    **0030–0039** (el 0011–0019 está completo): `dia_semana` (0 = domingo, como
    `horarios` y `extract(dow)`), `desde`, `hasta`, `probadores`, con `version` /
    `editado_por` / `editado_at`, trigger de historial y la misma RLS que 0012. Las franjas
    de un día no se pisan, `desde < hasta` y `probadores` ≤
    `configuracion_agenda.cantidad_probadores`. Seed con los valores de arriba; domingo sin
    filas. Suma los handlers de Configuración › Agenda.
  - `horarios` queda como horario del local (atención humana, avisos fuera de horario):
    sus columnas de corte ya no se usan para turnos.
  - En una franja con P probadores toman turnos los probadores 1 a P (supuesto #22).
  - `front`: Configuración › Agenda edita varias franjas por día, cada una con su cantidad
    de probadores, y el mock de Turnos pasa a la agenda nueva.
  - `logica`: H1.13 calcula los huecos desde `franjas_turnos`.
- **#8 → evento hoy o mañana: lo resuelve una persona.** Mateo: «cuando hay un alquiler y
  el evento es el mismo día o un día posterior, se deriva a un humano, pero que no le diga
  que no, sino algo como te derivo con un asistente del local, pero hago lo posible por
  encontrar un hueco en la agenda». Es determinístico, así que lo decide código y no el
  LLM (AGENTE.md § 2):
  - `logica` suma el motivo `evento_inminente` a `derivaciones` (0026) y `buscar_horarios`
    (H1.13) devuelve `derivar: evento_inminente` en vez de huecos.
  - `agente`: derivación dura con texto fijo, sin «no» (propuesta: «Te paso con un asesor
    del local para que te ayude con tu evento, y vamos a hacer lo posible por encontrarte
    un lugar en la agenda.»), fragmento `anticipacion`, guion `evento-manana-deriva` y
    AGENTE.md § 10.
  - `front`: etiqueta del motivo en Atención humana («Evento hoy o mañana»).
- **#9 → los turnos se dan por orden de urgencia** (Otto España): primero los eventos más
  cercanos. `paneles` suma `dias_reserva_urgencia` (int, vacío = sin reserva) a
  `configuracion_agenda` en la misma migración que #7, con seed 7; `logica` lo aplica en
  `buscar_horarios` (supuesto #21); `front` lo suma a Configuración › Agenda.
- **Talles** (Otto España: «Cuando preguntan por talles / tienen trajes de venta»): sin
  cambio. Lo que no entra en el rango de alquiler es venta, fuera de la V1, y deriva.
- **Contrato del generador de prompt:** el panel valida el prompt base con `node
  scripts/armar-prompt.mjs --plantilla <archivo> --solo-validar` (código 0 si pasa,
  motivos por stderr). `paneles` adapta `panel/lib/edicion/prompt.ts`, que hoy llama
  `--validar`.

## Resueltas por Mateo (15/9)

- **#10 → cartel de turno 30 minutos antes, en todo el panel.** Mateo: «cuando esté por
  acercarse un turno, media hora antes tiene que salir un cartel en todo el sistema, no importa
  dónde esté ni en qué lugar, con toda la información del turno y un botón de OK para saber que
  ese turno está confirmado».
  - Cuándo: desde `inicio − aviso_turno_min` hasta que alguien aprieta OK o termina el turno.
    `aviso_turno_min` vale 30 y vive en `configuracion_agenda` (se edita en Configuración ›
    Agenda: principio 2). Solo turnos que no estén 'cancelado' ni 'no-vino'.
  - Dónde: en cualquier pestaña del panel, en escritorio y en celular, encima de lo que se esté
    haciendo, para todo usuario aprobado. Si hay dos turnos cerca, se apilan. Sale mientras el
    panel esté abierto; con el navegador cerrado no hay cartel (un aviso por WhatsApp al local
    queda como posible agregado).
  - Qué muestra: nombre y teléfono del cliente, hora de inicio y fin, tipo de turno, probador,
    evento y fecha del evento, rol, talle aproximado, color preferido, notas, si el cliente ya
    confirmó por WhatsApp, y los links a la charla y a la ficha.
  - El OK: lo aprieta alguien del equipo; el cartel se cierra para todos en el próximo refresco
    y queda quién y cuándo (`aviso_ok_por`, `aviso_ok_at`). Si el turno seguía 'sin-confirmar',
    pasa a 'confirmado' con `confirmado_por` = el email de quien apretó; si ya lo había
    confirmado el cliente con el botón de WhatsApp (`confirmado_por` = 'cliente'), solo registra
    que el equipo lo vio. Es una acción de una persona: no choca con PROCESOS.md § 2, donde el
    LLM nunca confirma.
  - Quién: `paneles`, hito 1.16: migración `*turnos*` de su rango 0030–0039 con
    `turnos.aviso_ok_at`, `aviso_ok_por` y `confirmado_por`, y `configuracion_agenda.aviso_turno_min`
    con seed 30; un GET de los turnos por avisar y el POST del OK, con historial. `front`, hito
    1.17: el cartel en el layout del panel, que consulta cada 30 segundos o menos, y el campo en
    Configuración › Agenda. `logica` marca `confirmado_por = 'cliente'` cuando llega el botón de
    la plantilla (1.14).
- **#11 → Google Calendar y los recordatorios quedan en Fase 1.** Mateo quiere los turnos en
  Google Calendar (1.12) y los recordatorios por plantilla (1.14). Las plantillas las carga
  Mateo en Meta el 16/9 con los textos de docs/plantillas-whatsapp.md. Para Calendar hace falta
  una cuenta de servicio de Google (una API key no alcanza para escribir en un calendario
  privado) y el ID del calendario.
- **#12 → el webhook de WhatsApp sigue en n8n por ahora.** Mateo (15/9): mientras se pueda
  probar, no hace falta todavía el App Secret ni cambiar el webhook. Consecuencia: Lucía no
  contesta sola por WhatsApp hasta que Meta mande los mensajes al webhook de Supabase, con el App
  Secret para verificar la firma. Se hace al conectar el worker real (Fase 2), antes de que
  Lucía le hable a un cliente; hasta entonces se prueba con el emulador. El control 6 de 1.11
  pasa a ese momento. El token de WhatsApp actual es permanente y sirve en producción; conviene
  rotarlo porque pasó por el chat.

## Resueltas por Mateo (15/9, a la tarde)

- **#13 → el calendario de los turnos es el propio.** Mateo: «por ahora usemos el calendario que
  programemos acá». La fila en `turnos` es el turno, y el panel lo muestra en la pestaña Turnos y
  con el cartel de 30 minutos (1.16 y 1.17). Google Calendar (1.12) queda en pausa y no hace falta
  la cuenta de servicio. Si vuelve, es otra implementación de la interfaz `Calendario`: la de ahora
  es `_shared/agenda/calendario_propio.ts`.
- **#14 → las plantillas de Meta, más adelante.** Los recordatorios, el agradecimiento y los
  recontactos (1.14) siguen desplegados y apagados (`CRONS_ENVIOS` sin cargar) hasta que Mateo
  cargue las plantillas y Meta las apruebe. Mientras tanto Lucía solo puede escribir dentro de la
  ventana de 24 hs desde el último mensaje del cliente.
- **#15 → Lucía agenda de verdad por WhatsApp, con la lógica del negocio.** Mateo: «por ahora
  quiero que el agente agende con la lógica del negocio». Se adelanta el primer paso de Fase 2: el
  worker corre el turno completo de `agente` en vez del stub (hito 2.1, `logica`). Empieza con los
  números de `LUCIA_TELEFONOS` (el de Mateo); a los demás no les contesta hasta que Mateo lo abra.
  Falta cómo llegan los mensajes: hoy Meta los manda a n8n (#12), así que o n8n se los reenvía al
  webhook de Supabase, o el webhook de Meta pasa a Supabase con el App Secret.
- **#16 → el webhook de WhatsApp pasa a Supabase (reemplaza a #12).** El 15/9 el workspace de n8n
  ya no existía (404 "No workspace here" en toda la instancia): Meta mandaba los mensajes a una
  dirección muerta. Con el App Secret de Mateo y su OK, la suscripción de la app "Agente Sofia" pasó
  a la Edge Function `webhook-whatsapp`, con un token de verificación nuevo y los mismos 10 campos
  que tenía. La firma de Meta se verifica en cada POST (`firma.ts`). Lucía contesta solo a los
  números de `LUCIA_TELEFONOS` hasta que Mateo la abra a todos.

Lo que sigue abajo es el texto original de cada punto, como referencia.

1. **Solapamiento de turnos por probador.** `turnos_probador_inicio_idx` es un
   índice, no una restricción: hoy dos reservas concurrentes para el mismo
   probador a la misma hora entran las dos. El cálculo de huecos en código
   (H1.13) no cierra esa ventana entre chequeo e insert. Arreglo propuesto:
   `EXCLUDE USING gist (probador WITH =, tstzrange(inicio, fin) WITH &&)` con
   la extensión `btree_gist` — es una migración nueva, no se aplicó todavía.

2. **Estados de `turnos` incompletos y `con-aviso` mezclado.** Falta
   `cancelado` y `no-vino` (hoy cancelar es borrar la fila y se pierde el
   historial). Y `con-aviso`, según `ui-otto/BloqueTurno.tsx`, es un aviso de
   sincronización con Google Calendar, no un estado del ciclo de vida —
   guardarlo en la misma columna que `confirmado`/`retiro`/etc. hace que un
   turno con problema de sync pierda su estado real. Se resuelve con una
   columna aparte (`aviso text`), pero toca la UI que ya construyó `front`:
   requiere acuerdo entre `front`/`paneles`/`logica`, no lo decide uno solo.

3. **`horarios` no puede expresar un corte distinto por probador.**
   `docs/supuestos.md` #5 dice "corte 14–15 (un probador puede cortar 13–14)",
   pero la tabla tiene un único par corte/día para todos los probadores. Hoy
   ese dato no vive en ninguna tabla ni regla (la regla 4 de `reglas_agente`
   se reformuló para no repetir horarios — ver `supabase/seeds/reglas.sql`):
   solo está en `docs/ficha-del-negocio.md` y `docs/supuestos.md` #5. Si el
   corte escalonado por probador es real, `horarios` necesita una columna o
   una fila por probador **antes** de que H1.13 calcule huecos, o el cálculo
   va a estar mal para ese probador (o peor: alguien va a resolverlo con el
   LLM, que es el principio 1 al revés).

4. **Falta la tabla `propuestas_mejora`.** `PROCESOS.md` § 6 dice que el
   analista nocturno escribe ahí y que el dueño revisa en Bitácora ›
   Propuestas, pero no está en la lista de migraciones de `STACK.md` § 2 y no
   se creó en Fase 0. No bloquea Fase 1 (el analista es mejora continua,
   después de Fase 3); `front` puede maquetar Propuestas con mock. Quien haga
   el analista crea la migración (`0011_metricas_propuestas.sql`, territorio
   de `logica` por el patrón `*metricas*`).

5. **`supabase/seeds/contexto.sql` no es de ningún rol.** Los seeds se
   renombraron para calzar con `territorios.json` (`horarios.sql` y
   `catalogo_accesorios.sql` → `paneles`; `reglas.sql` → `agente`), pero
   contexto y enlaces no tienen patrón. Es un seed de una sola vez (después se
   edita desde el panel), así que si alguien necesita tocarlo, pide `permiso`.
