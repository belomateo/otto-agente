-- 0049_base_turno_urgencia.sql — la etiqueta «turno de urgencia» que pidió Mateo (16/9): «se le
-- ofrece a esa persona que tiene el evento más cercano un turno de urgencia, se le pone la
-- etiqueta y es el turno más cercano a la agenda». paneles abrió la columna en su 0046; la marca
-- la pone logica, que es de quien es la agenda.
--
-- Qué es exactamente un turno de urgencia. El cálculo de huecos (_shared/agenda/huecos.ts)
-- reserva los primeros `dias_reserva_urgencia` días —hoy incluido— para los eventos que caen
-- dentro de esa ventana; a todos los demás se les empieza a ofrecer recién desde hoy + N (hoy N
-- es 3, así que el resto ve turnos a partir del cuarto día). O sea: un turno que cae adentro de
-- esos días reservados SOLO se lo pudo llevar alguien con el evento encima. Esa es la etiqueta, y
-- esa es la definición que usa el trigger. Sale la misma cuenta que hace huecos.ts, del otro lado.
--
-- Por qué en la base y no en el código. El insert de turnos vive en la herramienta del agente,
-- pero no es el único: desde hoy el panel también da de alta turnos a mano (el cliente que cae
-- al mostrador, que es el caso urgente por excelencia). Marcándolo con un trigger, los dos
-- caminos quedan etiquetados igual y no hay forma de agendar salteándose la etiqueta.
--
-- Se calcula contra `creado_at`, no contra `now()`: lo que define la urgencia es qué tan cerca
-- estaba el turno CUANDO SE SACÓ. Un turno reservado con un mes de anticipación no se vuelve
-- urgente por el solo hecho de que llegue el día.
--
-- Se recalcula si se reprograma (cambia `inicio`) y NO se toca en ninguna otra edición: así la
-- dueña puede poner o sacar la etiqueta a mano desde el panel y queda.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

-- La zona del negocio del lado de la base. Espeja NEGOCIO_TZ, que es la que usan las funciones
-- (se la pasan como p_tz). Si algún día el local se muda de provincia, se cambia en los dos lados.
create or replace function negocio_tz()
returns text
language sql
immutable
set search_path = public
as $$ select 'America/Argentina/Cordoba'::text $$;

comment on function negocio_tz() is
  'Zona horaria del negocio para el código SQL. Tiene que coincidir con NEGOCIO_TZ en las Edge Functions.';

create or replace function turno_marcar_urgencia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reserva int;
  v_tz text := negocio_tz();
  v_sacado timestamptz := coalesce(new.creado_at, now());
begin
  select dias_reserva_urgencia into v_reserva from configuracion_agenda limit 1;
  -- Sin reserva configurada no hay días reservados, así que ningún turno es de urgencia.
  new.urgencia := v_reserva is not null
    and (new.inicio at time zone v_tz)::date < (v_sacado at time zone v_tz)::date + v_reserva;
  return new;
end;
$$;

drop trigger if exists trg_marcar_urgencia on turnos;
drop trigger if exists trg_marcar_urgencia_alta on turnos;
drop trigger if exists trg_marcar_urgencia_cambio on turnos;

create trigger trg_marcar_urgencia_alta
before insert on turnos
for each row execute function turno_marcar_urgencia();

-- Solo cuando la fecha cambia de verdad: una edición que toca `urgencia` (la dueña sacando o
-- poniendo la etiqueta a mano) no pasa por acá y no se pisa sola.
create trigger trg_marcar_urgencia_cambio
before update of inicio on turnos
for each row when (new.inicio is distinct from old.inicio)
execute function turno_marcar_urgencia();

-- Los turnos que ya estaban, con la misma cuenta y la misma fecha de referencia.
update turnos t
   set urgencia = (
     select c.dias_reserva_urgencia is not null
        and (t.inicio at time zone negocio_tz())::date
          < (coalesce(t.creado_at, now()) at time zone negocio_tz())::date + c.dias_reserva_urgencia
       from configuracion_agenda c limit 1
   )
 where urgencia is distinct from (
     select c.dias_reserva_urgencia is not null
        and (t.inicio at time zone negocio_tz())::date
          < (coalesce(t.creado_at, now()) at time zone negocio_tz())::date + c.dias_reserva_urgencia
       from configuracion_agenda c limit 1
   );
