# Decisiones pendientes antes de Fase 1 (de docs/informes/0-verificador.md)

No son bugs de Fase 0: son decisiones de modelo/producto que conviene tomar
antes de que `logica` (H1.13, huecos) y `front`/`paneles` (turnos) las
necesiten, para no descubrirlas a mitad de hito. Detalle completo en el
informe del verificador, §3.3 a §3.5.

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
   ese dato solo vive en prosa (regla 4 de `reglas_agente`, ya reformulada
   para no hardcodear el horario — ver `supabase/seeds/0003_reglas.sql`). Si
   el corte escalonado por probador es real, `horarios` necesita una columna
   o una fila por probador **antes** de que H1.13 calcule huecos, o el
   cálculo va a estar mal para ese probador (o peor: alguien va a resolverlo
   con el LLM, que es el principio 1 al revés).
