# Reserva con datos mínimos — 1/10/2026

Implementado en `otto-integracion`, la rama con los cambios más recientes del proyecto.
Lucía conserva su herramienta de reserva; no se agregó otro agente.

## Comportamiento

- Solo son obligatorios teléfono y fecha/hora de visita elegidas. Nombre y correo son opcionales.
- Después de reservar, sale una lista: Nombre, Número, Día y hora, Gmail. Los opcionales vacíos dicen «No especificado».
- La pregunta por nombre/correo se hace después de guardar, únicamente por los datos faltantes.
- Si los datos llegan juntos o separados, se actualiza el cliente vinculado y se muestra el resumen de la misma reserva activa más reciente, sin crear ni mover turnos.
- Se admiten correos de cualquier proveedor. Un correo inválido se rechaza sin escribirlo.
- La lista se mantiene completa en un solo mensaje y no se repite si varias herramientas actualizan la misma reserva en un intercambio.
- No se exige evento, fecha del evento, rol ni mail para reservar.
- Sin tipo conocido se usa la duración de invitado ya configurada, sin inventar un rol en la ficha.
- La consulta acepta la fecha/hora exacta y no la pierde al limitar las opciones mostradas.
- Un horario ocupado devuelve alternativas; no autoriza elegir otra hora automáticamente.
- Se mantienen franjas, probadores, bloqueos, duraciones y restricciones de eventos conocidos.
- La visita se guarda en `turnos`, vinculada al cliente que muestra el calendario propio del panel.

## Verificación realizada

- 57 pruebas aprobadas de reserva mínima (8), rechazos (32) y efectos persistidos (17).
- 15 pruebas de consultas aprobadas, incluyendo no pedir correo antes de reservar.
- 7 pruebas del resumen y eliminación de duplicados, 52 de barandillas, 2 de estructura y 17 de preparación para WhatsApp aprobadas.
- Verificación de tipos del worker completo y del ensayo de conversación aprobada.
- Prompt validado por el generador del proyecto (menos de 300 líneas).
- Migraciones 0074 y 0075 verificadas juntas contra la base, incluyendo el prompt efectivo, con rollback (`scripts/probar-config-reserva.mjs`).
- Pruebas de base encerradas en transacciones con rollback; sin mensajes de WhatsApp.

## Pendiente de aprobación y publicación

La revisión automática rechazó ejecutar `scripts/probar-reserva-minima.ts` con el
modelo real porque enviaría contexto del negocio al proveedor de IA sin autorización
específica. No se ejecutó ese ensayo ni se publicó el cambio. No se aplicó la migración
en forma permanente. Hace falta autorizar el ensayo, verificarlo y publicar el worker
junto con las migraciones 0074 y 0075, en ese orden. Actualizan la regla 5 y solo los párrafos
correspondientes del prompt guardado, conservando el resto de las ediciones del equipo.

Había cambios previos en `precio_sin_herramienta.ts`, `derivar_a_persona.ts`,
`tests/barandillas/barandillas.test.ts` y `agent-test-report.md`; no se editaron.
