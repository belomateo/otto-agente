-- 0067_turnos_bloqueos_agenda.sql — pedido de la dueña (26/9): bloquear HORARIOS PUNTUALES de la
-- agenda. Una fecha, de tal a tal hora (hora del local), para todos los probadores o para uno solo
-- — la reunión con un proveedor, el probador 2 con el espejo roto toda la tarde, el rato que se va
-- media hora al banco. Ni Lucía ni el panel tienen que dar turnos ahí. Es el hermano chico de
-- cierres_agenda (0061): aquel cierra el día entero y es solo de la dueña; esto tapa un rato y lo
-- puede hacer también el equipo. cierres_agenda NO se toca.
--
-- Las reglas, todas en la base (así las cumple también quien pegue directo a PostgREST con su propio
-- token, salteando el panel — mismo criterio que 0065 y 0066):
--
--  1. Quién bloquea: cualquier aprobado. El equipo comparte UNA cuenta, así que no se distingue
--     entre los chicos: lo único que importa es si el bloqueo lo puso la dueña o el equipo, y eso
--     (creado_por_admin) lo fija la base mirando la sesión, diga lo que diga el request.
--  2. Hasta dónde bloquea el equipo: lo que quiera, MIENTRAS el día siga teniendo lugar para al
--     menos un turno. Si con su bloqueo, sumado a todos los que ya hay esa fecha, no queda ningún
--     turno posible en ninguna franja ni en ningún probador, eso es cerrar el día — y cerrar el día
--     es de la dueña (cierres_agenda). La dueña no tiene límite.
--  3. Quién desbloquea o edita: uno que puso el equipo, cualquier aprobado; uno que puso la dueña,
--     solo un admin.
--  4. Los turnos que ya estaban agendados en el rato que se bloquea NO se cancelan ni se tocan. El
--     panel avisa cuáles son y pide confirmar antes de guardar; eso es del panel, no de la base.
--  5. Garantía dura: ningún turno ACTIVO (todo lo que no es 'cancelado' ni 'no-vino', igual que el
--     EXCLUDE de 0011) puede quedar escrito encima de un bloqueo que lo alcance ni en una fecha de
--     cierres_agenda, lo escriba quien lo escriba.
--
-- Qué es "un turno posible" (regla 2). Exactamente lo que ofrecería calcularHuecos()
-- (_shared/agenda/huecos.ts): arranca en `desde` de la franja + k·escalonado_min, dura D minutos,
-- termina adentro de la franja, en un probador que la franja habilita (1 a P). D es el turno más
-- corto de los que se sacan por WhatsApp (invitado, novio, graduado: hoy 45'); si no hubiera
-- ninguno de esos cargado, el más corto de todos. Se mira la grilla y no "un rato libre de D
-- minutos" a propósito: un rato libre de 11:05 a 11:50 dura 45' pero no tiene ningún turno adentro
-- (la agenda arranca a las 11:00 y a las 11:15), así que con dos bloqueos bien elegidos el equipo
-- dejaba el día sin turnos pasando el control. Con horarios redondos (múltiplos del escalonado) las
-- dos cuentas dan lo mismo: 10:00–18:30 para todos deja 30' → no; 10:00–18:15 deja el de 18:15 → sí.
-- Los turnos ya agendados no cuentan: la regla es sobre lo que tapa el equipo, no sobre lo que ya
-- está vendido (un día lleno de clientes no es un día cerrado).
--
-- Concurrencia. Dos bloqueos del equipo de la misma fecha que se guardan a la vez podrían pasar el
-- control cada uno por su lado y cerrar el día entre los dos. Y un turno que se agenda justo
-- mientras se bloquea ese rato podría no ver el bloqueo. Por eso los dos triggers toman el mismo
-- candado por fecha (agenda_trabar_fecha, advisory lock de transacción): lo de la misma fecha se
-- hace de a uno y el segundo ve lo que guardó el primero. Solo se traba al escribir un bloqueo o al
-- dar de alta/mover un turno; confirmar, cancelar, recordatorios y avisos no pasan por acá. En
-- producción cada escritura de Lucía y del panel es su propia transacción, así que el candado dura
-- lo que dura ese insert.
--
-- Errores (la clave va literal adentro del mensaje: el panel mapea por substring,
-- panel/lib/api/respuestas.ts POR_RESTRICCION):
--   turnos, 23P01 exclusion_violation — el mismo código que un choque entre turnos, a propósito:
--     quien ya maneja el choque lo trata igual (Lucía, insertarEnProbadorLibre/moverAProbadorLibre,
--     pasa al probador siguiente de SU lista; el panel, turno-alta.ts, responde 409).
--       turno_en_horario_bloqueado · turno_en_dia_cerrado
--   bloqueos_agenda, 42501 (el panel da 403):
--       bloqueo_dia_completo_solo_duena · bloqueo_de_la_duena
--   bloqueos_agenda, 23514 check_violation (el panel da 400):
--       bloqueo_probador_invalido · bloqueo_en_dia_cerrado · bloqueo_dia_sin_turnos
--       bloqueos_agenda_desde_antes_de_hasta (el nombre de la restricción, también desde el trigger)
--
-- OJO: esto es la red de abajo, no lo que hace que esos horarios no se ofrezcan. Al 26/9 ni
-- calcularHuecos()/agendaDesdeBase (_shared/agenda/huecos.ts) ni validarHueco() del panel
-- (turno-alta.ts) leen esta tabla, y los huecos traen UN probador por hora (el primero libre): la
-- "lista" de Lucía tiene un solo probador, así que un bloqueo de ese probador termina en
-- 'hueco_ocupado' aunque otro esté libre, y buscar_horarios vuelve a ofrecer la misma hora (lo
-- mismo en el panel: elige candidatos[0] y las alternativas del 409 no saben de bloqueos). Ningún
-- turno cae en un bloqueo — eso lo garantiza esta migración —, pero para que la agenda NO LOS
-- OFREZCA, huecos.ts y turno-alta.ts tienen que leer bloqueos_agenda como ya leen cierres_agenda
-- (cada bloqueo = un rato ocupado de su probador, o de todos si probador es vacío, que se mira
-- SOLO en el "pisa" de cada probador y no en la regla del escalonado entre turnos), y
-- respuestas.ts sumar las dos claves a POR_RESTRICCION. Eso tiene que salir junto con esta
-- migración o antes de que el panel deje crear bloqueos.
--
-- Aplicarla con un lock_timeout corto (set lock_timeout = '5s'): toca triggers de turnos y la
-- policy de historial_ediciones, que Lucía y el panel usan todo el tiempo.
-- Idempotente: correrla dos veces no falla ni cambia nada la segunda vez.

-- La tabla ----------------------------------------------------------------------------------------
-- fecha + desde/hasta en hora del local, no timestamptz: así se carga y se lee ("el 14 de 15 a 16")
-- y no depende de la zona de quien escribe. El rato es [desde, hasta): uno que termina a las 16 no
-- pisa un turno que empieza a las 16. probador vacío = todos los probadores.
create table if not exists bloqueos_agenda (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  desde time not null,
  hasta time not null,
  probador int constraint bloqueos_agenda_probador_check check (probador >= 1),
  motivo text,
  -- Quién lo creó y si era la dueña. Van separados: si algún día se borra el perfil de la dueña,
  -- creado_por queda vacío pero el bloqueo sigue siendo suyo (creado_por_admin) y sigue protegido.
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_admin boolean not null default false,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now(),
  creado_at timestamptz not null default now(),
  constraint bloqueos_agenda_desde_antes_de_hasta check (desde < hasta)
);
-- Supabase le da GRANT ALL a anon y authenticated sobre toda tabla nueva de public: sin RLS quedaba
-- abierta a cualquiera con la anon key. Va pegado al create.
alter table bloqueos_agenda enable row level security;

create index if not exists bloqueos_agenda_fecha_idx on bloqueos_agenda (fecha);

comment on table bloqueos_agenda is
  'Horarios puntuales sin turnos (pedido de la dueña, 26/9): fecha + [desde, hasta) en hora del local, para un probador o para todos (probador vacío). El equipo bloquea mientras el día siga teniendo lugar para un turno; el día entero es cierres_agenda y es solo de la dueña. Los turnos que ya estaban no se tocan.';
comment on column bloqueos_agenda.creado_por_admin is
  'Lo fija la base según la sesión que lo creó. Si es true, solo un admin lo edita o lo borra.';

-- El candado por fecha ----------------------------------------------------------------------------
-- Una sola función para que el bloqueo y el turno usen SIEMPRE la misma llave. La forma de dos
-- enteros vive en otro espacio de llaves que la de un bigint que usa la cola (0027/0044,
-- hashtext('cola_trabajos:' || ...)): no hay forma de que una fecha de la agenda frene una charla.
-- to_char y no fecha::text: el texto de un date depende del DateStyle de cada sesión, y dos
-- sesiones con DateStyle distinto sacarían llaves distintas para el mismo día.
create or replace function agenda_trabar_fecha(p_fecha date)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('agenda'), hashtext(to_char(p_fecha, 'YYYY-MM-DD')));
end;
$$;

-- Validar un bloqueo ------------------------------------------------------------------------------
-- security definer: tiene que ver TODOS los bloqueos de la fecha, las franjas y la configuración
-- sin depender de lo que la RLS le deje ver a quien escribe. Lo que decide sale de la sesión
-- (auth.uid(), es_admin()) y de las tablas, nunca del request.
create or replace function bloqueos_agenda_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_max int;
  v_paso int;
  v_dur int;
  v_dur_cualquiera int;
  v_ignorar uuid;
  v_queda_lugar boolean;
begin
  -- El check de la tabla (desde < hasta) recién corre DESPUÉS de los triggers BEFORE; sin esto, un
  -- bloqueo al revés llegaba a armar el tsrange de abajo y salía un 22000 incomprensible en vez del
  -- 23514 de siempre. Mismo nombre que la restricción, para que el panel lo reconozca igual.
  if new.desde >= new.hasta then
    raise exception 'bloqueos_agenda_desde_antes_de_hasta: el bloqueo tiene que terminar después de empezar (% a %).',
      to_char(new.desde, 'HH24:MI'), to_char(new.hasta, 'HH24:MI')
      using errcode = 'check_violation', constraint = 'bloqueos_agenda_desde_antes_de_hasta';
  end if;

  -- Candado de la fecha (y de la vieja, si el bloqueo se muda de día). Siempre en orden de fecha:
  -- dos ediciones que se cruzan (una del 14 al 15 y otra del 15 al 14) no se traban entre sí.
  if tg_op = 'UPDATE' and new.fecha is distinct from old.fecha then
    perform agenda_trabar_fecha(least(old.fecha, new.fecha));
    perform agenda_trabar_fecha(greatest(old.fecha, new.fecha));
  else
    perform agenda_trabar_fecha(new.fecha);
  end if;

  -- Autoría de creación. Con sesión de usuario la pone la base: el equipo no se puede anotar un
  -- bloqueo como de la dueña para que después nadie se lo toque. Sin usuario (postgres, scripts,
  -- service_role) se respeta lo que viene, como autoria_de_sesion() (0017). Editar nunca la cambia,
  -- con UNA excepción: creado_por pasa a vacío cuando el perfil ya no existe. Es el UPDATE que hace
  -- la propia FK (on delete set null) al borrar una cuenta; si acá se le volvía a poner el uid
  -- viejo, la FK fallaba (23503) y no se podía borrar ningún usuario que alguna vez hubiera
  -- bloqueado un horario — ni por auth.admin.deleteUser (auth.users → perfiles → acá). Mientras
  -- el perfil exista, vaciarlo a mano no hace nada. creado_por_admin no se toca nunca: el bloqueo
  -- de una dueña borrada sigue siendo de la dueña.
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.creado_por := v_uid;
      new.creado_por_admin := es_admin();
    end if;
  else
    new.creado_por := case
      when new.creado_por is null and not exists (select 1 from perfiles p where p.id = old.creado_por) then null
      else old.creado_por
    end;
    new.creado_por_admin := old.creado_por_admin;
    new.creado_at := old.creado_at;
  end if;

  -- El probador tiene que existir (mismo tope que turnos, 0012). Solo si se carga o se cambia.
  if new.probador is not null and (tg_op = 'INSERT' or new.probador is distinct from old.probador) then
    select cantidad_probadores into v_max from configuracion_agenda limit 1;
    if v_max is null then
      raise exception 'configuracion_agenda está vacía: aplicá supabase/seeds/horarios_duraciones.sql'
        using errcode = 'check_violation';
    end if;
    if new.probador > v_max then
      raise exception 'bloqueo_probador_invalido: el probador % no existe, la agenda tiene % probador(es).',
        new.probador, v_max
        using errcode = 'check_violation';
    end if;
  end if;

  -- Un día cerrado o sin franjas ya no da turnos: bloquearle un rato no significa nada, y guardarlo
  -- solo confunde a quien después mira la agenda. Solo al crear o al mudar el bloqueo de día: si la
  -- dueña cierra después una fecha que ya tenía bloqueos, esos se pueden seguir editando o borrando.
  if tg_op = 'INSERT' or new.fecha is distinct from old.fecha then
    if exists (select 1 from cierres_agenda c where c.fecha = new.fecha) then
      raise exception 'bloqueo_en_dia_cerrado: el % la agenda ya está cerrada todo el día, no hace falta bloquear horarios.',
        to_char(new.fecha, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from franjas_turnos f where f.dia_semana = extract(dow from new.fecha)) then
      raise exception 'bloqueo_dia_sin_turnos: el % es un día sin turnos, no hay nada que bloquear.',
        to_char(new.fecha, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
  end if;

  -- De acá para abajo, la regla 2: solo para una sesión del panel que no es de la dueña.
  if v_uid is null or es_admin() then
    return new;
  end if;

  -- Editar sin agrandar (cambiar el motivo, achicar el rato, pasar de "todos" a un probador) nunca
  -- le quita lugar a la agenda: no se controla. Si no, un día que la dueña ya dejó sin lugar no le
  -- dejaría al equipo ni corregir el motivo de su propio bloqueo.
  if tg_op = 'UPDATE'
     and new.fecha = old.fecha
     and new.desde >= old.desde
     and new.hasta <= old.hasta
     and (old.probador is null or old.probador is not distinct from new.probador) then
    return new;
  end if;

  select min(duracion_min) filter (where tipo in ('invitado', 'novio', 'graduado')), min(duracion_min)
    into v_dur, v_dur_cualquiera
    from duraciones_turno;
  v_dur := coalesce(v_dur, v_dur_cualquiera);
  select escalonado_min into v_paso from configuracion_agenda limit 1;
  if v_dur is null or v_paso is null then
    raise exception 'duraciones_turno o configuracion_agenda están vacías: aplicá supabase/seeds/horarios_duraciones.sql'
      using errcode = 'check_violation';
  end if;

  -- Todos los bloqueos de la fecha tal como quedarían: los guardados (menos la versión vieja de este,
  -- si es una edición) más el nuevo. Por cada franja y cada probador que la franja habilita, lo
  -- tapado es la unión (multirango) de los bloqueos que lo alcanzan; queda lugar si algún inicio de
  -- la grilla tiene sus D minutos enteros afuera de lo tapado.
  v_ignorar := case when tg_op = 'UPDATE' then old.id end;
  with bloqueos as (
    select b.desde, b.hasta, b.probador
      from bloqueos_agenda b
     where b.fecha = new.fecha
       and b.id is distinct from v_ignorar
    union all
    select new.desde, new.hasta, new.probador
  ),
  lugares as (
    select f.desde, f.hasta,
           (select range_agg(tsrange(new.fecha + b.desde, new.fecha + b.hasta, '[)'))
              from bloqueos b
             where b.probador is null or b.probador = p.n) as tapado
      from franjas_turnos f
     cross join lateral generate_series(1, f.probadores) as p(n)
     where f.dia_semana = extract(dow from new.fecha)
  )
  select exists (
    select 1
      from lugares l
     cross join lateral generate_series(
       new.fecha + l.desde,
       new.fecha + l.hasta - make_interval(mins => v_dur),
       make_interval(mins => v_paso)
     ) as s(inicio)
     where l.tapado is null
        or not (l.tapado && tsrange(s.inicio, s.inicio + make_interval(mins => v_dur), '[)'))
  ) into v_queda_lugar;

  if not v_queda_lugar then
    raise exception using
      errcode = '42501',
      message = format(
        'bloqueo_dia_completo_solo_duena: con este bloqueo, el %s no queda lugar para ningún turno. '
        'Cerrar un día completo lo puede hacer solo la dueña: pedíselo a ella, o dejá libre al menos '
        'un turno de %s minutos.',
        to_char(new.fecha, 'DD/MM/YYYY'), v_dur
      );
  end if;

  return new;
end;
$$;

-- Proteger los bloqueos de la dueña ---------------------------------------------------------------
-- Con raise y no con la RLS: una policy de UPDATE/DELETE que filtra la fila da "0 filas" SIN error,
-- y el panel lo mostraba como un 409 de versión vieja — engañoso. Así da 42501 → 403 con el motivo.
-- Se llama trg_bloqueos_agenda_proteger para que corra ANTES que trg_historial_borrado y
-- trg_historial (los BEFORE van en orden alfabético): el rechazo sale antes de que se escriba nada
-- en el historial, y antes de validar un cambio que igual no se va a poder hacer.
create or replace function bloqueos_agenda_proteger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.creado_por_admin and auth.uid() is not null and not es_admin() then
    raise exception using
      errcode = '42501',
      message = case tg_op
        when 'DELETE' then 'bloqueo_de_la_duena: Este horario lo bloqueó la dueña: solo ella lo puede desbloquear.'
        else 'bloqueo_de_la_duena: Este horario lo bloqueó la dueña: solo ella lo puede cambiar.'
      end;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Triggers de la tabla. Orden en que corren (alfabético):
--   INSERT: trg_autoria → trg_bloqueos_agenda_validar
--   UPDATE: trg_autoria → trg_bloqueos_agenda_proteger → trg_bloqueos_agenda_validar → trg_historial
--   DELETE: trg_bloqueos_agenda_proteger → trg_historial_borrado
-- create or replace trigger (PG 14+) en vez de drop + create: el drop pide un lock exclusivo de la
-- tabla aunque sea un instante, y el replace no.
create or replace trigger trg_bloqueos_agenda_proteger before update or delete on bloqueos_agenda
  for each row execute function bloqueos_agenda_proteger();

create or replace trigger trg_bloqueos_agenda_validar before insert or update on bloqueos_agenda
  for each row execute function bloqueos_agenda_validar();

-- Historial como el resto de lo que se edita desde el panel (molde 0030): editar deja la versión
-- anterior, borrar deja la versión borrada con quién y cuándo (borrado_por, borrado_at).
create or replace trigger trg_autoria before insert or update on bloqueos_agenda
  for each row execute function autoria_de_sesion();

create or replace trigger trg_historial before update on bloqueos_agenda
  for each row execute function historial_antes_de_editar();

create or replace trigger trg_historial_borrado before delete on bloqueos_agenda
  for each row execute function historial_antes_de_borrar();

-- RLS: cualquier aprobado lee y escribe (es trabajo diario, como turnos). Las reglas por rol NO van
-- acá sino en los triggers de arriba, con raise: una policy que filtra no avisa por qué.
drop policy if exists bloqueos_agenda_lectura on bloqueos_agenda;
create policy bloqueos_agenda_lectura on bloqueos_agenda for select to authenticated
  using (es_usuario_aprobado());

drop policy if exists bloqueos_agenda_alta on bloqueos_agenda;
create policy bloqueos_agenda_alta on bloqueos_agenda for insert to authenticated
  with check (es_usuario_aprobado());

drop policy if exists bloqueos_agenda_edicion on bloqueos_agenda;
create policy bloqueos_agenda_edicion on bloqueos_agenda for update to authenticated
  using (es_usuario_aprobado()) with check (es_usuario_aprobado());

drop policy if exists bloqueos_agenda_borrado on bloqueos_agenda;
create policy bloqueos_agenda_borrado on bloqueos_agenda for delete to authenticated
  using (es_usuario_aprobado());

-- El historial de los bloqueos lo ve también el equipo: puede leer la tabla, así que puede leer su
-- historial (el principio de 0052: el historial de una fila es tan sensible como la fila). Misma
-- policy que la viva al 26/9, con bloqueos_agenda sumada a la lista.
drop policy if exists historial_ediciones_lectura on historial_ediciones;
create policy historial_ediciones_lectura on historial_ediciones for select
  using (
    es_admin()
    or (
      es_usuario_aprobado()
      -- Las mismas que el equipo puede leer en la tabla original (0045 de paneles, 0067).
      and tabla in ('clientes', 'turnos', 'horarios', 'franjas_turnos', 'duraciones_turno', 'configuracion_agenda', 'bloqueos_agenda')
    )
  );

-- La guardia de turnos ----------------------------------------------------------------------------
-- Ningún turno activo queda escrito encima de un bloqueo que lo alcance (para todos, o para su
-- probador) ni en una fecha cerrada. Sin la excepción de current_user que tiene 0066, a propósito:
-- allá se cerraba la ventana de "un equipo con su propio token"; acá se protege la agenda de todos,
-- y Lucía — que se conecta como postgres y saltea RLS — es justamente la que más turnos agenda.
-- security definer: tiene que ver todos los bloqueos y cierres aunque quien escribe no los pueda leer.
--
-- Las fechas son las del local: un turno toca los días (en hora del local) entre su inicio y su fin
-- — casi siempre uno — y toma el candado de cada uno, en orden.
create or replace function turnos_respeta_agenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := negocio_tz();
  v_inicio timestamp;
  v_fin timestamp;
  v_primer_dia date;
  v_ultimo_dia date;
  v_cierre date;
  v_bloqueo record;
begin
  v_inicio := new.inicio at time zone v_tz;
  v_fin := new.fin at time zone v_tz;
  -- Un turno que termina antes de empezar lo rechaza el check de la tabla (turnos_check), después.
  if v_fin <= v_inicio then
    return new;
  end if;
  v_primer_dia := v_inicio::date;
  v_ultimo_dia := (v_fin - interval '1 microsecond')::date; -- [inicio, fin): terminar a las 00:00 no toca el día siguiente

  for i in 0 .. (v_ultimo_dia - v_primer_dia) loop
    perform agenda_trabar_fecha(v_primer_dia + i);
  end loop;

  select c.fecha into v_cierre
    from cierres_agenda c
   where c.fecha between v_primer_dia and v_ultimo_dia
   order by c.fecha
   limit 1;
  if found then
    raise exception using
      errcode = '23P01',
      constraint = 'turno_en_dia_cerrado',
      message = format('turno_en_dia_cerrado: el %s la agenda está cerrada, ese día no se dan turnos.',
                       to_char(v_cierre, 'DD/MM/YYYY'));
  end if;

  select b.fecha, b.desde, b.hasta, b.probador into v_bloqueo
    from bloqueos_agenda b
   where b.fecha between v_primer_dia and v_ultimo_dia
     and (b.probador is null or b.probador = new.probador)
     and tsrange(b.fecha + b.desde, b.fecha + b.hasta, '[)') && tsrange(v_inicio, v_fin, '[)')
   order by b.fecha, b.desde
   limit 1;
  if found then
    raise exception using
      errcode = '23P01',
      constraint = 'turno_en_horario_bloqueado',
      message = format('turno_en_horario_bloqueado: el %s de %s a %s está bloqueado %s, ahí no se dan turnos.',
                       to_char(v_bloqueo.fecha, 'DD/MM/YYYY'),
                       to_char(v_bloqueo.desde, 'HH24:MI'),
                       to_char(v_bloqueo.hasta, 'HH24:MI'),
                       case when v_bloqueo.probador is null then 'para todos los probadores'
                            else format('para el probador %s', v_bloqueo.probador) end);
  end if;

  return new;
end;
$$;

-- Alta: todo turno que nace activo.
create or replace trigger trg_respetar_agenda_alta
  before insert on turnos
  for each row
  when (new.estado not in ('cancelado', 'no-vino'))
  execute function turnos_respeta_agenda();

-- Cambio: solo si el turno se MUEVE de verdad (inicio, fin o probador) o si vuelve a estar activo
-- desde 'cancelado'/'no-vino' (vuelve a ocupar el lugar, igual que el EXCLUDE de 0011). Confirmar,
-- cancelar, el recordatorio, el aviso o cualquier otra columna de un turno que quedó debajo de un
-- bloqueo nuevo NO pasan por acá: la regla 4 dice que esos turnos no se tocan, y tampoco se traban.
create or replace trigger trg_respetar_agenda_cambio
  before update of inicio, fin, probador, estado on turnos
  for each row
  when (
    new.estado not in ('cancelado', 'no-vino')
    and (
      new.inicio is distinct from old.inicio
      or new.fin is distinct from old.fin
      or new.probador is distinct from old.probador
      or old.estado in ('cancelado', 'no-vino')
    )
  )
  execute function turnos_respeta_agenda();

-- Funciones de trigger y el candado: nadie las llama por la API (como en 0017 y 0030). El EXECUTE
-- se chequea al crear el trigger, no cada vez que dispara; agenda_trabar_fecha la llaman funciones
-- security definer, que la ejecutan como su dueño.
revoke execute on function agenda_trabar_fecha(date) from public, anon, authenticated;
revoke execute on function bloqueos_agenda_validar() from public, anon, authenticated;
revoke execute on function bloqueos_agenda_proteger() from public, anon, authenticated;
revoke execute on function turnos_respeta_agenda() from public, anon, authenticated;
