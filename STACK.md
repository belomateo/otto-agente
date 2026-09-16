# STACK.md — Con qué se construye

Estado al 12/9/2026. Lo que ya existe está marcado ✅; lo que hay que crear, ⬜;
lo que depende de una confirmación externa, ❓ (y está en `docs/supuestos.md`).

---

## 1. Resumen

| Capa | Herramienta | Estado |
| --- | --- | --- |
| Mensajería | WhatsApp Cloud API (Meta) — número nuevo, webhook ya armado | ✅ webhook · ⬜ número en producción |
| Backend | Supabase (proyecto **nuevo**): Postgres, Edge Functions (Deno), Auth, Storage, pg_cron | ⬜ |
| LLM | OpenAI API (una sola API key; varios modelos según tarea) | ✅ key · ⬜ integración |
| Agenda | Google Calendar API + tabla propia `turnos` | ⬜ |
| Turnero actual | doyturnos (`app3.doyturnos.com/ottoalquiler`) | ❓ ver § 4 |
| Panel | Next.js (App Router) + Tailwind + shadcn/ui, en Vercel | ⬜ |
| Desarrollo | Claude Code ×4 desde VS Code, Windows, git + GitHub | ✅ |
| Fotos | Links de la web de Mr Otto cargados en fichas + Supabase Storage para subidas del dueño | ⬜ |

---

## 2. Supabase

Un proyecto nuevo, solo para Otto. Nada compartido con otros clientes de ZW Labs.

**Postgres** — esquema en `supabase/migrations/`, en este orden:

1. `0001_base.sql` — `clientes`, `conversaciones`, `mensajes`, `notas`,
   `eventos_agente` (bitácora), `derivaciones`.
2. `0002_cola.sql` — `cola_trabajos` con `FOR UPDATE SKIP LOCKED`; dos workers no
   toman el mismo trabajo.
3. `0003_negocio.sql` — `catalogo_alquiler` (modelos, colores, talles, precio base,
   fotos), `accesorios_alquiler`, `horarios`, `reglas_agente`, `contexto_agente`,
   `notas_dueno`, `enlaces`.
4. `0004_turnos.sql` — `turnos` (tipo: graduado / novio / invitado / doble /
   triple / prueba_final; duración; probador 1-3; estado; `google_event_id`;
   `recordatorio_enviado_at`; `confirmado` boolean + `confirmado_at`).
5. `0005_fragmentos.sql` — `fragmentos` (tema, título, texto, activo, versión) con
   índice de texto completo `spanish` + `unaccent`. **No pgvector en V1**: la base
   es chica y el cliente escribe sin tildes; FTS con `unaccent` alcanza y es
   determinístico.
6. `0006_metricas.sql` — `consumo_llm` (modelo, tokens in/out, costo, turno),
   `metricas_diarias`.
7. `0007_rls.sql` — RLS en todas las tablas. `anon` ve cero filas. Un usuario
   autenticado **sin perfil aprobado** también ve cero filas.
8. `0008_storage.sql` — bucket `catalogo` (público lectura) y `adjuntos` (privado).
9. `0009_cron.sql` — pg_cron: recordatorio 24 hs, recontacto post-devolución,
   analista nocturno, limpieza de cola.
10. `0010_auth_solicitudes.sql` — `perfiles` (rol: admin / equipo) y
    `solicitudes_acceso` (pendiente / aprobada / rechazada). El primer admin se
    crea por seed; los demás piden acceso y el admin aprueba desde Configuración.

**Edge Functions** (Deno, TypeScript, `deno check` limpio):

| Función | Trigger | Hace |
| --- | --- | --- |
| `webhook-whatsapp` | POST de Meta | Verifica firma, dedup por `wa_message_id`, guarda mensaje, encola. Responde 200 en < 1 s siempre. |
| `worker` | pg_cron cada 10 s / o llamada tras encolar | Toma trabajos, corre el turno del agente (ver `AGENTE.md` § 3), envía por Meta, escribe bitácora. |
| `cron-envios` | pg_cron por `tipo` (0022) | Los cuatro envíos por plantilla: recordatorio 24 hs antes del turno (marca `recordatorio_enviado_at`), agradecimiento con pedido de reseña tras la devolución, y los dos recontactos. Apagado mientras `CRONS_ENVIOS` no valga `on`: espera que Meta apruebe las plantillas. |
| `cron-analista` | pg_cron 03:00 | Subagente LLM que lee las charlas del día y propone mejoras (ver `PROCESOS.md` § 6). |
| — | webhook (respuesta al botón) | La confirmación del turno **no es una función aparte**: la resuelve el `worker` (`confirmarPorBoton` en `atender.ts`, `turno_confirmar_por_boton` en 0021). |
| `probar-agente` | POST desde `scripts/` | Emulador: mismo agente, misma base, sin Meta, sin Calendar real (usa modo dry-run). |

---

## 3. LLM — OpenAI

Una API key, en `OPENAI_API_KEY`. Los modelos se eligen por tarea y se configuran
por variable de entorno, **nunca hardcodeados**, para poder cambiarlos sin
redeploy:

| Variable | Uso | Criterio |
| --- | --- | --- |
| `LLM_PRINCIPAL` | Lucía: la respuesta al cliente, con tools | El mejor modelo disponible con tool calling y caché de prefijo |
| `LLM_CLASIFICADOR` | Intención de entrada (alquiler / venta / corporativo / reclamo / urgente / otro) | Modelo chico y rápido; salida JSON estricta |
| `LLM_EXTRACTOR` | Arma la ficha del cliente a partir del mensaje | Modelo chico; salida JSON estricta contra un schema |
| `LLM_ANALISTA` | Análisis nocturno de charlas | Modelo grande, corre una vez por día |

Reglas de uso:

- `max_tokens` siempre seteado. Salidas JSON con `response_format` estricto.
- Prompt del principal = archivo `prompt.md` (prefijo cacheable) + contexto del turno
  (libreta, ficha, turnos, hora actual) + historial. En ese orden.
- Costo por turno se registra en `consumo_llm`. Es lo único que sirve para hablar
  de contexto y costo.
- Si el principal no devuelve texto ni tool call → se deriva (principio 8).
- Reintento: 1, con backoff. Después, derivar.

---

## 4. Agenda — calendario propio (Google Calendar, en pausa)

**Hoy la agenda es propia**: los turnos viven solo en la tabla `turnos` y
`_shared/agenda/calendario_propio.ts` es un `Calendario` que no hace nada afuera.
Lo decidió Mateo el 15/9 (decisión #13 de `docs/decisiones-pendientes-fase1.md`):
primero que Lucía agende con la lógica del negocio, Calendar después.

Lo que sigue queda escrito **por si Calendar vuelve**, no es lo que corre:

**Google Calendar** (en pausa): un calendario por probador (3) o uno
solo con el probador como campo — decisión de `logica` en la fase 1; supuesto:
**un calendario "Otto Su Misura — Alquiler" con el probador en la descripción**,
que es lo que el equipo va a mirar desde el celular. Acceso por cuenta de servicio
con el calendario compartido. Cada turno de la base tiene su `google_event_id`;
mover o cancelar actualiza ambos.

**Disponibilidad** se calcula en código, no la adivina el modelo:

- Lun–Vie 10:00–19:00; Sáb 9:30–18:30 (horarios de OTTO BOT, vigentes). Corte de
  14 a 15 (un probador puede cortar 13–14).
- 3 probadores, turnos escalonados de a 15 min.
- Duraciones: graduado 45', novio 45', invitado 45', doble 1:30, triple 2:00,
  prueba final 15'.
- Fuera de horario laboral: **nunca**. El agente puede agendar a cualquier hora del
  día, pero solo en huecos laborales.
- Anticipación recomendada 60 a 7 días; se acepta hasta el mismo día si hay hueco
  (regla de la casa: nunca decir que no se puede).

**doyturnos** ❓: hoy los turnos viven ahí. No hay confirmación de que tenga API.
Supuesto de V1: **la base + Google Calendar son la fuente de verdad**; el equipo
deja de usar doyturnos para alquiler o lo replica a mano hasta que se confirme.
Si aparece una API, se agrega un adaptador en `_shared/agenda/doyturnos.ts` sin
tocar herramientas ni prompt.

---

## 5. WhatsApp Cloud API

- Webhook ya construido con Claude Code ✅. Falta: número nuevo verificado en Meta,
  plantillas aprobadas, token permanente en env.
- Plantillas a registrar (código puro las envía):
  - `recordatorio_turno_18h` — con botones "Confirmo" / "Necesito reprogramar".
  - `agradecimiento_resena` — post-devolución, con link a reseña de Google.
  - `recontacto_turno_pendiente` — consultó, no agendó (día siguiente y 72 hs).
- Ventana de 24 hs: fuera de ella solo se mandan plantillas. El código lo verifica
  antes de enviar texto libre.
- Firma `X-Hub-Signature-256` verificada en el webhook. Idempotencia por
  `wa_message_id` (test SQL obligatorio).

---

## 6. Panel — Next.js en Vercel

- Next.js App Router, TypeScript, Tailwind, shadcn/ui. Una carpeta por pestaña en
  `panel/app/(panel)/<pestaña>/`.
- Auth: Supabase Auth (email + contraseña). Registro abierto pero **el perfil nace
  como solicitud pendiente**; solo un admin la aprueba desde Configuración. Hasta
  entonces, RLS devuelve cero filas y la UI muestra "esperando aprobación".
- Service role key **solo** en route handlers del servidor (`panel/app/api/**`).
  Nunca en componentes cliente. El subagente de seguridad barre el bundle.
- Edición por el dueño: cada tabla editable tiene `version` y `editado_por`;
  cambios en prompt base, reglas y contexto regeneran `prompt.md` vía un route
  handler que corre `armar-prompt.mjs` y redespliega la función (o la función lee
  el prompt de Storage con caché de 60 s — decisión de `logica`, supuesto: Storage).

---

## 7. Variables de entorno

Nunca en el repo. `.env.example` sí, con los nombres y sin valores.

```
# Supabase
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # solo servidor

# OpenAI
OPENAI_API_KEY
LLM_PRINCIPAL
LLM_CLASIFICADOR
LLM_EXTRACTOR
LLM_ANALISTA

# WhatsApp
WA_PHONE_NUMBER_ID
WA_ACCESS_TOKEN
WA_VERIFY_TOKEN
WA_APP_SECRET                      # firma del webhook

# Google Calendar
GOOGLE_SERVICE_ACCOUNT_JSON        # base64
GOOGLE_CALENDAR_ID

# Negocio
NEGOCIO_TZ=America/Argentina/Cordoba
DERIVACION_ALQUILER_TEL            # a quién se avisa cuando Lucía deriva
# Los links (reseña, maps, catálogo) NO van acá: viven en la tabla `enlaces` y se
# editan desde Configuración › Enlaces. Los resuelve enlaceDeTipo().
```

---

## 8. Límites y costos a vigilar

- Edge Functions: timeout ~150 s; el turno del agente tiene que cerrar en < 25 s o
  derivar. Máximo 6 iteraciones de tool calling por turno.
- pg_cron cada 10 s para el worker está bien para el volumen de un local; si crece,
  se pasa a Supabase Queues o a un webhook que dispare el worker al encolar.
- Meta: plantillas fuera de ventana tienen costo por conversación; el
  `cron-recordatorios` agrupa y no reenvía si ya salió.
- OpenAI: el prompt cacheado es la mayor parte del costo fijo; medir en
  `consumo_llm` desde el primer día.
