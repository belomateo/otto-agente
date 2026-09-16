-- 0033_negocio_solo_admin_edita.sql — decisión de Mateo (16/9): precios, catálogo, horarios,
-- fragmentos, herramientas, contexto, reglas y prompt base los edita SOLO un admin. Hasta acá,
-- 0012, 0013 y 0015 dejaban escribir a cualquier usuario aprobado ('equipo' incluido): el panel
-- ya pedía admin en el route handler para editarlos, pero un empleado con su propio token podía
-- saltearlo y escribir directo contra PostgREST, porque la RLS solo pedía es_usuario_aprobado().
--
-- Acá se cierra esa RLS para las tablas de esas tres migraciones, más franjas_turnos (0030, del
-- mismo cajón "Configuración › Agenda"): sigue habiendo una policy de lectura para cualquier
-- aprobado —GET /api/configuracion las lee todas para cualquier perfil, y Turnos (trabajo
-- diario) necesita leer configuracion_agenda, duraciones_turno y franjas_turnos para armar la
-- grilla— pero escribir (insert/update/delete) pasa a es_admin().
--
-- 0007 (catalogo_alquiler, accesorios_alquiler, horarios, reglas_agente, contexto_agente,
-- fragmentos, notas_dueno, enlaces) y storage los ajusta Mateo aparte, con el mismo criterio:
-- no se tocan acá para no pisarnos.
--
-- El trabajo diario (clientes, conversaciones, notas, derivaciones, turnos) sigue siendo de
-- cualquier aprobado: no se toca acá.
--
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

do $$
declare
  t text;
begin
  foreach t in array array[
    'duraciones_turno', 'configuracion_agenda', 'herramientas_agente', 'prompt_base', 'franjas_turnos'
  ]
  loop
    execute format('drop policy if exists %I_aprobados on %I', t, t);
    execute format('drop policy if exists %I_lectura on %I', t, t);
    execute format('drop policy if exists %I_admin_escribe on %I', t, t);
    execute format('create policy %I_lectura on %I for select using (es_usuario_aprobado())', t, t);
    execute format('create policy %I_admin_escribe on %I for all using (es_admin()) with check (es_admin())', t, t);
  end loop;
end $$;
