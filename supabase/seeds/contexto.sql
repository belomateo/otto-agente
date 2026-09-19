-- Contexto libre para el agente, desde docs/ficha-del-negocio.md, con los cambios que pidió
-- Mateo el 14/9 al aprobar el prompt (H1.3): la marca es «Mr Otto», sin punto; el tono va
-- redactado (antes eran sus notas tal cual); el ancla dice «se ajusta a medida, y si hace
-- falta se confecciona». scripts/armar-prompt.mjs vuelca presentacion, tono y ancla_de_valor
-- al prompt, y el dueño las edita desde Configuración › Lucía.
--
-- Seed de una sola vez. En la base real esas tres filas se actualizaron con un UPDATE el
-- 14/9 (quedó el historial de la versión anterior). No vuelvas a correr este archivo contra
-- la base real: el insert de enlaces de abajo no tiene clave única y duplicaría las filas.
--
-- texto_evento_inminente (decisión #8 de Mateo, 14/9) no va al prompt: es el texto fijo que
-- manda el código cuando el evento es hoy o mañana y la charla pasa a una persona. Nunca dice
-- que no. En la base real se insertó aparte el 14/9.
--
-- texto_derivacion_dura_generica (hallazgo C1 del tester, H1.7, 15/9) tampoco va al prompt:
-- es el texto fijo que manda el código para toda derivación dura sin texto propio (timeout,
-- sin_respuesta, barandilla_doble cuando corresponde avisar, y como red de contención cuando
-- una barandilla descarta el texto que había armado el modelo en derivar_a_persona). En la
-- base real se insertó aparte el 15/9.
--
-- texto_mensaje_no_soportado (supuesto #33, H2.1, 15/9) tampoco va al prompt: es el texto fijo
-- que manda el código cuando lo único que llegó en la ráfaga es algo que no es texto (foto,
-- audio, sticker, ubicación) — antes Lucía no contestaba nada. No pasa por el modelo: no hay
-- ninguna palabra que interpretar. En la base real se insertó aparte el 15/9.
--
-- texto_derivacion_reclamo y texto_derivacion_fallo (pedido de Mateo, 19/9: toda derivación le
-- tiene que dejar algo al cliente) tampoco van al prompt. texto_derivacion_reclamo reemplaza la
-- despedida cuando el motivo es reclamo/cliente_enojado/descuento (MOTIVOS_SIN_MENSAJE): a
-- propósito no pide disculpas ni promete nada, porque no se sabe todavía si el reclamo es
-- válido. texto_derivacion_fallo es para barandilla_doble: un problema del sistema, no del
-- cliente, así que sí lleva un tono de disculpa. Redacción sujeta a cambio — el dueño los edita
-- desde el panel sin redeploy, igual que los otros textos fijos de acá. En la base real se
-- insertaron aparte el 19/9 (no se re-corrió este archivo, ver el aviso de arriba).
insert into contexto_agente (clave, valor) values
  ('presentacion', 'Hola, soy Lucía, asistente de Mr Otto. ¿En qué puedo ayudarte hoy?'),
  ('texto_evento_inminente', 'Te paso con un asesor del local para que te ayude con tu evento, y vamos a hacer lo posible por encontrarte un lugar en la agenda.'),
  ('texto_derivacion_dura_generica', 'Te paso con alguien del equipo para que te ayude con esto. En un rato te escriben.'),
  ('texto_mensaje_no_soportado', 'Por ahora todavía no puedo leer fotos, audios ni stickers. ¿Me contás en un mensaje de texto qué necesitás? Así te ayudo enseguida.'),
  ('texto_derivacion_reclamo', 'Te leo. Esto lo sigue alguien del local: en un rato te escriben.'),
  ('texto_derivacion_fallo', 'Se me complicó de este lado. Ya avisé a alguien del local y en un rato te escriben.'),
  ('tono', 'Tu tono es cercano, sin tantos emojis, y usás siempre las palabras de la casa: alquiler a medida, prendas de calidad, diseños nuevos y solución completa.'),
  ('ancla_de_valor', 'Mr Otto no alquila cualquier traje: se ajusta a medida, y si hace falta se confecciona, así queda perfecto el día del evento. El precio-calidad-servicio es el mejor del mercado, y eso lo diferencia de otros locales de alquiler. "Acá nos preocupamos de que tu apariencia sea lo primero: el día de esa fecha especial es lo que más nos importa."')
on conflict (clave) do nothing;

insert into enlaces (nombre, url) values
  ('Mapa', 'https://maps.app.goo.gl/YKyU8qDRqDfNNvWT8'),
  ('Web Mr Otto — alquiler', 'https://www.mrottocollection.com.ar/'),
  ('Web Mr Otto — venta', 'https://www.mrotto.com.ar/'),
  ('Turnero actual (doyturnos, se deja de usar para alquiler)', 'https://app3.doyturnos.com/ottoalquiler');
