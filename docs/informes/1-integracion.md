# Integración de Fase 1 — rama `integracion`

Las cuatro ramas se juntan acá, sobre `main`, sin tocar `main`: `main` recibe la integración recién
al cerrar la fase, con el verificador. Todo corre en `otto-integracion`, contra la base real, y no
deja datos de prueba.

## 15/9 — segunda pasada: entran 1.7, 1.14, 1.16 y 1.17

`main`, `logica`, `agente`, `paneles` y `front`, en ese orden, sin conflictos. Entraron: 1.7 cerrado
por `agente` (el turno completo, el emulador, los 15 guiones y el informe del tester, con C1 y C2
corregidos), 1.14 de `logica` (envíos por plantilla y botón Confirmo, desplegados y apagados), 1.16
de `paneles` (aviso de turno, 0031 y el arnés en `tests/paneles`) y 1.17 de `front` (el cartel del
turno 30 minutos antes).

| Qué | Cómo | Resultado |
| --- | --- | --- |
| Base: esquema, cola, RLS, 1.11, 1.14 y 1.15 | `npm test` | todos verdes |
| Agenda (1.13), WhatsApp (1.11 y 1.14), herramientas (1.4), barandillas (1.5) y el turno (1.7) | `deno test --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=.env supabase/functions/_shared/agenda supabase/functions/_shared/whatsapp tests/herramientas tests/barandillas` | 158/158 |
| Tipos | `deno check` sobre `supabase/functions/**/*.ts`, `tests/herramientas` y `tests/barandillas` | limpio |
| Generador del prompt (1.3) | `node scripts/armar-prompt.mjs --solo-validar` | válido: 249 líneas, 15 reglas |
| Pruebas del generador | `node scripts/probar-prompt.js` | 45/45 |
| Búsqueda como cliente (1.6) | `node scripts/probar-busqueda.js` | 48/48 en el primer resultado |
| Panel | `npm run typecheck` y `npx next build --webpack` en `panel/` | limpios |
| La service role fuera del navegador (1.8) | `node tests/paneles/probar-bundle.mjs` | 0 apariciones en los 96 archivos de `.next/static` |
| Panel por HTTP contra la base (1.8, 1.9, 1.10 y 1.16) | arnés de `paneles`, adaptado a esta rama (abajo) | 166/166, limpieza verificada |

### Lo que hubo que adaptar

- **El arnés de `paneles`, tal cual está en el repo, da 161/163.** Las dos que no pasan son el caso
  "sin generador": en la rama `paneles` el generador de `agente` no existe y el arnés espera un 503;
  acá sí existe y contesta. La copia de la integración (fuera del repo) arranca ese primer panel con
  `ARMAR_PROMPT_SCRIPT` apuntando a un generador que no existe, deja igual el control con el doble y
  suma una sección con el generador real: un prompt con `{{` da 422 y sigue la versión anterior, y la
  plantilla actual de Lucía pasa y queda vigente. Propuesta para `paneles`: que el primer arranque del
  arnés fije `ARMAR_PROMPT_SCRIPT` a un archivo que no existe, así corre igual en su rama y en esta,
  sin parche.
- **El build del panel se hizo con webpack.** `next build` (Turbopack) se quedó sin memoria dos veces
  en esta máquina, con otras aplicaciones abiertas; con `--webpack` pasó. No es un problema del
  proyecto, pero el deploy del final usa Turbopack: volver a probar ese build con la máquina más
  liviana antes de deployar.
- **Los 15 guiones de 1.7 no se repitieron acá.** El código del turno es el mismo de `agente`, que
  los corrió tres veces hoy después del último arreglo, y el emulador escribe `mensajes` directo: no
  pasa por `registrar_mensaje_entrante`, lo único de la base que cambió 1.14 en el camino de un
  mensaje.

### D1 del informe del tester

El tester vio en `franjas_turnos` una franja de domingo y filas firmadas por una cuenta de prueba de
`paneles`. En la base no está: franjas, horarios y duraciones siguen en v1, sin firma y sin domingo.
Fue el arnés de `paneles` corriendo al mismo tiempo que los guiones (edita filas reales y después las
restaura). Que entre semana los turnos empiecen a las 13 es la decisión del 14/9 (supuesto #20). De
acá sale una regla: el arnés de `paneles`, los guiones de `agente` y las suites que tocan la base se
corren de a uno, nunca a la vez contra la base compartida.

## Lo que falta para cerrar Fase 1

| Hito | Falta | Quién |
| --- | --- | --- |
| 1.12 Google Calendar | la cuenta de servicio de Google y el ID del calendario; el código lo avanza `logica` sin la cuenta y lo prueba de verdad cuando llegue | Mr Otto, Mateo |
| 1.14 recordatorios y crons | que Meta apruebe las tres plantillas (las carga Mateo) y el link de reseñas en Configuración › Enlaces, con un nombre que empiece con "Reseña"; después `CRONS_ENVIOS=on` y la prueba con el número de Mateo | Mateo, Meta, Mr Otto |

1.12 y 1.14 quedan en Fase 1 (decisión #11 del 15/9). El control 6 de 1.11, el mensaje real por Meta
con el webhook propio, pasó a Fase 2 (decisión #12).

Del informe del tester quedan M1 (la ficha no puede volver a "no sé"), M2 (se presenta dos veces si
la ponen a la defensiva) y B2 (no aclara que no encontró un turno para cambiar), documentados por
`agente` para la próxima ronda. No bloquean la fase.

## 14/9 — primera pasada

`logica`, `agente`, `paneles` y `front`, sin conflictos. `npm test` verde; agenda, WhatsApp,
herramientas y barandillas 140/140; `deno check` limpio; generador válido (247 líneas) y 45/45;
búsqueda 48/48; typecheck y build del panel limpios; arnés de `paneles` 147/147.

Ese día cerró **H1.9, control 4**, pendiente desde el 13/9: el handler del prompt base con el
generador real de `agente` detrás, en vez del doble. Hoy se volvió a probar con la plantilla actual.
