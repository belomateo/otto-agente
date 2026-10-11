-- 0102_analista_de_charlas.sql — el analista de charlas. Pedido de Mateo (9/10, repetido el 10/10):
-- «una sub-pestaña dentro de la Bitácora, solo ahí, con los errores y las mejoras del agente».
-- Cada noche la función `analista` lee las charlas del día anterior en que habló Lucía (mensajes y
-- bitácora: herramientas, controles que saltaron, pases al equipo), se las pasa de a una a un modelo
-- (LLM_ANALISTA, o LLM_PRINCIPAL si no está) junto con las reglas de Lucía (prompt.md) y lo que es
-- verdad (fichas, precios, horario), y guarda acá lo que encontró: errores de Lucía citando el
-- mensaje textual, y mejoras (un dato que faltó en las fichas, una frase que se puede decir mejor).
-- NUNCA cambia nada solo (PROCESOS.md § 6): un admin marca cada punto «Hecho» o «Descartar» desde
-- Bitácora › Analista. Reemplaza a la `propuestas_mejora` que planeaba PROCESOS.md, que nunca existió.
--
-- Qué trae:
--   1. analisis_charlas: un hallazgo por fila (error o mejora), con su estado.
--   2. analisis_revisiones: una fila por charla y noche. Sirve para tres cosas: que una charla no se
--      analice dos veces (aunque dos corridas se pisen: la toma es un insert … on conflict), cortar
--      la noche por tope (cuántas charlas y cuánta plata ya se fueron) y mostrar el resumen de la
--      noche en el panel (cuántas se revisaron, cuántas fallaron, cuánto costó).
--   3. Quién marcó cada hallazgo lo pone la base mirando la sesión, no el pedido.
--   4. RLS y permisos: lee cualquier aprobado; el estado lo cambia solo un admin, y es lo único que
--      se puede cambiar (lo demás lo escribe la función, con la conexión directa a la base).
--   5. analista_relevo(): una Edge Function vive ~150 s y una noche con 30 charlas no entra en una
--      sola llamada (cada análisis tarda 15 a 40 s). La función, cuando se queda sin tiempo y
--      quedan charlas, se pide otra llamada por pg_net —igual que despertar_worker (0096)— y esa
--      sigue donde quedó.
--   6. El reloj: 03:00 de Argentina, y una red de contención a las 04:00 por si la cadena de relevos
--      se cortó (si ya está todo, esa llamada termina enseguida sin gastar nada).
--
-- Idempotente: correrla dos veces no falla ni duplica nada. La aplica Mateo a mano; el panel puede
-- salir antes (la pestaña dice que falta activarlo mientras la tabla no exista).

-- 1. Hallazgos -----------------------------------------------------------------------------------
create table if not exists analisis_charlas (
  id uuid primary key default gen_random_uuid(),
  -- El día de las charlas analizadas (hora de Argentina), no el de la corrida (que es a las 03:00
  -- del día siguiente).
  fecha date not null,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  -- El mensaje citado (para ubicarlo en la charla y mostrar su hora). Null en una mejora que no sale
  -- de un mensaje puntual.
  mensaje_id uuid references mensajes(id) on delete set null,
  tipo text not null check (tipo in ('error', 'mejora')),
  categoria text not null,
  -- Solo los errores: alta (pierde el cliente o le dio un dato falso que lo perjudica), media, baja.
  gravedad text check (gravedad in ('alta', 'media', 'baja')),
  -- De quién es el mensaje citado: casi siempre de Lucía; del cliente cuando lo que pasó es que su
  -- pregunta quedó sin contestar, o en una mejora (la pregunta que pedía un dato que no estaba).
  autor_cita text check (autor_cita in ('lucia', 'cliente')),
  cita text,
  -- Qué estuvo mal (error) o qué faltó (mejora).
  que_paso text not null,
  -- Qué conviene hacer (error). En una mejora va el texto sugerido aparte.
  que_conviene text,
  -- Mejora de un dato que faltó: en qué ficha iría (las secciones de buscar_informacion).
  tema text,
  texto_sugerido text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'descartado')),
  marcado_por uuid references perfiles(id) on delete set null,
  marcado_at timestamptz,
  modelo text,
  creado_at timestamptz not null default now(),
  -- Las categorías van con su tipo: un error no puede ser «frase» ni una mejora «dato_falso». Son las
  -- mismas listas que supabase/functions/analista/respuesta.ts (CATEGORIAS_ERROR/CATEGORIAS_MEJORA).
  constraint analisis_charlas_categoria_check check (
    (tipo = 'error' and categoria in (
      'dato_falso', 'promesa_no_cumplida', 'derivo_sin_necesidad', 'no_contesto',
      'no_ofrecio_turno', 'tono', 'regla'))
    or (tipo = 'mejora' and categoria in ('dato_faltante', 'frase'))
  )
);

create index if not exists analisis_charlas_fecha_idx on analisis_charlas (fecha, tipo);
create index if not exists analisis_charlas_conversacion_idx on analisis_charlas (conversacion_id);
create index if not exists analisis_charlas_mensaje_idx on analisis_charlas (mensaje_id) where mensaje_id is not null;
create index if not exists analisis_charlas_marcado_por_idx on analisis_charlas (marcado_por) where marcado_por is not null;

comment on table analisis_charlas is
  'Analista de charlas (0102): errores de Lucía y mejoras sugeridas, uno por fila. Lo escribe la función analista cada noche; un admin lo marca hecho o descartado desde Bitácora › Analista. Nunca se aplica solo.';

-- 2. Revisiones: una por charla y noche ------------------------------------------------------------
create table if not exists analisis_revisiones (
  fecha date not null,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  -- analizando: la tomó una corrida (si quedó así más de 10 minutos, esa corrida murió y la puede
  -- retomar otra) · analizada: terminó, con o sin hallazgos · fallo: el modelo no contestó o
  -- contestó algo que no se pudo leer (se reintenta una vez en otra corrida) · salteada: no se
  -- analizó porque la noche llegó a su tope de charlas o de plata.
  estado text not null check (estado in ('analizando', 'analizada', 'fallo', 'salteada')),
  intentos int not null default 1,
  hallazgos int not null default 0,
  modelo text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  -- Lo que costó analizar esta charla (todos los intentos). Mismo cálculo que consumo_llm.
  costo_usd numeric(10, 4) not null default 0,
  -- Por qué falló o se salteó.
  detalle text,
  tomada_at timestamptz not null default now(),
  terminada_at timestamptz,
  primary key (fecha, conversacion_id)
);

create index if not exists analisis_revisiones_conversacion_idx on analisis_revisiones (conversacion_id);

comment on table analisis_revisiones is
  'Analista de charlas (0102): una fila por charla y noche analizada. Evita analizar dos veces, lleva el tope de la noche (charlas y costo) y el resumen que muestra Bitácora › Analista.';

-- 3. Quién marcó cada hallazgo ---------------------------------------------------------------------
-- Lo fija la base mirando la sesión (como autoria_de_sesion, 0017), diga lo que diga el pedido: el
-- panel solo manda el estado. Volver a «pendiente» borra la marca. Sin usuario en la sesión (la
-- función, con la conexión directa) se respeta lo que viene.
create or replace function analisis_charlas_marcar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'pendiente' then
      new.marcado_por := null;
      new.marcado_at := null;
    else
      if (select auth.uid()) is not null then
        new.marcado_por := (select auth.uid());
      end if;
      new.marcado_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- create or replace trigger (PG 14+): no pide el lock exclusivo que pide un drop + create.
create or replace trigger trg_analisis_charlas_marcar before update on analisis_charlas
  for each row execute function analisis_charlas_marcar();

-- Función de trigger: nadie la llama por la API (mismo criterio que 0017 y 0067).
revoke execute on function analisis_charlas_marcar() from public, anon, authenticated;

-- 4. RLS y permisos --------------------------------------------------------------------------------
-- Los hallazgos los lee cualquier aprobado y el estado lo cambia solo un admin (pedido del 10/10).
-- Además de la policy, el permiso de columna: lo único que un usuario puede cambiar es el estado (la
-- cita y el diagnóstico son lo que dijo el analista y no se reescriben desde el panel). Insertar y
-- borrar no: lo hace la función, que entra con la conexión directa y no pasa por la RLS.
alter table analisis_charlas enable row level security;

drop policy if exists analisis_charlas_lectura on analisis_charlas;
create policy analisis_charlas_lectura on analisis_charlas for select to authenticated
  using ((select es_usuario_aprobado()));
drop policy if exists analisis_charlas_admin_marca on analisis_charlas;
create policy analisis_charlas_admin_marca on analisis_charlas for update to authenticated
  using ((select es_admin())) with check ((select es_admin()));

revoke all on analisis_charlas from anon, authenticated;
grant select on analisis_charlas to authenticated;
grant update (estado) on analisis_charlas to authenticated;

-- Las revisiones llevan el costo: solo admin, igual que consumo_llm y metricas_diarias (0046,
-- decisión de Mateo: las métricas son de la dueña). Solo lectura: las escribe la función.
alter table analisis_revisiones enable row level security;

drop policy if exists analisis_revisiones_lectura_admin on analisis_revisiones;
create policy analisis_revisiones_lectura_admin on analisis_revisiones for select to authenticated
  using ((select es_admin()));

revoke all on analisis_revisiones from anon, authenticated;
grant select on analisis_revisiones to authenticated;

-- 5. El relevo ------------------------------------------------------------------------------------
-- Lo llama la función analista (conexión directa a la base) cuando se queda sin tiempo y quedan
-- charlas por analizar: pide otra llamada con la misma fecha. No espera la respuesta (pg_net es
-- asíncrono). Sin los secretos de Vault no hace nada: lo levanta el reloj de contención de las 04:00.
create or replace function analista_relevo(p_fecha date, p_relevo int)
returns void
language plpgsql
security definer -- lee Vault, igual que despertar_worker (0096)
set search_path = public
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_secreto text := (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret');
begin
  if v_url is null or v_secreto is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/analista',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secreto),
    body := jsonb_build_object('fecha', p_fecha, 'relevo', p_relevo)
  );
end;
$$;

revoke execute on function analista_relevo(date, int) from public, anon, authenticated;
grant execute on function analista_relevo(date, int) to service_role;

-- 6. El reloj ---------------------------------------------------------------------------------------
-- pg_cron corre en UTC: las 06:00 UTC son las 03:00 en Argentina y las 07:00, las 04:00. Sin fecha en
-- el cuerpo, la función analiza el día anterior en hora de Argentina (NEGOCIO_TZ). La de las 04:00 es
-- la red de contención (como el cron del worker, 0020): si la cadena de relevos se cortó, sigue donde
-- quedó; si no, contesta que ya estaba todo y no llama a ningún modelo.
-- cron.schedule con un nombre que ya existe reemplaza el job: correrla dos veces no duplica nada.
select cron.schedule('analista-charlas', '0 6,7 * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/analista',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url');
$cron$);
