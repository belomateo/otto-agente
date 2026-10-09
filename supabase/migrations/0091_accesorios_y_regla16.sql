-- Corrige el texto agregado el 7/10: decía que los accesorios "están incluidos en el alquiler del
-- traje completo" y que "el alquiler es siempre del conjunto completo". Las dos cosas son falsas
-- (ficha del negocio: el precio base incluye solo el ambo; camisa+corbata y zapato+cinto tienen
-- precio aparte) y contradecían la primera parte del mismo fragmento. Resultado en producción:
-- Lucía dijo que los zapatos venían incluidos, y derivó a quien pedía "solo saco y pantalón".
update fragmentos
   set texto = 'El precio del alquiler incluye el ambo —o sea el traje: saco y pantalón— y el servicio de sastrería y tintorería antes y después del evento: lo recibís limpio, planchado y listo para usar. La camisa, la corbata y los zapatos no vienen incluidos: se alquilan aparte, cada conjunto con su precio, para completar el look.' || E'\n\n' ||
               'Se puede alquilar solo el traje (saco y pantalón), sin accesorios. Lo que no se alquila es un accesorio solo, sin traje (por ejemplo, solo zapatos o solo cinturón).',
       version = version + 1,
       editado_por = 'claude-code 8/10: corrige accesorios'
 where id = 'a9f10000-0000-4000-8000-000000000101' and texto like '%El alquiler es siempre del conjunto completo%';

update fragmentos
   set texto = 'Para completar el look alquilamos camisa, corbata, cinturón (cinto) y zapatos, según lo que necesites. Se suman al alquiler del traje y tienen su propio precio, aparte del traje. Si preferís quedártelos, esas prendas se pueden comprar con descuento por alquilar con nosotros. En el turno el equipo te ayuda a combinar todo, así resolvés el look completo de una vez.' || E'\n\n' ||
               'Los accesorios se alquilan solo junto con un traje: no se alquilan solos (por ejemplo, solo zapatos o solo cinturón, sin traje). Si alguien pregunta por eso, explicale que se suman al alquiler del traje, cada uno con su precio.',
       version = version + 1,
       editado_por = 'claude-code 8/10: corrige accesorios'
 where id = 'a9f10000-0000-4000-8000-000000000801' and texto like '%están incluidos en el alquiler del traje completo%';

-- La regla 16 (agregada el 7/10) trataba «ok» y «dale» como despedida —suelen ser un «sí» a lo
-- que Lucía preguntó— y daba de ejemplo «cualquier cosa me escribís por acá», que choca con las
-- frases prohibidas de la sección 3 del mismo prompt. Caso real (8/10): «A listo» → «De nada,
-- cualquier cosa me escribís por acá».
update reglas_agente
   set texto = 'Si el cliente solo agradece o se despide, no derivés: cerrá en una frase corta, sin frases de relleno. Un «dale», «ok» o «sí» que contesta una pregunta tuya no es una despedida: seguí con lo que venían hablando.',
       version = version + 1,
       editado_por = 'claude-code 8/10: dale/ok no son despedida'
 where numero = 16 and texto like '%cualquier cosa me escribís por acá%';
