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
- **Nuevo, #6:** falta dónde guardar la configuración de agenda (duraciones por
  tipo de turno, cantidad de probadores, escalonado de 15'). Hoy no hay tabla y
  terminaría en código, contra el principio 2. `paneles` la crea (`*negocio*`)
  antes de que `logica` haga H1.13, que la consume.

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
