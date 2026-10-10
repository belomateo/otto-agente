-- 0098_feriados_sin_reserva_y_prendas.sql — pedidos de Mateo del 10/10, después del ensayo de 44
-- charlas reales (trabajo 3). Idempotente.
--
-- 1. Posibles feriados. Los feriados nacionales que quedan de 2026 (calendario oficial) y los de
--    2027 (todavía sin calendario oficial: los trasladables dicen «a confirmar»). Un posible
--    feriado (local_abierto null) es un día que Lucía NO ofrece, aunque el local no esté cerrado:
--    en el calendario de Turnos se ve como «Posible feriado» con un botón para decidir. «Local
--    abierto» (true) lo vuelve un día normal; «Local cerrado» (false) además lo carga en
--    cierres_agenda (0061), que es lo que ya hace que Lucía avise que el local no abre, que la base
--    no deje agendar y que no salga el recordatorio (0093). El 12/10/2026 ya estaba cerrado.
create table if not exists feriados_posibles (
  fecha date primary key,
  nombre text not null,
  local_abierto boolean,
  decidido_por uuid references perfiles(id),
  decidido_at timestamptz
);

alter table feriados_posibles enable row level security;
-- Mismo criterio que cierres_agenda: lo lee cualquier aprobado (se ve en Turnos), lo decide un admin.
drop policy if exists feriados_posibles_lectura on feriados_posibles;
create policy feriados_posibles_lectura on feriados_posibles for select
  using (es_usuario_aprobado());
drop policy if exists feriados_posibles_admin_edita on feriados_posibles;
create policy feriados_posibles_admin_edita on feriados_posibles for update
  using (es_admin()) with check (es_admin());
drop policy if exists feriados_posibles_admin_agrega on feriados_posibles;
create policy feriados_posibles_admin_agrega on feriados_posibles for insert
  with check (es_admin());
drop policy if exists feriados_posibles_admin_borra on feriados_posibles;
create policy feriados_posibles_admin_borra on feriados_posibles for delete
  using (es_admin());

insert into feriados_posibles (fecha, nombre) values
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural'),
  ('2026-11-23', 'Día de la Soberanía Nacional (trasladado del 20/11)'),
  ('2026-12-07', 'Día no laborable con fines turísticos'),
  ('2026-12-08', 'Inmaculada Concepción de María'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-02-08', 'Carnaval'),
  ('2027-02-09', 'Carnaval'),
  ('2027-03-24', 'Día de la Memoria por la Verdad y la Justicia'),
  ('2027-03-25', 'Jueves Santo (no laborable)'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-04-02', 'Día del Veterano y de los Caídos en Malvinas'),
  ('2027-05-01', 'Día del Trabajador'),
  ('2027-05-25', 'Día de la Revolución de Mayo'),
  ('2027-06-21', 'Paso a la Inmortalidad de Güemes (a confirmar)'),
  ('2027-07-09', 'Día de la Independencia'),
  ('2027-08-16', 'Paso a la Inmortalidad de San Martín (a confirmar)'),
  ('2027-10-11', 'Día del Respeto a la Diversidad Cultural (a confirmar)'),
  ('2027-11-20', 'Día de la Soberanía Nacional (a confirmar)'),
  ('2027-12-08', 'Inmaculada Concepción de María'),
  ('2027-12-25', 'Navidad')
on conflict (fecha) do nothing;

-- El que ya está cerrado entra decidido como cerrado.
update feriados_posibles f set local_abierto = false
 where f.local_abierto is null and exists (select 1 from cierres_agenda c where c.fecha = f.fecha);

-- 2. Sin días reservados para eventos cercanos. Mateo: «ya no existe eso, dijimos que no lo
--    queremos»: se agenda a cualquiera, y si el evento es dentro de 2 días lo resuelve el equipo
--    (eso lo hace el código: evento_inminente). null = sin reserva (0030, el panel ya lo entiende).
update configuracion_agenda
   set dias_reserva_urgencia = null, version = version + 1
 where dias_reserva_urgencia is not null;

-- 3. Prendas sueltas (respuesta de Sofía a D4/D5, 10/10): se puede alquilar solo el saco o una
--    prenda por separado. Lo que sigue sin alquilarse es un accesorio solo (zapatos, cinturón). El
--    precio de una prenda suelta no está cargado: se confirma en la visita.
update fragmentos
   set texto = replace(texto, 'Se puede alquilar solo el traje (saco y pantalón), sin accesorios.',
                 'Se puede alquilar solo el traje (saco y pantalón), sin accesorios, y también una prenda por separado: por ejemplo, solo el saco o solo el pantalón. El precio de una prenda suelta se confirma en la visita.'),
       version = version + 1,
       editado_por = 'claude-code 10/10: prendas por separado (Sofía)'
 where id = 'a9f10000-0000-4000-8000-000000000101'
   and texto like '%Se puede alquilar solo el traje (saco y pantalón), sin accesorios.%'
   and texto not like '%una prenda por separado%';
