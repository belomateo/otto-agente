# OTTO BOT — notas originales de Mr Otto

Material de referencia para el Claude Code `agente`. Contiene el flujo de
contactos, la plantilla de recordatorio de turno que ya usan, y la lógica de
venta (OTTO 5 PASOS) que se toma como base del método en `AGENTE.md` § 9.

## Contactos al cliente (flujo actual)

1. Atención por turnos y por orden de llegada al local.
2. Si el cliente saca turno, confirmar antes (➜ definido: 24 hs, código puro).
   El producto se reserva con el 100% del pago. Se toman las medidas para que
   quede impecable.
3. Coordinar el turno de PRUEBA FINAL un día antes del evento.
4. Una vez devuelto: agradecer por confiar, pedir reseña de Google y fotos del evento.

Presupuesto: envío con Alugable ➜ fuera de la V1.
Recontacto de presupuesto: al día siguiente y a las 72 hs.

## Plantilla de recordatorio de turno (la que usan hoy)

```
Hola {nombre}!

Te recordamos el turno:
🗓️Día: {día} {fecha}
⏱️Hora: {hora}

Podés consultar el turno en nuestra web:
http://app3.doyturnos.com/ottoalquiler

📍 Recordamos que estamos en España 764
https://maps.app.goo.gl/YKyU8qDRqDfNNvWT8

👪 Se permite un acompañante por persona.

❗Recordamos que el turno es de 45 minutos ⏳ Contamos con 10 min de tolerancia.

🔖En caso de alquilar, para reservar se abona el 100%. Recibimos pagos en efectivo, transferencia y tarjetas de crédito y débito.

📲 Por favor, avisanos en caso de que no puedas asistir al turno y lo reprogramamos.

Gracias ✨
```

➜ Para Meta se registra como plantilla `recordatorio_turno_24h` con botones
"Confirmo" / "Necesito reprogramar". El link del turnero se reemplaza por el
del sistema propio cuando exista.

## OTTO 5 PASOS (lógica de venta que reemplaza al "informar")

Consulta → conversación → asesoramiento → turno → prueba → alquiler.
No: consulta → catálogo de información → "reservá tu turno".

1. CONECTAR — «Hola, ¿cómo estás? Soy ___ de Otto.»
2. DESCUBRIR — «¿Para qué evento necesitás el traje?»
3. PROFUNDIZAR — «¿Qué fecha es? ¿Sos novio o invitado? ¿De día o de noche?»
4. RECOMENDAR — «Por lo que me contás, yo te recomendaría…» (2 o 3 fotos, no 15)
5. CERRAR — «¿Querés que coordinemos un turno para que puedas probarlo?» →
   «¿Te queda mejor por la mañana o por la tarde?» (nunca un link a secas)

Regla de oro: NO responder solamente la pregunta.
- «¿Cuánto sale?» → «$150.000 en adelante 😊 Tenemos diferentes modelos. ¿Para
  qué evento lo necesitás? Así puedo recomendarte qué opciones mirar.»
- «¿Qué horarios tienen?» → horario + «¿Qué día te gustaría venir?»
- «¿Alquilan zapatos?» → «Sí 😊 Tenemos zapatos y cinturones para completar el
  look. ¿Para qué evento estás buscando el traje?»

Para NOVIO el discurso cambia: «¡Felicitaciones! 🥂🤵‍♂️ Entonces tenemos que
encontrar un look especial para vos.» + fecha, día/noche, salón/campo/iglesia,
idea de estilo.

Precio con valor: «Tenemos opciones de alquiler desde $150.000. El valor incluye
el traje + servicio de sastrería + tintorería antes y después del evento, para
que recibas el conjunto listo para usar.»

Accesorios como look completo, no como lista de precios: «También podemos
completar el look con camisa, corbata, zapatos y cinturón. Cuando vengas, el
equipo te ayuda a combinar todo.»

Guiones a preparar: novio · invitado · graduación · evento laboral · solo precio
· disponibilidad · accesorios · compara con otra casa · "es caro" · deja de
responder · consultó y nunca sacó turno · urgente.

## Ejemplo real de conversación (Verónica, Roldán, graduación en noviembre)

Cliente: «Hola buenos días. Estuve mirando la página web y me interesaba el tema
del alquiler de un ambo para una graduación de secundaria. No soy de Rosario. Me
podrías decir el valor aproximado de un alquiler. Gracias. Veronica de Roldán»

Respuesta modelo: «¡Hola Verónica! 😊 Gracias por escribirnos. Para graduaciones
tenemos diferentes modelos y colores de ambos, para que puedan elegir el look
que mejor se adapte al estilo de tu hijo. El alquiler parte desde $150.000
dependiendo del modelo, e incluye el servicio de sastrería y tintorería antes y
después del evento. Atendemos únicamente con turno, así podemos dedicarle el
tiempo necesario a cada cliente. Como son de Roldán, podemos coordinar el turno
teniendo en cuenta la fecha del evento para que resuelvan todo en una sola
visita. ¿Qué fecha es la graduación?»
