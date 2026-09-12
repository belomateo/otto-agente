# ARRANQUE.md — Cómo poner esto en marcha

Para Mateo. Cinco pasos, después cuatro prompts para pegar.

---

## 1. Repo

```powershell
# desde la carpeta donde descomprimiste otto-agente/
cd otto-agente
git init
git add .
git commit -m "logica: cimientos del proyecto (docs, hooks, plantillas)"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/otto-agente.git
git push -u origin main
```

Confirmá que **no** se subió nada de `.env`, `.claude/rol` ni
`permisos-sesion.txt` (están en `.gitignore`).

## 2. Credenciales

Copiá `.env.example` a `.env` (raíz) y a `panel/.env.local` cuando exista el
panel. Completá lo que ya tenés (OpenAI, WhatsApp). Supabase y Google Calendar
se completan en la Fase 0.

## 3. Worktrees — uno por Claude Code

```powershell
git branch front; git branch agente; git branch paneles; git branch logica
git worktree add ../otto-front front
git worktree add ../otto-agente-ia agente
git worktree add ../otto-paneles paneles
git worktree add ../otto-logica logica

# el rol de cada worktree (no se commitea)
Set-Content ../otto-front/.claude/rol front
Set-Content ../otto-agente-ia/.claude/rol agente
Set-Content ../otto-paneles/.claude/rol paneles
Set-Content ../otto-logica/.claude/rol logica
```

En VS Code: **File › Add Folder to Workspace** con las cuatro carpetas, y abrí
una terminal de Claude Code en cada una (`claude` parado en la carpeta).

## 4. Orden

**Primero solo `logica` corre la Fase 0** (medio día). Recién cuando cierra,
abrís los otros tres y corren la Fase 1 en paralelo. Si abrís los cuatro de
entrada, `front` y `paneles` no tienen ni Supabase ni el esqueleto del panel
donde trabajar.

## 5. Cuando el hook frena a un Claude Code

Va a aparecer un `⛔ TERRITORIO: …`. Leé por qué lo necesita. Si tiene sentido:

```
node scripts/permiso.mjs <ruta que pidió>
```

y le decís que vuelva a intentar. Si no tiene sentido, le decís que use mock o
que lo deje para la Fase 2.

---

## Prompts para pegar

### Fase 0 — `otto-logica`

```
Sos el Claude Code de rol "logica" del proyecto Lucía (agente de WhatsApp de Otto Su Misura). Leé en este orden: CLAUDE.md, TRABAJO.md, STACK.md, PROCESOS.md, docs/ficha-del-negocio.md. No leas AGENTE.md ni DISENO.md ahora.

Tu tarea es la Fase 0 completa (TRABAJO.md § 2). Antes de escribir código, decime qué necesitás de mí (crear el proyecto en Supabase, la cuenta de servicio de Google, valores de env) y esperá. Después:

1. Escribí cada hito de la fase en docs/hitos/ con la plantilla de docs/hitos/PLANTILLA.md, con su control, y mostrámelos antes de empezar.
2. Migraciones 0001–0010 según STACK.md § 2, seeds del primer admin y de horarios (docs/ficha-del-negocio.md § Agenda).
3. Esqueleto de panel/ con Supabase Auth, layout de 8 pestañas vacías y solicitudes de acceso.
4. package.json raíz con `npm test` que corre tests/sql con transacción y rollback.
5. Control de la fase: el test SQL de idempotencia, cola y RLS verde; `deno check` y `next build` limpios.

Al terminar, invocá al subagente "verificador" sobre la fase, guardá su informe en docs/informes/ y mostrámelo. No hagas merge a main hasta que yo lo apruebe.

Reglas: principios de CLAUDE.md § 2 sin excepción. Ningún número de negocio en código. Todo supuesto va a docs/supuestos.md. Si el hook de territorio te frena, explicame por qué y esperá.
```

### Fase 1 — `otto-agente-ia`

```
Sos el Claude Code de rol "agente" del proyecto Lucía. Leé en este orden: CLAUDE.md, TRABAJO.md, AGENTE.md, docs/ficha-del-negocio.md, docs/otto-bot-notas.md, plantilla-agente/02-prompt.md. No toques nada de panel/ ni del pipeline: eso es de otros roles y el hook te va a frenar.

Tu tarea son los hitos H1.3 a H1.7 de TRABAJO.md § 2. Primero escribí cada hito en docs/hitos/ (pedí permiso al hook si hace falta) y mostrámelos.

Orden obligatorio:
1. H1.3: completá la plantilla con la ficha y AGENTE.md, escribí scripts/armar-prompt.mjs (normaliza CRLF, saca comentarios HTML, falla si queda {{ o [[, valida ≤ 300 líneas, reglas numeradas, nombre en la primera línea). MOSTRAME EL PROMPT GENERADO COMPLETO antes de seguir y esperá mi ok.
2. H1.4: las herramientas de AGENTE.md § 4, un archivo cada una en supabase/functions/_shared/herramientas/, schema + descripción + precondiciones en código + un test por cada rechazo. Los enums tienen que coincidir con la tabla y con el índice del prompt.
3. H1.5: barandillas de AGENTE.md § 6, un archivo cada una, con test que dispara y test que NO dispara.
4. H1.6: fragmentos de AGENTE.md § 8 en supabase/seeds/fragmentos.sql, con el texto sacado de la ficha. Los guiones de objeciones armalos desde el ancla de valor. Control: cada fragmento se encuentra escribiendo como un cliente (sin tildes, con errores).
5. H1.7: la función probar-agente (emulador, modo dry-run para Calendar) y los 14 guiones de AGENTE.md § 13 en scripts/probar-turno.js.

Al terminar, invocá al subagente "tester" en MODO AGENTE, guardá el informe y mostrámelo. Distinguí falla del agente de falla del dato.

La regla más importante es la tabla de AGENTE.md § 2: nada determinístico se resuelve con el LLM. Lucía nunca decide un hecho.
```

### Fase 1 — `otto-front`

```
Sos el Claude Code de rol "front" del proyecto Lucía. Leé en este orden: CLAUDE.md, TRABAJO.md, DISENO.md. No leas AGENTE.md ni STACK.md salvo la sección 6 de STACK.md (panel). Tu territorio es panel/app, panel/components, panel/styles y DISENO.md; el hook te frena fuera de eso.

Tu tarea son los hitos H1.1 y H1.2 de TRABAJO.md § 2. Primero escribí los hitos en docs/hitos/ (pedí permiso al hook) y mostrámelos.

1. H1.1: sistema visual según DISENO.md — tokens en Tailwind (paleta, tipografía, espaciados), componentes base con shadcn/ui: chip de estado, ficha de cliente compacta, bloque desplegable de bitácora con mini resumen al costado, editor con Guardar/Deshacer/Versión anterior, estado vacío.
2. H1.2: las 8 pestañas de DISENO.md maquetadas con DATOS MOCK en panel/app/(panel)/<pestaña>/. Cada pestaña es una pantalla completa: se ve bien en desktop y en mobile (barra inferior con Bandeja · Atención humana · Turnos · Más). Nada de datos reales todavía: eso es Fase 2.

Control de cada hito: abrís cada pantalla en el navegador, logueado, y la consola está limpia. Un build que compila puede dibujar una página en blanco; verificá abriendo, no con grep.

Si yo te paso un archivo de Claude Design con tokens y pantallas, seguilo; si no, seguí la sección Identidad de DISENO.md. Lo que el dueño puede editar tiene que verse editable; lo que no, no se ve.
```

### Fase 1 — `otto-paneles`

```
Sos el Claude Code de rol "paneles" del proyecto Lucía. Leé en este orden: CLAUDE.md, TRABAJO.md, STACK.md (§ 2, 6 y 7), PROCESOS.md § 5, docs/ficha-del-negocio.md. Tu territorio es panel/lib, panel/app/api, las migraciones de negocio/turnos/auth y los seeds de catálogo y horarios; el hook te frena fuera de eso.

Tu tarea son los hitos H1.8 a H1.10 de TRABAJO.md § 2. Primero escribí los hitos en docs/hitos/ (pedí permiso al hook) y mostrámelos.

1. H1.8: queries tipadas y route handlers por pestaña. La service role key SOLO en route handlers del servidor. Nunca en un componente cliente.
2. H1.9: la edición del dueño de PROCESOS.md § 5, completa: fichas de cliente, horarios, precios, fragmentos, fotos (Storage), reglas, contexto, prompt base (el route handler corre scripts/armar-prompt.mjs y RECHAZA si no pasa), herramientas (switch + descripción) y notas. Toda tabla editable con version, editado_por, editado_at y fila de historial. Botón "volver a la versión anterior" funcional.
3. H1.10: solicitudes de acceso: registro abierto, perfil nace pendiente, solo admin aprueba desde Configuración › Accesos; hasta entonces RLS devuelve cero filas.

Los componentes visuales los hace "front" con mock; vos hacés los datos. En Fase 2 se conectan. Si necesitás un componente que no existe, usá uno mínimo en panel/lib/mock-ui y anotalo para Fase 2.

Control: typecheck y build limpios; cada edición deja historial; un usuario no aprobado ve cero datos (probalo con dos cuentas).
```

### Fase 1 — `otto-logica`

```
Seguís siendo el rol "logica". Fase 1: hitos H1.11 a H1.14 de TRABAJO.md § 2. Escribí los hitos en docs/hitos/ y mostrámelos.

1. H1.11: webhook-whatsapp (firma, dedup, encolar, 200 en < 1 s) → cola → worker con un agente STUB que contesta "recibido" (el agente real lo hace otro rol; se conecta en Fase 2). Un mensaje de prueba entra y sale por Meta.
2. H1.12: Google Calendar en _shared/agenda/: crear, mover, cancelar, con google_event_id en turnos, y reintento por cron si falla.
3. H1.13: cálculo de huecos por probador y duración con el horario laboral en tablas y las reglas en código (STACK.md § 4). Tests de bordes: corte 14–15, sábado, mismo día, fuera de horario, tres probadores escalonados.
4. H1.14: crons de PROCESOS.md § 2: recordatorio 24 hs con plantilla y botones, confirmación SOLO al recibir el botón (código puro), post-devolución, recontacto día siguiente y 72 hs. Cada uno con test de "no reenvía si ya salió".

Control: deno check limpio; evento visible en el Calendar; tests verdes.

Cuando los otros tres roles cierren sus hitos, vos liderás la Fase 2 (conexión), en el orden de TRABAJO.md. Antes de cualquier deploy: tester modo repo → verificador → seguridad, y me mostrás los tres informes.
```

---

## Qué hacer con Claude Design

Pegá `DISENO.md` entero + logo + paleta + capturas del Instagram. Pedile las
pantallas desktop y mobile de las 8 pestañas y la exportación de tokens. Lo que
devuelva se lo pasás al Claude Code `front` antes de H1.1.
