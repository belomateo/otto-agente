-- 0046_rls_borrado_y_metricas.sql — hallazgos de la auditoría pre-lanzamiento del 16/9.
--
-- 1. BORRAR (CRÍTICO). 0007 le dio a cualquier perfil aprobado un `for all` sobre las tablas del
--    trabajo diario, y `for all` incluye DELETE. Como `conversaciones`, `mensajes`, `notas` y
--    `derivaciones` cuelgan de `clientes` con `on delete cascade`, un empleado podía borrar una
--    ficha —sin pasar por el panel, con su propio token contra PostgREST— y llevarse puesta la
--    charla entera de WhatsApp, todos los mensajes y las notas. Sin rastro para reclamar ni
--    auditar. Los clientes con turno zafaban por la restricción de turnos; los que todavía no
--    llegaron a turno, que son la mayoría, no.
--
--    Del panel nunca se borra nada de esto: un cliente no se borra, una charla se cierra y un
--    turno se cancela. Así que leer, insertar y editar siguen siendo de cualquier aprobado (lo
--    que el mostrador necesita para atender y anotar) y BORRAR pasa a ser solo de un admin.
--
-- 2. MÉTRICAS. Mateo decidió que las métricas son solo de la dueña. `consumo_llm` (lo que sale
--    Lucía en OpenAI) y `metricas_diarias` pasan a lectura solo admin. `eventos_agente` NO se
--    toca: es la línea de tiempo que el equipo ve adentro de la charla que está atendiendo, y
--    cerrarla rompería Bandeja.
--
-- 3. `notas.turno_id`: la nota de una devolución queda enganchada al turno puntual y no mezclada
--    con el resto de las notas del cliente (lo pidió paneles para la pantalla de pendientes de
--    devolución). Null para las notas generales de la ficha.
--
-- 4. `cola_derivar_por_fallo` marca lo que quedó sin salir. Antes, al agotarse los dos intentos,
--    la charla se derivaba bien pero las burbujas que nunca salieron quedaban en la charla
--    idénticas a las que sí: quien atendía leía "Lucía: el alquiler sale X" y contestaba como si
--    el cliente ya lo hubiera leído. Ahora quedan marcadas y el panel muestra el aviso solo.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'conversaciones', 'notas', 'derivaciones', 'turnos']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_aprobados on %I', t, t);
    execute format('drop policy if exists %I_equipo_lee on %I', t, t);
    execute format('drop policy if exists %I_equipo_inserta on %I', t, t);
    execute format('drop policy if exists %I_equipo_edita on %I', t, t);
    execute format('drop policy if exists %I_admin_borra on %I', t, t);
    execute format('create policy %I_equipo_lee on %I for select using (es_usuario_aprobado())', t, t);
    execute format('create policy %I_equipo_inserta on %I for insert with check (es_usuario_aprobado())', t, t);
    execute format('create policy %I_equipo_edita on %I for update using (es_usuario_aprobado()) with check (es_usuario_aprobado())', t, t);
    execute format('create policy %I_admin_borra on %I for delete using (es_admin())', t, t);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['consumo_llm', 'metricas_diarias']
  loop
    execute format('drop policy if exists %I_lectura_aprobados on %I', t, t);
    execute format('drop policy if exists %I_lectura_admin on %I', t, t);
    execute format('create policy %I_lectura_admin on %I for select using (es_admin())', t, t);
  end loop;
end $$;

alter table notas add column if not exists turno_id uuid references turnos(id) on delete set null;
comment on column notas.turno_id is
  'El turno al que pertenece la nota (por ejemplo, la nota de una devolución). Null en las notas generales de la ficha del cliente. On delete set null: si alguna vez se borra el turno, la nota queda.';
create index if not exists notas_turno_idx on notas (turno_id) where turno_id is not null;

create or replace function cola_derivar_por_fallo(p_conversacion uuid, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversaciones set estado = 'derivada' where id = p_conversacion and estado = 'activa';

  -- Lo que Lucía pensó y nunca salió queda marcado, no invisible: si no, quien atiende lee la
  -- respuesta en la charla y cree que el cliente ya la recibió.
  update mensajes
     set no_enviado_motivo = 'error_al_enviar'
   where conversacion_id = p_conversacion
     and direccion = 'saliente'
     and wa_message_id is null
     and no_enviado_motivo is null;

  if not exists (
    select 1 from derivaciones
     where conversacion_id = p_conversacion and motivo = 'fallo_tecnico' and estado = 'pendiente'
  ) then
    insert into derivaciones (conversacion_id, motivo) values (p_conversacion, 'fallo_tecnico');
  end if;
  insert into eventos_agente (conversacion_id, tipo, detalle)
  values (p_conversacion, 'error', jsonb_build_object('etapa', 'cola', 'error', p_detalle, 'derivada', true));
end;
$$;

revoke all on function cola_derivar_por_fallo(uuid, text) from public, anon, authenticated;
grant execute on function cola_derivar_por_fallo(uuid, text) to service_role;
