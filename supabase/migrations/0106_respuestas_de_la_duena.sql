-- 0106_respuestas_de_la_duena.sql — respuestas de la dueña del 16/10 a las preguntas que Lucía no pudo contestar
-- (pasaba la charla al equipo por falta del dato: tarjetas, moño, chaleco, prendas sueltas, comprar y vender, qué
-- llevar a la prueba, retiro anticipado). Idempotente: cada cambio se aplica solo si la ficha todavía no lo dice,
-- y no pisa una edición hecha desde el panel.
--
-- Smoking: «desde $290.000» (la dueña escribió $290.00; Mateo confirmó el 16/10 que es a partir de $290.000 y de ahí
-- para arriba según el modelo).

-- 1. Pago y garantía: todas las tarjetas, y el documento es para el pago.
update fragmentos
   set texto = texto || ' Aceptamos todas las tarjetas, de débito y de crédito, de cualquier banco o marca (por ejemplo Naranja X, Visa y Mastercard). Para pagar hay que llevar un documento.',
       version = version + 1,
       editado_por = 'claude-code 16/10: todas las tarjetas y documento para el pago (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000000301'
   and texto not like '%Aceptamos todas las tarjetas%';

-- 2. Accesorios: el moño se alquila solo con la camisa.
update fragmentos
   set texto = texto || E'\n\nEl moño se alquila únicamente junto con la camisa: no se alquila suelto. Su valor lo dan en el local junto con la camisa.',
       version = version + 1,
       editado_por = 'claude-code 16/10: el moño se alquila con la camisa (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000000801'
   and texto not like '%El moño se alquila únicamente junto con la camisa%';

-- 3. Qué incluye: chaleco (solo en trajes de tres piezas) y prendas sueltas (los modelos se ven en el local).
update fragmentos
   set texto = texto || E'\n\nNo alquilamos chalecos sueltos: hay trajes de tres piezas que ya incluyen el chaleco. Hay pantalones y sacos en alquiler y los modelos se ven en el local. El precio varía según el modelo y no acostumbramos darlo por modelo: se ve en el local.',
       version = version + 1,
       editado_por = 'claude-code 16/10: chaleco y prendas sueltas (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000000101'
   and texto not like '%No alquilamos chalecos sueltos%';

-- 4. Fuera del alquiler: no compramos ninguna prenda.
update fragmentos
   set texto = texto || ' No compramos ninguna prenda: ni trajes usados, ni vestidos de novia, ni ropa de clientes.',
       version = version + 1,
       editado_por = 'claude-code 16/10: no compramos prendas (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000001201'
   and texto not like '%No compramos ninguna prenda%';

-- 5. Comprar en vez de alquilar: el traje alquilado no se puede comprar.
update fragmentos
   set texto = texto || ' El traje que se alquiló no se puede comprar: los modelos de venta y los de alquiler son distintos. En el mismo local tenemos los dos y se ven ahí.',
       version = version + 1,
       editado_por = 'claude-code 16/10: un traje alquilado no se compra (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000001202'
   and texto not like '%no se puede comprar: los modelos de venta%';

-- 6. El turno en el local: qué llevar.
update fragmentos
   set texto = texto || ' A la prueba traé lo que quieras usar con el traje: camisa, zapatos o, si vas a alquilar solo un saco, un pantalón. Y un documento, que se necesita para el pago.',
       version = version + 1,
       editado_por = 'claude-code 16/10: qué llevar a la prueba (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000000202'
   and texto not like '%A la prueba traé lo que quieras usar%';

-- 7. Retiro anticipado: hasta dos días antes de la fecha habitual, sin costo; se coordina en el local al alquilar.
update fragmentos
   set texto = replace(texto,
                 'Si viajás o no podés retirarlo ese día, se coordina el retiro uno o dos días antes.',
                 'Si viajás o no podés retirarlo ese día, se puede coordinar el retiro hasta dos días antes de la fecha habitual de retiro, sin costo extra: solo hay que coordinar los arreglos, y se arregla en el local en el momento de alquilar.'),
       version = version + 1,
       editado_por = 'claude-code 16/10: retiro anticipado hasta 2 días antes, sin costo (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000000201'
   and texto like '%Si viajás o no podés retirarlo ese día, se coordina el retiro uno o dos días antes.%';

-- 8. Smoking: a partir de $290.000; según el modelo puede costar más.
update fragmentos
   set texto = texto || E'

El alquiler de un smoking arranca a partir de $290.000; según el modelo puede costar más. El precio de cada modelo se ve en el local.',
       version = version + 1,
       editado_por = 'claude-code 16/10: smoking desde $290.000 (dueña)'
 where id = 'a9f10000-0000-4000-8000-000000000101'
   and texto not like '%smoking arranca a partir de%';
