# Integración de Fase 1 — rama `integracion` (14/9/2026)

Las cuatro ramas juntas sobre `main`, sin tocar `main`: `logica`, `agente`, `paneles` y `front`,
en ese orden, sin conflictos. Todo lo que sigue corrió en `otto-integracion`, contra la base
real, y no dejó datos de prueba. `main` recibe la integración recién al cerrar la fase, con el
verificador.

## Qué se corrió

| Qué | Cómo | Resultado |
| --- | --- | --- |
| Base: esquema, cola, RLS, 1.11 y 1.15 | `npm test` | todos verdes |
| Agenda (1.13), WhatsApp (1.11), herramientas (1.4) y barandillas (1.5) | `deno test --no-lock --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=.env supabase/functions/_shared/agenda supabase/functions/_shared/whatsapp tests/herramientas tests/barandillas` | 140/140 |
| Tipos de todas las Edge Functions y de `_shared` | `deno check` sobre `supabase/functions/**/*.ts` | limpio |
| Generador del prompt (1.3) | `node scripts/armar-prompt.mjs --solo-validar` | válido: 247 líneas, 15 reglas |
| Pruebas del generador | `node scripts/probar-prompt.js` | 45/45 |
| Búsqueda como cliente (1.6) | `node scripts/probar-busqueda.js` | 48/48 en el primer resultado |
| Panel | `npm run typecheck` y `npm run build` en `panel/` | limpios |
| Panel por HTTP contra la base (1.8, 1.9 y 1.10) | arnés de `paneles`, adaptado a esta rama | 147/147, limpieza verificada |

## Lo que se probó recién al juntar

- **H1.9, control 4** (pendiente desde el 13/9): el handler del prompt base con el generador
  real de `agente` detrás, en vez del doble. Pasa, y 1.9 queda cerrado. Para correrlo, el arnés
  cambió en tres cosas: las rutas de esta rama; el caso "sin generador" apunta a un generador que
  no existe, para seguir probando el 503; y el control 4 usa la plantilla real de Lucía, porque
  el generador real exige el encabezado de las reglas y el texto de prueba del doble no lo tenía.
- **La agenda real (1.13) detrás de `buscar_horarios` y `agendar_turno`**: ya estaba probada en
  las ramas `logica` y `agente` (`huecos_base.test.ts`, `agenda_real.test.ts`); acá corre junto con
  todo lo demás.

## Lo que falta para cerrar Fase 1 (depende de afuera)

| Hito | Falta | Quién |
| --- | --- | --- |
| 1.7 emulador y guiones | la clave de OpenAI | Mateo |
| 1.11 control 6 (mensaje real por Meta) | App Secret de Meta y el ok para cambiar la URL del webhook | Mateo |
| 1.12 Google Calendar | cuenta de servicio de Google y calendario | Mr Otto |
| 1.14 recordatorios y crons | aprobación de las plantillas (Mateo y después Meta) y el link de reseñas de Google | Mateo, Meta, Mr Otto |

Propuesta de `logica`: pasar 1.12 y 1.14 a Fase 2. Dependen de terceros (una cuenta de Google y
días de aprobación de Meta) y no bloquean lo demás.

## Observaciones

- El arnés HTTP de `paneles` vive en la carpeta temporal de su sesión, no en el repo. Si esa
  carpeta se borra se pierden 147 aserciones: conviene sumarlo al repo.
- Next avisa que `middleware` pasa a llamarse `proxy`. No bloquea; queda para cuando `paneles`
  toque el middleware.
