-- 0032_negocio_atencion_humana.sql — acciones del día a día (paneles), PROCESOS.md § 4,
-- pasos 6 y 7: Tomar, Devolver a Lucía y Cerrar una charla.
--
-- atencion_resolver(conversacion, accion) hace las dos cosas de una acción en una sola
-- transacción, con el mismo criterio que resolver_solicitud (0018, un parámetro que elige la
-- rama) y dar_ok_aviso_turno (0031, security invoker + for update para serializar dos
-- acciones a la vez sobre la misma charla):
--   · tomar:    'activa' → 'derivada'.
--   · devolver: 'derivada' → 'activa' (despausa: el próximo mensaje del cliente lo contesta
--     Lucía con todo el historial, sin volver a presentarse — eso lo hace logica leyendo este
--     estado, no esta función).
--   · cerrar:   'activa' o 'derivada' → 'cerrada'.
-- Las tres, además, marcan atendida cualquier derivación 'pendiente' de esa charla (con quién
-- y cuándo). Es lo mismo sin importar si a esa charla la tomó alguien antes o no: Lucía puede
-- haber dejado la conversación 'derivada' con una derivación pendiente (derivar_a_persona), y
-- la primera acción de una persona sobre esa charla —sea tomar, devolver o cerrar— la resuelve.
-- Repetir una acción que no cambia nada (la charla ya estaba así y no había ninguna
-- derivación pendiente) no falla: ya_estaba = true. Tomar o devolver una charla 'cerrada' sí
-- falla (55000): no se puede reabrir por esta vía. Una charla que no existe da P0002; un
-- accion que no sea tomar/devolver/cerrar, 22023 (mismo código que 0018 para un parámetro
-- inválido).
--
-- La firma la pone la base, no el request: con la sesión de un usuario del panel,
-- atendida_por y atendida_at son la sesión (mismo criterio que autoria_de_sesion, 0017, y
-- turnos_firmar_aviso_y_confirmacion, 0031). Lucía (derivar_a_persona, service_role) no trae
-- sesión y no se toca: crea la derivación con lo que ella misma decide.
--
-- conversaciones y derivaciones ya tienen la RLS de aprobados (0007): no hace falta tocarla.
-- Idempotente: correrla dos veces no falla ni duplica nada.

create or replace function derivaciones_firmar_atencion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.estado = 'atendida' and old.estado is distinct from 'atendida' then
    new.atendida_at := now();
    new.atendida_por := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_firmar_atencion on derivaciones;
create trigger trg_firmar_atencion before update on derivaciones
  for each row execute function derivaciones_firmar_atencion();

create or replace function atencion_resolver(p_conversacion uuid, p_accion text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_conv conversaciones;
  v_previo text;
  v_nuevo text;
  v_marcadas int;
  v_ya_estaba boolean;
begin
  if p_accion not in ('tomar', 'devolver', 'cerrar') then
    raise exception 'accion tiene que ser tomar, devolver o cerrar (vino: %)', p_accion
      using errcode = '22023';
  end if;

  select * into v_conv from conversaciones where id = p_conversacion for update;
  if not found then
    raise exception 'La charla no existe' using errcode = 'P0002';
  end if;
  v_previo := v_conv.estado;

  v_nuevo := case
    when p_accion = 'tomar' and v_previo = 'activa' then 'derivada'
    when p_accion = 'devolver' and v_previo = 'derivada' then 'activa'
    when p_accion = 'cerrar' and v_previo in ('activa', 'derivada') then 'cerrada'
    else v_previo
  end;

  if v_previo = 'cerrada' and p_accion in ('tomar', 'devolver') then
    raise exception 'La charla está cerrada: no se puede %', p_accion using errcode = '55000';
  end if;

  if v_nuevo <> v_previo then
    update conversaciones set estado = v_nuevo where id = p_conversacion returning * into v_conv;
  end if;

  update derivaciones set estado = 'atendida'
   where conversacion_id = p_conversacion and estado = 'pendiente';
  get diagnostics v_marcadas = row_count;

  v_ya_estaba := (v_nuevo = v_previo) and v_marcadas = 0;
  return jsonb_build_object('accion', p_accion, 'ya_estaba', v_ya_estaba, 'conversacion', to_jsonb(v_conv));
end;
$$;

revoke execute on function atencion_resolver(uuid, text) from public, anon;
grant execute on function atencion_resolver(uuid, text) to authenticated;
revoke execute on function derivaciones_firmar_atencion() from public, anon, authenticated;
