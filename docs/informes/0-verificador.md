# Informe del verificador — Fase 0 (cimientos)

Revisado el 12/9/2026. Alcance: lo construido por `logica` en Fase 0 —
`supabase/migrations/0001–0010`, `supabase/seeds/*`, `tests/sql/run.mjs`,
`package.json` (raíz), `panel/lib/supabase/*`, `panel/middleware.ts`,
`panel/app/(auth)/**`, `panel/app/(panel)/layout.tsx` y los cambios de Auth en
`panel/components/nav/*`. No se evaluó `AGENTE.md`, `plantilla-agente/`, ni las
pestañas con mock de H1.1/H1.2.

Pude conectarme a la base real (`SUPABASE_DB_URL` del `.env` local), así que esto
no es solo lectura de código: las afirmaciones sobre RLS, la cola y el trigger de
historial están verificadas contra el proyecto `fhyuvdliwppqkneddezn`.

---

## 1. Estado de compilación

| Control | Resultado |
| --- | --- |
| `npm run build` en `panel/` | ✅ Limpio a la primera, 14 rutas, sin errores de tipos |
| `tsc --noEmit` en `panel/` | ✅ Limpio |
| `npm test` en la raíz (controles de Fase 0 contra la base real) | ✅ 3/3 controles — pasó de 7 a 10 aserciones después de mis correcciones |
| `deno check` | No aplica: `supabase/functions/` no existe todavía (Fase 1, H1.11) |

No hubo nada que arreglar para que compilara. Dos avisos del build que no rompen
nada y van en Observaciones: el convenio `middleware.ts` quedó deprecado en Next
16.3 (ahora es `proxy.ts`) y hay dos lockfiles, así que Next infiere mal el
workspace root.

Sí encontré un script roto: `npm run lint` del panel ejecutaba `next lint`, que
Next 16 eliminó — el comando interpretaba "lint" como un directorio y fallaba
siempre. No hay ESLint instalado ni configurado en el panel. Lo reemplacé por
`typecheck`, que es lo que el tester (modo repo) y este informe necesitan correr.

---

## 2. Problemas encontrados y corregidos

Todo esto está corregido en el árbol de trabajo, **sin commitear**.

### 2.1 `cola_tomar_uno()` devolvía una fila fantasma con la cola vacía

`supabase/migrations/0002_cola.sql`. La función declaraba `returns cola_trabajos`
(un registro compuesto), y una función así no puede devolver "nada": con la cola
vacía, `select * from cola_tomar_uno('w')` devolvía **una fila con todas las
columnas en NULL**. Lo verifiqué contra la base antes de tocar nada: `rowCount: 1`.
El worker de H1.11 todavía no existe; si se escribe con el reflejo normal
(`if (rows.length > 0)`) va a tomar ese fantasma como trabajo y a fallar más
adelante con un `conversacion_id` nulo. Cambiada a `returns setof cola_trabajos`
con `return;` temprano: cola vacía = cero filas. La lógica de `FOR UPDATE SKIP
LOCKED` no se tocó y el control sigue pasando.

### 2.2 El trigger de historial mezclaba dos momentos distintos

`supabase/migrations/0003_negocio.sql`. `historial_antes_de_editar()` guardaba
`version` y `editado_por` de `OLD` (la versión que se reemplaza) pero `editado_at`
con `now()` (el momento de la edición que la reemplaza). La fila de historial
quedaba diciendo "v1, la editó Ana, el martes", donde el martes es cuando Beto la
pisó. El panel no puede mostrar el historial sin mentir. Ahora los tres campos
salen de `OLD`.

### 2.3 El middleware perdía las cookies refrescadas en cada redirección

`panel/middleware.ts`. `getUser()` puede rotar el token y `@supabase/ssr` escribe
las cookies nuevas sobre `response`; las tres redirecciones devolvían un
`NextResponse.redirect()` recién creado, que nace sin esas cabeceras. Cuando la
rotación cae justo en un request que redirige, el navegador se queda con el
refresh token viejo (ya consumido) y la sesión se cae sola en el request
siguiente — el típico "me deslogueó solo" que después no se puede reproducir.
Agregué `redirigirA()`, que copia `response.cookies` a la redirección.

### 2.4 `startsWith` dejaba colar rutas que no son de auth

Mismo archivo. `RUTAS_AUTH.some(r => pathname.startsWith(r))` daba verdadero para
`/logincualquiercosa`, y esa ruta se servía sin chequear el perfil. Pasado a
igualdad exacta o subruta (`pathname === r || pathname.startsWith(r + '/')`).
No es un agujero de datos (RLS igual devuelve cero filas), pero es el guardián
haciendo mal su trabajo.

### 2.5 El matcher listaba los estáticos por nombre

Mismo archivo. Excluía `logo-otto.png` a mano, así que cada imagen nueva que sume
`front` iba a disparar un `getUser()` (llamada HTTP al servidor de auth) más una
consulta a `perfiles` **por cada request de un .png**. Cambiado a exclusión por
extensión, que es el patrón que documenta Supabase.

### 2.6 El login mostraba "Email o contraseña incorrectos" para cualquier error

`panel/app/(auth)/login/page.tsx`. Un rate limit de Supabase (429, muy fácil de
tocar en el plan gratuito), el servidor caído o un email sin confirmar se leían
todos como "me equivoqué de clave", y la persona vuelve a intentar, que es justo
lo que empeora un 429. Agregué `mensajeDeError()` (429 / red / email ya
registrado / contraseña corta / email sin confirmar), un `try/catch` para que el
formulario no quede trabado en "Un momento…" si la promesa explota, y el caso
`signUp` sin sesión: si alguien vuelve a activar la confirmación por email
(supuesto #19), antes redirigía a `/esperando`, el middleware no veía usuario y lo
rebotaba a `/login` sin explicar nada; ahora avisa que revise el mail.

### 2.7 El control de RLS no controlaba nada

`tests/sql/run.mjs`. Las tres aserciones eran "anon ve 0 filas en clientes" con
`clientes` **vacía** (lo confirmé: 0 filas en la base). Esa prueba pasa igual con
RLS apagado y con todas las policies borradas. Ahora la prueba inserta un cliente
y un turno dentro de la transacción, confirma que el dueño de la tabla sí los ve,
y recién entonces mide el cero. Agregué además que un autenticado sin perfil
aprobado **no puede insertar** (en Supabase, `anon` y `authenticated` tienen GRANT
de INSERT/UPDATE/DELETE por defecto: lo único que los frena es el `with check` de
la policy, y eso no se estaba probando). De 7 aserciones pasó a 10, todas en
verde.

### 2.8 La prueba de la cola se rompía para siempre si una corrida moría a mitad

Mismo archivo. Es la única que no puede vivir en una transacción, y si el proceso
moría entre el insert y la limpieza, el `unique` de `clientes.telefono` hacía
fallar todas las corridas siguientes hasta limpiar a mano. Agregué el borrado
defensivo antes del insert y un `try/finally` anidado para que la conexión se
cierre aunque falle un delete. Verifiqué después de correr: 0 filas en `clientes`,
`conversaciones`, `mensajes`, `turnos`, `cola_trabajos` e `historial_ediciones`.

### 2.9 Menores

- `panel/package.json`: `lint` roto → `typecheck: tsc --noEmit` (§ 1).
- `.gitignore`: agregado `*.tsbuildinfo` — `tsconfig.json` tiene
  `incremental: true`, así que correr el typecheck nuevo deja
  `panel/tsconfig.tsbuildinfo` sin ignorar y se commitea de casualidad.

---

## 3. Problemas pendientes

### 3.1 Las dos funciones SQL corregidas NO están aplicadas a la base (acción)

Las migraciones 0001–0010 ya corrieron contra el proyecto real, así que editar el
archivo no cambia la base: hoy el repo y la base dicen cosas distintas, que es
exactamente la trampa de `CLAUDE.md` § 7 ("el registro de migraciones puede
mentir"). Intenté aplicarlas yo y el entorno me bloqueó la ejecución de DDL
—correcto, además, porque pediste revisar los cambios antes de que entren—. Hay
que correr esto contra la base (las dos son idempotentes y no tocan datos):

```sql
drop function if exists cola_tomar_uno(text);
-- después, pegar tal cual el cuerpo nuevo de supabase/migrations/0002_cola.sql
-- y el de historial_antes_de_editar() de supabase/migrations/0003_negocio.sql
```

Alternativa igual de válida: revertir esos dos archivos y dejar el fantasma y el
timestamp cruzado documentados para Fase 1. Lo que no puede quedar es el archivo
corregido y la base sin corregir.

### 3.2 Todavía no hay ningún admin

`auth.users` y `perfiles` tienen **0 filas**. El supuesto #18 ya lo anticipa, pero
conviene decirlo como lo que es hoy: el primero que se registre queda en
`pendiente` y no hay nadie que pueda aprobarlo. Mateo se registra una vez desde
`/login` y recién ahí se promueve su fila (`rol='admin', estado='aprobado'`) por
SQL. Hasta entonces el panel no se puede usar con datos.

### 3.3 `turnos` no tiene protección contra solapamiento por probador (decisión)

`turnos_probador_inicio_idx` es un índice, no una restricción: dos reservas
concurrentes para el mismo probador a la misma hora entran las dos. El cálculo de
huecos de H1.13 corre en código y no alcanza — entre el chequeo y el insert hay
una ventana. Lo determinístico de verdad sería una `EXCLUDE USING gist (probador
WITH =, tstzrange(inicio, fin) WITH &&)` con `btree_gist`, que además obliga a
decidir 3.4. Es una migración nueva y toca el modelo, así que lo dejo como
decisión, no lo aplico yo.

### 3.4 Faltan estados en `turnos` y uno mezcla dos cosas (decisión de producto)

El enum es `sin-confirmar · confirmado · alquilo · retiro · devolvio · con-aviso`.
No hay `cancelado` ni `no-vino`: hoy cancelar un turno es borrar la fila, y se
pierde el historial. Y `con-aviso`, según `ui-otto/BloqueTurno.tsx`, no es un
estado del ciclo de vida sino un **aviso de sincronización** ("sin sincronizar con
Google Calendar"): guardarlo en la misma columna hace que un turno con problema de
sync pierda su estado real. Se resuelve con una columna aparte (`aviso text`), pero
toca la UI ya construida por `front`, así que va a acuerdo entre roles.

### 3.5 `horarios` no puede expresar el corte de un solo probador

El supuesto #5 dice "corte 14–15 (un probador 13–14)", pero la tabla tiene un
único par `corte_desde/corte_hasta` por día, para todos los probadores. Ese dato
hoy vive únicamente en la prosa de la regla 4 de `reglas_agente`, es decir, en el
prompt. H1.13 no lo va a poder calcular en código, y quien termine decidiendo si
las 13:30 del probador 2 sirven va a ser el modelo — que es justo el principio 1 al
revés. Si el corte escalonado es real, necesita columna (o una fila de horario por
probador) antes de H1.13.

---

## 4. Violaciones a los principios de CLAUDE.md § 2

**Principio 1 (determinístico en código)** — no aplica todavía: en Fase 0 no hay
una sola llamada a un LLM, ni una decisión de negocio tomada por un modelo.
Confirmado. La única amenaza futura es 3.5, que dejo anotada arriba.

**Principio 2 (nada de negocio hardcodeado)** — una violación real, menor:
`supabase/seeds/0003_reglas.sql`, regla 4: *"El local corta de 14 a 15 (un
probador puede cortar de 13 a 14): nunca se agenda en ese rango"*. Ese horario ya
vive estructurado en `horarios.corte_desde/corte_hasta`, y el comentario del
propio seed dice que `armar-prompt.mjs` vuelca las reglas al prompt tal cual. O
sea: el día que el dueño cambie el corte desde Configuración, la tabla dice una
cosa y el prompt sigue diciendo 14–15 — es el mismo caso que "un precio en el
prompt es un precio viejo". La regla debería nombrar la política sin el número
("nunca se agenda dentro del corte del mediodía; el horario vigente sale de la
herramienta de agenda"). No lo corregí porque es texto de negocio, ya está
cargado en la base y lo tiene que redactar quien maneja la voz de Lucía.

El resto del principio 2 está bien resuelto: precios, horarios, reglas, contexto y
enlaces están en tablas, no en código, y los seeds son datos con su fuente citada.

**Principio 12 (el dueño edita sin programador)** — sostenido por el esquema: las
siete tablas editables tienen `version`, `editado_por`, `editado_at` y trigger de
historial. Bien.

---

## 5. Observaciones de calidad

**RLS, verificada y no solo leída.** Las 21 tablas de `public` tienen RLS activo:
no quedó ninguna afuera (contrastado contra `pg_class`, no contra la lista del
archivo). Con filas presentes, `anon` y un autenticado sin perfil aprobado ven
cero y no pueden insertar. El patrón de `es_usuario_aprobado()` / `es_admin()`
como `security definer` con `search_path` fijo es el correcto y evita la recursión
de la policy de `perfiles` consigo misma. Un usuario no aprobado sí puede leer su
propia fila de `perfiles`, que es lo que necesita `/esperando`, y no puede
modificarla: aprobarse a sí mismo es imposible.

**Rendimiento del middleware (lo que preguntaste explícitamente).** Es razonable
para V1 y no lo tocaría ahora. El costo real no es solo la consulta a `perfiles`:
`getUser()` hace además una llamada HTTP al servidor de auth en **cada** request,
y `app/(panel)/layout.tsx` repite las dos (getUser + perfiles) en cada navegación
— o sea, hasta cuatro llamadas remotas por página. Con un equipo de local está
perfecto. Cuando moleste, el camino estándar es un custom access token hook que
meta `rol` y `estado` en el JWT, y el middleware deja de consultar la base.
Anotarlo, no hacerlo ahora.

**El middleware también intercepta `/api/**`.** Cuando `paneles` sume route
handlers en H1.8, un request sin sesión va a recibir un redirect 307 a `/login` en
vez de un 401 JSON. Conviene decidirlo ahí, no descubrirlo con un fetch que
devuelve HTML.

**Errores descartados en silencio.** El middleware ignora el `error` de la
consulta a `perfiles`: si la base parpadea, un admin aprobado termina en
`/esperando` sin saber por qué. Falla cerrado, que es lo correcto en seguridad,
pero para depurar conviene distinguir "no existe la fila" de "la consulta falló".

**Cola.** Nadie incrementa `cola_trabajos.intentos` y no hay quien rescate los
trabajos que quedan en `procesando` si el worker muere: hoy se quedan ahí para
siempre. Está previsto (la limpieza de cola figura en `STACK.md` § 2) pero es de
esas cosas que se pasan. Además, el índice es `(estado)` y la consulta real es
`where estado='pendiente' order by creado_at`: a futuro conviene un parcial
`(estado, creado_at)`. Al volumen de V1 da exactamente igual.

**Storage.** Faltan policies de `UPDATE` en `storage.objects`: una subida con
`upsert: true` (o reemplazar una foto del catálogo por la misma ruta) va a fallar
con 403 cuando `paneles` lo implemente en H1.9.

**`mensajes` y `eventos_agente` son de solo lectura para el panel.** Correcto hoy,
pero implica que "Atención humana" tiene que enviar por un route handler con
`service_role`: no lo va a poder hacer el cliente del navegador. Conviene que
quede escrito antes de Fase 2.

**CRLF.** Los `.sql` están en CRLF en disco (Windows) pero entran LF al repo:
`git check-attr eol` devuelve `lf` y los blobs no tienen un solo `\r`. Ningún
literal SQL de los seeds cruza más de una línea, así que no se cuela `\r` a los
datos. Cuando Fase 1 escriba `prompt.md` y los fragmentos —textos largos, sí
multilínea— ahí la normalización al leer (`CLAUDE.md` § 7) pasa a ser obligatoria.

**Funciones sin `search_path` fijo**: `immutable_unaccent`, `cola_tomar_uno` e
`historial_antes_de_editar`. Ninguna es `security definer`, así que el riesgo real
es bajo, pero el linter de Supabase las marca. Se lo dejo al subagente de
seguridad, que es quien tiene que decidirlo.

**`SUPABASE_SERVICE_ROLE_KEY` ya está en `panel/.env.local`** sin que nada del
panel la use todavía. No es `NEXT_PUBLIC_`, así que no entra al bundle; también
para seguridad.

**`manejar_alta_usuario()` no tiene `on conflict`**: si por lo que sea ya existe
un perfil con ese id, el alta entera de `auth.users` falla con "Database error
saving new user", que es un mensaje que no le dice nada a nadie. Muy improbable;
un `on conflict (id) do nothing` lo cubre.

**Deuda de plataforma (Next 16).** El convenio `middleware.ts` está deprecado a
favor de `proxy.ts` (hay codemod). Y hay dos `package-lock.json` (raíz y panel),
por lo que Next infiere mal el workspace root — conviene fijar `turbopack.root` /
`outputFileTracingRoot` antes del deploy de Fase 3, o el tracing de archivos puede
salir mal. Ninguna de las dos bloquea nada hoy.

**Los hitos están bien escritos.** `0.1` y `0.2` declaran control, evidencia y
supuestos verificables por otro, y lo que dicen coincide con lo que encontré en la
base. No hay maquillaje.

**Lo que NO verifiqué**: no abrí el panel en el navegador con una sesión real
(no hay usuario en la base para hacerlo, ver 3.2). El flujo de auth de punta a
punta está verificado por `logica` en el hito 0.2 con Playwright, no por mí; mis
cambios en el middleware y el login están verificados por build y typecheck
limpios más lectura, no con una sesión real. Conviene una pasada manual por
`/login → /esperando → /bandeja` después de aplicar 3.1 y 3.2.

---

## 6. Veredicto

**Apto para seguridad**, con una condición operativa: aplicar a la base las dos
funciones corregidas (§ 3.1) o revertir esos dos archivos. Mientras el archivo
diga una cosa y la base otra, cualquier cosa que se construya arriba se apoya en
algo que no es cierto.

La fase está bien hecha. El esquema cubre lo que pide `STACK.md` § 2 sin agujeros,
RLS está puesta y —ahora sí— probada de verdad, la cola resuelve la concurrencia
como corresponde, y el panel compila y protege sus rutas. Los problemas que
encontré eran reales pero acotados: ninguno exigía rehacer nada, y los que quedan
abiertos (§ 3.3 a § 3.5) son decisiones de modelo y de producto que conviene tomar
antes de H1.13, no errores de esta fase.
