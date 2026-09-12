# Supuestos tomados (12/9/2026)

Lo que se asumió porque no estaba en la ficha ni en las respuestas. Cada uno
se confirma o se corrige con Mr Otto; ninguno frena una fase.

| # | Supuesto | Dónde impacta | Quién confirma |
| --- | --- | --- | --- |
| 1 | doyturnos no tiene API; la base + Google Calendar son la fuente de verdad del alquiler | STACK.md § 4, herramientas de agenda | Mateo con doyturnos |
| 2 | Un solo calendario de Google con el probador en la descripción, compartido a una cuenta de servicio | logica, Fase 1 | Mr Otto (cuenta de Google) |
| 3 | El prompt se sirve desde Storage con caché de 60 s para que las ediciones del dueño no requieran redeploy | STACK.md § 6 | logica |
| 4 | Precios de accesorios vigentes: camisa + corbata $33.500; zapato + cinto $55.000 | Catálogo | Confirmado por Mateo (pregunta 12) |
| 5 | Horarios vigentes: Lun–Vie 10–19, Sáb 9:30–18:30, corte 14–15 (un probador 13–14) | Agenda | Confirmado (pregunta 14) |
| 6 | Objeciones (es caro, competencia, lo pienso): guiones armados por Mateo a partir del ancla de valor; el dueño los corrige en Conocimiento | Fragmentos | Mr Otto |
| 7 | Sin conversaciones exportadas: la voz se define desde la ficha y OTTO BOT, no de un corpus | Prompt | — |
| 8 | Lucía es femenino; el cliente es mayoritariamente masculino ("el cliente") y a veces una madre que consulta por el hijo | Prompt | — |
| 9 | La prueba final se propone automáticamente al marcar "alquiló", un día antes del evento | PROCESOS.md § 2 | Mr Otto |
| 10 | Recontacto de consulta sin turno: día siguiente y 72 hs, una vez cada uno, por plantilla | Crons | Mr Otto |
| 11 | El agradecimiento post-devolución sale al día siguiente de marcar "devolvió" en el panel | Crons | Mr Otto |
| 12 | Nombres de los asesores del local (Alejandra y Constantino en OTTO BOT) van en la ficha, no en el prompt | Ficha | Mr Otto |
