-- 0103_datos_de_sofia_y_sin_aviso.sql — respuestas de Mateo y Sofía del 10/10 (después del ensayo de
-- 44 charlas reales). Idempotente: cada cambio de texto se aplica solo si la ficha todavía no lo dice,
-- y no pisa una edición hecha desde el panel.
--
-- 1. Comprar una prenda suelta (por ejemplo, solo un saco): se puede; para eso va la tienda online de
--    compra (el link de venta). Antes Lucía pasaba la charla al equipo por falta del dato.
update fragmentos
   set texto = texto || ' También se puede comprar una prenda suelta, por ejemplo solo un saco: para eso está la tienda online de compra de Mr Otto.',
       version = version + 1,
       editado_por = 'claude-code 10/10: compra de prenda suelta (Sofía)'
 where id = 'a9f10000-0000-4000-8000-000000001202'
   and texto not like '%comprar una prenda suelta%';

-- 2. Descuentos: lo que no está aprobado acá se ve en el local (antes: «lo decide una persona del
--    equipo», y Lucía pasaba la charla al equipo cada vez que alguien preguntaba).
update fragmentos
   set texto = replace(texto,
                 'Sobre el alquiler en sí, cualquier rebaja, promo o descuento especial lo decide una persona del equipo, no se define por este canal.',
                 'Sobre el alquiler en sí, cualquier otra rebaja, promo o descuento se ve en el local.'),
       version = version + 1,
       editado_por = 'claude-code 10/10: descuentos se ven en el local (Sofía)'
 where id = 'a9f10000-0000-4000-8000-000000001301'
   and texto like '%lo decide una persona del equipo, no se define por este canal.%';

-- 3. Retiro: el día anterior al evento; si ese día el local está cerrado (domingo o feriado), el
--    último día que abre antes. Ejemplo de Sofía: evento el martes con el lunes feriado y el domingo
--    cerrado → se retira el sábado.
update fragmentos
   set texto = replace(texto,
                 'El traje se retira (lo pasás a buscar) un día antes del evento, con una prueba final para ver que esté perfecto,',
                 'El traje se retira (lo pasás a buscar) un día antes del evento —si ese día el local está cerrado (un domingo o un feriado), el último día que abre antes, por ejemplo el sábado—, con una prueba final para ver que esté perfecto,'),
       version = version + 1,
       editado_por = 'claude-code 10/10: retiro el último día hábil antes del evento (Sofía)'
 where id = 'a9f10000-0000-4000-8000-000000000201'
   and texto like '%El traje se retira (lo pasás a buscar) un día antes del evento, con una prueba final%';

-- 4. Solo ropa de hombre (caso real del 10/10: una clienta preguntó por vestidos y Lucía pasó la
--    charla al equipo porque no tenía el dato).
update fragmentos
   set texto = texto || ' Trabajamos solo ropa de hombre, para adultos y chicos: no hay ropa ni vestidos de mujer.',
       version = version + 1,
       editado_por = 'claude-code 10/10: solo ropa de hombre (Sofía)'
 where id = 'a9f10000-0000-4000-8000-000000001201'
   and texto not like '%solo ropa de hombre%';

-- 5. Sin aviso por WhatsApp al equipo (Mateo, 10/10: «no hace falta la plantilla»). El cron de 0097
--    llamaba a cron-envios cada minuto para nada: la plantilla no existe y las derivaciones ya se ven
--    en la Bandeja del panel. Si algún día se quiere, se vuelve a programar con el mismo bloque de 0097.
select cron.unschedule('envios-aviso-derivacion')
 where exists (select 1 from cron.job where jobname = 'envios-aviso-derivacion');
