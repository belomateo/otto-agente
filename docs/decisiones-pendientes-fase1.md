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
