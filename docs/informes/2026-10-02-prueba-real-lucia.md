# Prueba real de Lucía — 2/10/2026

Autorizada por el usuario: «avanza con la prueba real». El rechazo de permisos del informe anterior quedó superado por esa autorización. Se usaron los modelos configurados en la copia otto-agente-ia: gpt-5.6-luna para principal/clasificador y gpt-5.4-mini para extractor. La clave provino del .env del proyecto, sin mostrarla ni cambiarla.

## Resultado

Pasaron los cuatro escenarios de conversación, con estos controles:

1. Guarda exactamente el jueves 6/6/2030 a las 12, con teléfono y sin nombre/correo. Envía una sola lista.
2. En esa misma charla, recibe Aldo Lera y aldo@ejemplo.com, actualiza los datos, envía una sola lista y mantiene el mismo ID, inicio y fin del turno. No transforma la visita en fecha del evento. Al recibir un agradecimiento no repite mensajes.
3. Si recibe día sin hora, pregunta por la hora y no reserva ni inventa que esté cerrado.
4. Responde talles infantiles del 4 al 16. Para un producto no confirmado (traje de astronauta), deriva sin negar disponibilidad.

La última corrida general dejó tres escenarios aprobados y detectó el falso precio del rango infantil. Después de corregirlo se repitió solo ese escenario: aprobado. No se repiten las pruebas exitosas indefinidamente.

## Fallas descubiertas y corregidas

- El contexto omitía el año actual. Se agregó fecha ISO explícita: antes el modelo elegía 2024 en vez de 2030.
- El resumen de horarios recibía solo el día actual pero describía toda la semana, declarando cerrados los demás días. Ahora puede describir exclusivamente el día solicitado.
- Si el modelo obedecía la instrucción de no repetir la lista y devolvía texto nulo, el sistema perdía el resumen y derivaba una reserva exitosa. Ahora conserva y envía la lista generada.
- El control de precios confundía el 16 de «del 4 al 16» con un importe. Se contemplan rangos infantiles sin desactivar la protección de importes reales.
- Se aclaró al extractor que el día y hora de visita no son datos del evento; ahora también recibe la fecha actual.
- La computadora tenía variables de Ollama que desplazaban la clave del proyecto. El ejecutor de pruebas prioriza explícitamente el .env del proyecto, valida modelos y oculta claves en cualquier error.

## Regresiones y controles

- 53 pruebas aprobadas de barandillas generales y talles infantiles.
- Prueba del contexto de horarios: aprobada.
- Prueba determinista completa de reserva con texto final nulo: aprobada, con exactamente un turno y una lista.
- Comprobación de tipos del worker aprobada durante la revisión; el control final queda registrado con la entrega.
- Se conservan los cambios previos del usuario en el control de precios; únicamente se amplía el reconocimiento de talles de una cifra.

## Límites

Las conversaciones y teléfonos eran ficticios, con transacciones revertidas. Se llamó al proveedor real de IA con la configuración del negocio autorizada. No se enviaron WhatsApp ni se creó un evento externo de calendario. Las reservas se verificaron en la tabla del calendario del panel dentro de la transacción.

No se aplicaron migraciones permanentemente ni se publicó el worker o el panel. Para activar la entrega hay que publicar el paquete coordinado, con las migraciones 0074–0079 y los archivos actualizados. El documento de negocio está en `docs/LUCIA-INFORMACION-COMPLETA.md`.

Reejecución, solamente si hay cambios o una falla nueva:

`node scripts/ejecutar-prueba-real.mjs --modelos ../otto-agente-ia/.env`

Puede limitarse con `--filtro niños` para no volver a ejecutar todos los escenarios.
