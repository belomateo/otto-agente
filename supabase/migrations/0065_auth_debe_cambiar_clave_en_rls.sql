-- 0065_auth_debe_cambiar_clave_en_rls.sql — hallazgo de la auditoría de logica (22/9):
-- debe_cambiar_clave (0059) solo lo aplicaban middleware.ts y sesion.ts — PostgREST no sabía
-- nada de esa bandera. Alguien con una clave temporal (recién dada de alta, o recién reseteada)
-- podía leer y escribir todo por la API directa (supabase-js con su propio token), sin pasar
-- nunca por /cambiar-clave: la marca era de UX, no una barrera real.
--
-- Se suma acá, en es_usuario_aprobado()/es_admin() (0007), no en una función aparte: son las dos
-- únicas puertas de entrada de RLS a todo el negocio (turnos, clientes, catálogo, configuración,
-- etc. — cada policy de cada tabla las llama), así que es el único lugar que cubre TODAS las
-- tablas de una vez, sin tener que tocar policy por policy.
--
-- Por qué no rompe el propio cambio de clave: /api/mi-cuenta/clave (route handler) no lee
-- ninguna tabla RLS — llama a auth.updateUser() (schema auth, no pasa por estas funciones) y a
-- terminar_cambio_clave() (0059, security definer, scopeado a auth.uid(), sin chequear
-- es_usuario_aprobado() ni es_admin() adentro). middleware.ts y sesion.ts ya dejaban pasar esa
-- ruta puntual antes de esto — esto solo cierra el mismo hueco un nivel más abajo, en la base.
create or replace function es_usuario_aprobado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
    where p.id = auth.uid() and p.estado = 'aprobado' and p.debe_cambiar_clave = false
  );
$$;

create or replace function es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
    where p.id = auth.uid() and p.estado = 'aprobado' and p.rol = 'admin' and p.debe_cambiar_clave = false
  );
$$;
