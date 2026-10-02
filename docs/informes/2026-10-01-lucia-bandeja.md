# Revisión de Lucía y bandeja — 1/10/2026

## Resultado

Implementación local terminada. Sin publicación ni cambios permanentes en la base. Complementa el informe de reserva mínima de esta fecha. El documento para el dueño es `docs/LUCIA-INFORMACION-COMPLETA.md`.

- Reserva con teléfono, fecha y hora; nombre y correo opcionales, resumen único y actualización de la misma reserva.
- Conocimiento infantil 4–16 y derivación antes de negar disponibilidad.
- Prompt principal de 130 líneas con índice de consulta; valor del servicio y guía corporativa en conocimiento.
- Cierres de cortesía no reabren venta. Un «ok» ante una propuesta de turno sigue procesándose. Enlaces ya enviados no se repiten salvo petición expresa.
- Bandeja con autor del último mensaje, fecha/hora, contador de lectura compartido, filtro y orden por actividad entrante o saliente. La selección abierta permanece estable.
- Domingo desactivado, ya existente y reconfirmado por el dueño.

## Verificación funcional

- 58 pruebas de barandillas y cierres aprobadas.
- 7 pruebas de resumen aprobadas.
- 8 pruebas de reserva mínima y actualización aprobadas.
- 2 pruebas de enlaces repetidos aprobadas.
- 15 consultas comprobadas: la corrida inicial dejó 13 aprobadas y dos expectativas antiguas de negativa; se actualizaron a la nueva derivación y se repitieron las cinco consultas de catálogo, todas aprobadas.
- Migraciones 0074–0079 juntas: prompt efectivo, búsqueda de niños/nene/chicos/talle 4/talle 16, domingo cerrado, conteo, marcado limitado a mensajes cargados, idempotencia, aislamiento entre conversaciones y permisos aprobados. Todo dentro de una transacción con rollback.
- Worker: comprobación de tipos aprobada.
- Panel: compilación de producción aprobada. Necesitó acceso a las tipografías públicas de Google; no hubo publicación.
- `git diff --check` sin errores.

## Revisión de acceso y efectos

La API de lectura exige una sesión aprobada. La función que marca lectura valida aprobación nuevamente y solo modifica mensajes entrantes cuyos identificadores pertenecen a la conversación indicada; admite hasta 500 identificadores. La consulta de pendientes conserva RLS. Los mensajes nuevos que no estaban cargados permanecen pendientes, y responder no los marca leídos.

El inventario excluye clientes y conversaciones, y elimina metadatos de autores. No se copiaron claves ni credenciales al informe. Las pruebas realizadas no llaman a modelos de IA ni envían WhatsApp. Los cambios previos de precio, derivación y pruebas del usuario se conservaron.

## Límites y publicación

La lectura es compartida por el equipo, no individual por empleado. Hay sondeo cada cinco segundos y límites existentes de 200 conversaciones y 500 mensajes por hilo. Los mensajes históricos empiezan pendientes de lectura.

La comprobación visual con sesión autenticada sigue pendiente. La vista nueva necesita la migración 0077 antes de usar sus consultas; no se debe publicar el panel primero.

La prueba con IA real continúa pendiente de autorización específica: la revisión automática rechazó compartir contexto del negocio con el proveedor y posibles efectos antes de rollback. No se repitió ni se eludió ese rechazo.

Aplicar las migraciones en orden junto al worker y panel nuevos. La 0078 sustituye el prompt principal, por lo que debe revisarse contra eventuales ediciones posteriores del dueño antes de publicar. No volver a ejecutar todos los seeds sobre producción: podrían pisar ediciones ajenas. El procedimiento de publicación está en `PROCESOS.md`, sección 7, y requiere aprobación del dueño.
