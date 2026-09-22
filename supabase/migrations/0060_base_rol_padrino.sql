-- 0060_base_rol_padrino.sql — suma 'padrino' a los roles que puede tener un cliente.
--
-- POR QUÉ. Los roles de 0023 eran novio, invitado, graduado, padre y otro. Apareció en vivo un
-- padrino y no tenía dónde entrar: quedaba en 'otro', que es la bolsa de lo que no sabemos, y un
-- padrino sí se sabe qué es. Mateo lo confirmó el 21/9.
--
-- POR QUÉ NO SE AGREGAN ROLES FEMENINOS. Se preguntó por 'madre' —hubo una mamá guardada como
-- 'padre', que estaba mal— y la respuesta de Mateo fue que no: Otto es vestimenta de hombre, así
-- que no hay rol femenino ninguno. Y mirado de nuevo, la pregunta estaba mal planteada: el rol
-- describe a QUIEN USA EL TRAJE en el evento, no a quien escribe. Una mamá que consulta para su
-- hijo no es un rol nuevo — el rol es el del hijo (novio, invitado, graduado…) y ella es quien
-- manda el mensaje, nada más. Esa distinción es la que hay que arreglar en el prompt, no en la
-- tabla: el bug de la mamá guardada como 'padre' fue Lucía clasificando al que escribe en vez de
-- al que se viste. Queda anotado acá para que nadie la vuelva a agregar creyendo que falta.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.
do $$
begin
  -- Se compara contra la definición real, no contra el nombre: el constraint ya existe desde
  -- 0023, así que preguntar "¿está?" siempre daría que sí y esto no haría nada nunca.
  if not exists (
    select 1 from pg_constraint
     where conname = 'clientes_rol_check'
       and conrelid = 'clientes'::regclass
       and pg_get_constraintdef(oid) like '%padrino%'
  ) then
    alter table clientes drop constraint if exists clientes_rol_check;
    alter table clientes add constraint clientes_rol_check
      check (rol in ('novio', 'invitado', 'graduado', 'padre', 'padrino', 'otro'));
  end if;
end $$;

comment on column clientes.rol is
  'Qué es en el evento la persona que USA el traje (no quien escribe): novio, invitado, graduado, padre, padrino u otro. Sin roles femeninos a propósito: Otto viste hombres, y si escribe una mujer el rol es el del hombre para el que consulta.';
