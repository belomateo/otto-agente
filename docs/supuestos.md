# Supuestos tomados (12/9/2026)

Lo que se asumió porque no estaba en la ficha ni en las respuestas. Cada uno
se confirma o se corrige con Mr Otto; ninguno frena una fase.

| # | Supuesto | Dónde impacta | Quién confirma |
| --- | --- | --- | --- |
| 1 | doyturnos no tiene API; la base + Google Calendar son la fuente de verdad del alquiler | STACK.md § 4, herramientas de agenda | Mateo con doyturnos |
| 2 | Un solo calendario de Google con el probador en la descripción, compartido a una cuenta de servicio | logica, Fase 1 | Mr Otto (cuenta de Google) |
| 3 | El prompt se sirve desde Storage con caché de 60 s para que las ediciones del dueño no requieran redeploy | STACK.md § 6 | logica |
| 4 | Precios de accesorios vigentes: camisa + corbata $33.500; zapato + cinto $55.000 | Catálogo | Confirmado por Mateo (pregunta 12) |
| 5 | Horario del local: Lun–Vie 10–19, Sáb 9:30–18:30. Turnos (14/9): Lun–Vie 13–19 con 3 probadores; Sáb 9:30–12 con 3 y 13:30–18:30 con 2. El corte 14–15 del 12/9 quedó reemplazado por las franjas (ver #20) | Agenda (`franjas_turnos`) | Confirmado por Mateo (14/9, notas de Otto España) |
| 6 | Objeciones (es caro, competencia, lo pienso): guiones armados por Mateo a partir del ancla de valor; el dueño los corrige en Conocimiento | Fragmentos | Mr Otto |
| 7 | Sin conversaciones exportadas: la voz se define desde la ficha y OTTO BOT, no de un corpus | Prompt | — |
| 8 | Lucía es femenino; el cliente es mayoritariamente masculino ("el cliente") y a veces una madre que consulta por el hijo | Prompt | — |
| 9 | La prueba final se propone automáticamente al marcar "alquiló", un día antes del evento | PROCESOS.md § 2 | Mr Otto |
| 10 | Recontacto de consulta sin turno: día siguiente y 72 hs, una vez cada uno, por plantilla | Crons | Mr Otto |
| 11 | El agradecimiento post-devolución sale al día siguiente de marcar "devolvió" en el panel | Crons | Mr Otto |
| 12 | Nombres de los asesores del local (Alejandra y Constantino en OTTO BOT) van en la ficha, no en el prompt | Ficha | Mr Otto |
| 13 | `perfiles` se crea en `0007_rls.sql` (no en `0010_auth_solicitudes.sql` como lista STACK.md § 2): las policies de 0007 necesitan consultarla y no se puede referenciar una tabla que todavía no existe | Migraciones, Fase 0 | logica |
| 14 | `turnos.estado` usa los valores kebab-case que ya consume `ui-otto/BloqueTurno.tsx` del panel (`sin-confirmar`, `confirmado`, `alquilo`, `retiro`, `devolvio`, `con-aviso`) en vez de snake_case (TRABAJO.md § 5) para no romper la UI ya construida en H1.1/H1.2 | `0004_turnos.sql`, panel | logica / front |
| 15 | `catalogo_alquiler` queda sin seed: la ficha solo da un "desde $150.000" orientativo, sin modelos/colores/precios reales por ítem. Lo carga el dueño desde el panel (H1.9) o Mateo con la lista real | Seeds, Fase 0 | Mr Otto / Mateo |
| 16 | El proyecto de Supabase de Otto vive en la cuenta de Sofia (proyecto `fhyuvdliwppqkneddezn`, región us-east-2), no en la cuenta principal de Mateo — decisión explícita del 12/9 al arrancar Fase 0 | Todo lo que usa Supabase | Mateo (con Sofia) |
| 17 | El worker no hace polling de pg_cron cada 10 s (pg_cron no baja de 1 minuto): se dispara por un trigger al encolar, con un cron cada 1 minuto como red de contención. Se implementa en H1.11 (Fase 1), `0009_cron.sql` de Fase 0 solo habilita las extensiones | `0009_cron.sql`, H1.11 | logica |
| 18 | El primer admin no se seedea con un insert directo: `perfiles.id` referencia `auth.users`, así que hace falta que la persona se registre una vez desde `/login` y recién ahí se promueve su fila a `rol='admin', estado='aprobado'` por SQL | Auth, Fase 0 | Mateo (da el email) |
| 19 | Se desactivó la confirmación de email de Supabase Auth (`mailer_autoconfirm=true`): es un panel interno de equipo, no alta masiva pública, y el filtro real es la aprobación manual del admin. El envío de mails del plan gratuito además tiene rate limit bajo. Probado de punta a punta y limpiado el usuario de prueba | Auth, Fase 0 | logica |
| 20 | De lunes a viernes la franja de turnos va de 13 a 19 corrida, sin el corte 14–15: así la eligió Mateo el 14/9. Si sigue habiendo corte, se parte en dos franjas (13–14 y 15–19) desde Configuración › Agenda, sin tocar código | Agenda, H1.13 | Mr Otto (Sofía) |
| 21 | «Por orden de urgencia»: los huecos de los próximos 7 días quedan para los eventos que caen dentro de esa semana; a un evento más lejano se le ofrecen turnos desde el día 8. Los 7 días salen del mínimo de anticipación recomendado de la ficha y se editan en Configuración › Agenda (vacío = sin reserva) | `configuracion_agenda.dias_reserva_urgencia`, H1.13 | Mr Otto (Sofía) |
| 22 | En una franja con menos probadores que el local (sábado a la tarde: 2 de 3), toman turnos los probadores 1 y 2 | H1.13, Turnos | Mr Otto |
| 23 | «Evento hoy o mañana» se cuenta con la fecha del evento en hora de Argentina (`NEGOCIO_TZ`): hoy o el día siguiente derivan siempre; desde pasado mañana sigue el camino normal, con la reserva de urgencia de #21 | Derivación dura (agente), H1.13 | — |
