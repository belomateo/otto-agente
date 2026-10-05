-- Devolución tardía (Mateo, 5/10). El traje se devuelve el día hábil siguiente al evento: si el
-- evento es el fin de semana, sí o sí el lunes. Caso real: un cliente avisó que el comisionista
-- traía el traje el martes y Lucía le contestó "Sí, podés mandarlo mañana". Devolverlo más tarde
-- lo confirma el local: Lucía deriva con motivo devolucion_tardia y el texto fijo le pasa el
-- teléfono del local (como el de evento hoy o mañana).

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'derivaciones_motivo_check' and pg_get_constraintdef(oid) like '%devolucion_tardia%'
  ) then
    alter table derivaciones drop constraint if exists derivaciones_motivo_check;
    alter table derivaciones add constraint derivaciones_motivo_check
      check (motivo in ('reclamo', 'cliente_enojado', 'prenda_danada', 'corporativo', 'turno_urgente_sin_hueco',
        'evento_inminente', 'descuento', 'dato_no_encontrado', 'pide_persona', 'devolucion_tardia',
        'barandilla_doble', 'sin_respuesta', 'timeout', 'fallo_tecnico'));
  end if;
end $$;

insert into contexto_agente (clave, valor, editado_por)
values ('texto_devolucion_tardia',
  'La devolución es el día hábil siguiente al evento (si el evento es el fin de semana, el lunes). Para devolverlo otro día, confirmalo directo con el local al +54 9 341 239 2502: ya les avisé.',
  'Mateo 5/10: devolución tardía')
on conflict (clave) do update set valor = excluded.valor, editado_por = excluded.editado_por, editado_at = now();

update fragmentos set texto = 'Primero venís al local con turno: el asesor te muestra modelos, te probás el que más te guste y te toma las medidas. Si lo alquilás, la sastrería lo ajusta a tu medida. El traje se retira (lo pasás a buscar) un día antes del evento, con una prueba final para ver que esté perfecto, y se devuelve acá mismo el día hábil siguiente al evento: si el evento es el fin de semana, sí o sí el lunes. En total te quedás con el traje 3 días. Si viajás o no podés retirarlo ese día, se coordina el retiro uno o dos días antes. Devolverlo más tarde lo tiene que confirmar el equipo del local. La tintorería corre por nuestra cuenta.',
  editado_por = 'Mateo 5/10: devolución el lunes si el evento es el fin de semana', editado_at = now()
 where id = 'a9f10000-0000-4000-8000-000000000201';
