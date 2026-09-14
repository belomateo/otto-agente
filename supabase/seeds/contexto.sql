-- Contexto libre para el agente, desde docs/ficha-del-negocio.md, con los cambios que pidió
-- Mateo el 14/9 al aprobar el prompt (H1.3): la marca es «Mr Otto», sin punto; el tono va
-- redactado (antes eran sus notas tal cual); el ancla dice «se ajusta a medida, y si hace
-- falta se confecciona». scripts/armar-prompt.mjs vuelca presentacion, tono y ancla_de_valor
-- al prompt, y el dueño las edita desde Configuración › Lucía.
--
-- Seed de una sola vez. En la base real esas tres filas se actualizaron con un UPDATE el
-- 14/9 (quedó el historial de la versión anterior). No vuelvas a correr este archivo contra
-- la base real: el insert de enlaces de abajo no tiene clave única y duplicaría las filas.
insert into contexto_agente (clave, valor) values
  ('presentacion', 'Hola, soy Lucía, asistente de Mr Otto. ¿En qué puedo ayudarte hoy?'),
  ('tono', 'Tu tono es cercano, sin tantos emojis, y usás siempre las palabras de la casa: alquiler a medida, prendas de calidad, diseños nuevos y solución completa.'),
  ('ancla_de_valor', 'Mr Otto no alquila cualquier traje: se ajusta a medida, y si hace falta se confecciona, así queda perfecto el día del evento. El precio-calidad-servicio es el mejor del mercado, y eso lo diferencia de otros locales de alquiler. "Acá nos preocupamos de que tu apariencia sea lo primero: el día de esa fecha especial es lo que más nos importa."')
on conflict (clave) do nothing;

insert into enlaces (nombre, url) values
  ('Mapa', 'https://maps.app.goo.gl/YKyU8qDRqDfNNvWT8'),
  ('Web Mr Otto — alquiler', 'https://www.mrottocollection.com.ar/'),
  ('Web Mr Otto — venta', 'https://www.mrotto.com.ar/'),
  ('Turnero actual (doyturnos, se deja de usar para alquiler)', 'https://app3.doyturnos.com/ottoalquiler');
