# Arranque de Fase 1 — prompts ajustados a lo que ya existe

## Actualización 13/9 — hitos aprobados: prompts finales

Los hitos de Fase 1 ya están escritos y Mateo los aprobó (en `docs/hitos/` de cada rama). Los
prompts más viejos, más abajo, pedían escribirlos primero: eso ya no hace falta. `logica` sigue
en la sesión principal; estas son las otras tres.

En cada carpeta (`otto-front`, `otto-agente-ia`, `otto-paneles`), la primera vez:

1. En VS Code, abrí la carpeta y un Claude Code parado ahí.
2. En la terminal: `npm install` en la raíz y otra vez en `panel/`.
3. `node scripts/permiso.mjs docs/hitos` — `docs/hitos/` es de `logica`, y cada rol tiene que
   poder completar la Evidencia de sus propios hitos.
4. Pegá el prompt de su rol:

### front

```
Sos el Claude Code de rol "front" del proyecto Lucía. Leé CLAUDE.md, TRABAJO.md, DISENO.md, panel/README.md y docs/decisiones-pendientes-fase1.md (la sección Resueltas). Tus hitos de Fase 1 ya están escritos y aprobados por Mateo: docs/hitos/1.1-sistema-visual.md y docs/hitos/1.2-pestanas.md. No los reescribas: implementalos en orden. Cada hito se cierra solo cuando pasa su control, y ahí completás Evidencia. Para verificar logueado, pedile a Mateo el usuario admin de prueba y no lo escribas en ningún archivo (el repo es público). Commiteá en tu rama con prefijo "front:" y no hagas merge a main. Si el hook de territorio te frena, explicame por qué y esperá. Al cerrar los dos hitos, avisame.
```

### agente

```
Sos el Claude Code de rol "agente" del proyecto Lucía. Leé CLAUDE.md, TRABAJO.md, AGENTE.md, docs/ficha-del-negocio.md, docs/otto-bot-notas.md, plantilla-agente/02-prompt.md y docs/decisiones-pendientes-fase1.md (la sección Resueltas). Tus hitos de Fase 1 ya están escritos y aprobados por Mateo: docs/hitos/1.3 a 1.7. No los reescribas: implementalos en orden. Cada hito se cierra solo cuando pasa su control, y ahí completás Evidencia. En 1.3, mostrame el prompt generado completo y esperá mi ok antes de empezar 1.4. La regla más importante es la tabla de AGENTE.md § 2: nada determinístico lo resuelve el LLM. OPENAI_API_KEY todavía no está cargada: 1.7 espera. Commiteá en tu rama con prefijo "agente:" y no hagas merge a main. Si el hook de territorio te frena, explicame por qué y esperá.
```

### paneles

```
Sos el Claude Code de rol "paneles" del proyecto Lucía. Leé CLAUDE.md, TRABAJO.md, STACK.md (§ 2, 6 y 7), PROCESOS.md § 5, docs/informes/0-verificador.md y docs/decisiones-pendientes-fase1.md (la sección Resueltas). Tus hitos de Fase 1 ya están escritos y aprobados por Mateo: docs/hitos/1.8 a 1.10. No los reescribas: implementalos en orden, pero empezá por la migración de configuración de agenda de 1.9 (0012): logica la necesita para su hito 1.13. Tus migraciones van del 0011 al 0019. La base es la real y la comparten los cuatro roles: probá cada migración en una transacción con rollback antes de aplicarla. Para aplicarlas usá node + pg con SUPABASE_DB_URL, como tests/sql/run.mjs (no hay psql); no leas ni imprimas el .env. Cada hito se cierra solo cuando pasa su control, y ahí completás Evidencia. Commiteá en tu rama con prefijo "paneles:" y no hagas merge a main. Si el hook de territorio te frena, explicame por qué y esperá.
```

---

Lo que sigue es el arranque original, de antes de escribir los hitos. Queda como referencia.

Los prompts de `ARRANQUE.md` se escribieron antes de que existiera nada. Al
cerrar Fase 0 (12/9) ya había más hecho de lo que suponen, así que acá van
ajustados. Repo público: **nada de claves, emails ni contraseñas en este
archivo ni en los chats que se commiteen.**

## Estado al cerrar Fase 0

- Base real con las 10 migraciones, RLS probada, seeds de horarios/accesorios/
  reglas/contexto. `npm test` → 10/10. Informe: `docs/informes/0-verificador.md`.
- Panel: las 8 pestañas con mock (H1.1/H1.2, hechas antes de Fase 0) + Auth real
  (login, registro, `/esperando`, guarda en `middleware.ts`). Hay un admin de
  prueba creado — las credenciales las tiene Mateo, no están en el repo.
- **Leer antes de empezar, todos los roles:** `docs/decisiones-pendientes-fase1.md`.

## Antes de abrir cada Claude Code

Los cuatro worktrees ya están creados, cada uno con su `.claude/rol` y copias
locales de `.env` y `panel/.env.local` (gitignorados):

| Carpeta | Rama | Rol |
| --- | --- | --- |
| `../otto-front` | `front` | front |
| `../otto-agente-ia` | `agente` | agente |
| `../otto-paneles` | `paneles` | paneles |
| `../otto-logica` | `logica` | logica |

En cada uno, la primera vez: `npm install` en la raíz y en `panel/`
(`node_modules` no viaja con el worktree).

## Qué falta cargar y qué hito frena

| Dato | Frena | Dónde se consigue |
| --- | --- | --- |
| `OPENAI_API_KEY` | H1.7 (emulador, `agente`) | platform.openai.com |
| `WA_APP_SECRET` | H1.11 (firma del webhook, `logica`) | Meta → app "Agente Sofia" → Configuración → Básica |
| Cuenta de servicio de Google + `GOOGLE_CALENDAR_ID` | H1.12 (`logica`) | console.cloud.google.com |
| `LINK_RESENA_GOOGLE`, `DERIVACION_ALQUILER_TEL` | H1.14 (`logica`) | Mr Otto |

Ninguno frena el arranque: cada rol puede empezar por los hitos que no los necesitan.

## Cuántos abrir

- **`agente` y `paneles`: ahora.** Son los que tienen más trabajo nuevo.
- **`front`: liviano.** H1.1 y H1.2 ya están; le queda cerrar formalmente y lo
  que el canvas de diseño no trajo (abajo).
- **`logica`: H1.11–H1.14**, en `../otto-logica`. Puede esperar a tener
  `WA_APP_SECRET` para no arrancar H1.11 a medias.

---

## Prompt — `otto-agente-ia` (agente)

Pegar el de `ARRANQUE.md` § "Fase 1 — otto-agente-ia" y agregar al final:

```
Contexto de lo que ya existe (no lo rehagas):
- Las tablas ya están creadas en la base real (supabase/migrations/0001–0010). Usá esos nombres y enums tal cual: turnos.tipo (graduado/novio/invitado/doble/triple/prueba_final), turnos.estado en kebab-case (sin-confirmar/confirmado/alquilo/retiro/devolvio/con-aviso), fragmentos con FTS spanish+unaccent (columna `busqueda`).
- Las reglas ya están cargadas: supabase/seeds/reglas.sql (6 reglas; es tu territorio). La regla 4 se reformuló para no repetir el horario de corte: si las reescribís, ningún horario, precio ni duración en el texto (principio 2).
- supabase/functions/ no existe todavía: vos creás _shared/.
- Leé docs/decisiones-pendientes-fase1.md (sobre todo #3: el corte por probador no está en ninguna tabla).
- OPENAI_API_KEY todavía no está en .env: H1.3 a H1.6 no la necesitan; antes de H1.7 pedísela a Mateo.
```

## Prompt — `otto-paneles` (paneles)

Pegar el de `ARRANQUE.md` § "Fase 1 — otto-paneles" y agregar al final:

```
Contexto de lo que ya existe (no lo rehagas):
- Auth ya funciona: panel/lib/supabase/{client,server}.ts y panel/middleware.ts ahora son de tu territorio. Registro abierto → trigger manejar_alta_usuario() crea perfiles (pendiente) + solicitudes_acceso → /esperando. De H1.10 te falta: el route handler/queries para Configuración › Accesos (listar pendientes, aprobar, rechazar). La pantalla la maqueta front.
- El historial ya existe: toda tabla editable tiene version/editado_por/editado_at y el trigger historial_antes_de_editar() escribe en historial_ediciones. No crees tablas de historial nuevas; completá editado_por desde el route handler.
- Leé docs/informes/0-verificador.md § 5: faltan policies de UPDATE en storage.objects (H1.9, fotos), el middleware hoy responde 307 a /login también en /api/** (decidí en H1.8 si querés 401 JSON), y SUPABASE_SERVICE_ROLE_KEY ya está en panel/.env.local (solo en route handlers).
- Leé docs/decisiones-pendientes-fase1.md (#1 solapamiento de turnos y #2 estado con-aviso te tocan).
```

## Prompt — `otto-front` (front)

Este reemplaza al de `ARRANQUE.md` (H1.1 y H1.2 ya están implementados):

```
Sos el Claude Code de rol "front" del proyecto Lucía. Leé en este orden: CLAUDE.md, TRABAJO.md, DISENO.md, panel/README.md, docs/decisiones-pendientes-fase1.md. Tu territorio es panel/app, panel/components, panel/styles, panel/public y DISENO.md.

H1.1 (sistema visual) y H1.2 (las 8 pestañas con mock) ya están implementados, a partir del canvas de Claude Design. No los rehagas. Tu Fase 1:

1. Escribí los hitos 1.1 y 1.2 en docs/hitos/ (pedí permiso al hook) con su control y cerralos con evidencia real: abrí cada pantalla logueado (pedile a Mateo el usuario admin de prueba), desktop y mobile, consola limpia. Mostrámelos.
2. La pestaña "Estadísticas" es la Bitácora de DISENO.md § 7 (el canvas le cambió el nombre). CLAUDE.md, TRABAJO.md y PROCESOS.md la llaman Bitácora. Proponeme renombrarla (etiqueta y ruta /bitacora) o dejar el nombre, y esperá mi respuesta.
3. Sumá la subvista Bitácora › Propuestas (PROCESOS.md § 6) con mock: cada propuesta con Aplicar / Editar y aplicar / Descartar, y el estado "aplicada con alerta" en rojo.
4. Maquetá Configuración › Accesos (solicitudes pendientes con Aprobar/Rechazar) con mock: los datos los conecta paneles (H1.10).
5. Estados vacíos por pestaña con el componente EstadoVacio.

app/(auth)/login y app/(auth)/esperando ya tienen lógica real de Supabase Auth: si los tocás, que sea solo lo visual. El estado "con-aviso" de los turnos se discute con paneles/logica antes de tocarlo (decisiones pendientes #2).
```

## Prompt — `otto-logica` (logica)

Pegar el de `ARRANQUE.md` § "Fase 1 — otto-logica" y agregar al final:

```
Contexto de Fase 0:
- cola_tomar_uno(p_worker) devuelve setof cola_trabajos: cola vacía = cero filas. El worker chequea rows.length.
- El worker se dispara por trigger AFTER INSERT en cola_trabajos + un cron de 1 minuto de contención (docs/supuestos.md #17), no por poll de 10 s.
- Antes de H1.13 resolvé con Mateo docs/decisiones-pendientes-fase1.md #1 (EXCLUDE gist por probador) y #3 (corte por probador).
- WA_APP_SECRET y la cuenta de servicio de Google todavía no están en .env: pedilos antes de H1.11 y H1.12.
```
