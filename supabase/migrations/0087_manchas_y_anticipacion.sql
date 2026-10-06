-- Revisión de las últimas 20 charlas (Mateo, 6/10).
--
-- Manchas: un cliente preguntó si le cobraban algo si el traje volvía manchado; Lucía no lo sabía,
-- derivó y la respuesta llegó siete horas después. Selene se la dio al cliente tal cual: la
-- primera tintorería corre por cuenta de Otto; si la mancha no sale y hay que mandarlo de nuevo,
-- esa segunda la paga el cliente. Una prenda que vuelve rota o dañada la sigue viendo el equipo
-- (la tabla de daños no se comparte: AGENTE.md, regla 13).
--
-- Anticipación: a un cliente que llegaba cuatro días antes del casamiento Lucía le dijo que estaba
-- "dentro del margen" de 60 a 7 días. Llega igual, pero con poco tiempo: el fragmento lo dice así.

insert into fragmentos (id, tema, titulo, texto, editado_por)
select 'a9f10000-0000-4000-8000-000000000303', 'reserva-y-garantia', 'Si el traje vuelve manchado',
  'Si el traje vuelve con alguna mancha, lo mandamos a la tintorería y esa limpieza corre por nuestra cuenta. Si la mancha no sale y hay que mandarlo de nuevo, esa segunda limpieza la abona el cliente. Si una prenda vuelve rota o dañada, el equipo del local la revisa y te cuenta cómo sigue.',
  'Mateo 6/10: manchas, como lo explicó Selene'
 where not exists (select 1 from fragmentos where id = 'a9f10000-0000-4000-8000-000000000303');

update fragmentos set texto = '¿Con cuánto tiempo conviene reservar? Lo ideal es venir a probarse entre 60 y 7 días antes del evento, así hay tiempo para elegir y para que la sastrería ajuste todo sin apuro. Lo que cuenta es el día de la visita al local: si entre la visita y el evento quedan menos de siete días, ya es con poco tiempo, pero igual llegás: siempre buscamos la forma, y conviene dejar el turno reservado ya. Si el evento es hoy o mañana, se resuelve directo con el local: te pasamos su teléfono para que lo coordines con ellos.',
  editado_por = 'Mateo 6/10: con menos de siete días se llega, pero es con poco tiempo', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000000701';
