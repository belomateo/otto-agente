# TRABAJO.md — Cómo se trabaja este proyecto

Leelo al abrir cualquier sesión de Claude Code. Acá está la regla de las
pestañas, la división en fases e hitos, cómo corren en paralelo cuatro Claude
Codes sin pisarse, y el hook que avisa cuando uno entra en territorio ajeno.

---

## 1. La lógica que ordena todo: pestañas primero, conexión al final

El sistema se piensa como **pestañas o paneles independientes**. Cada pestaña
se construye completa —pantalla, datos, edición, tests— como si fuera lo único
que existe, con **datos mock** donde todavía no hay conexión. La **conexión
entre partes** (que el turno agendado por Lucía aparezca en Turnos, que editar
un fragmento cambie lo que Lucía contesta, que una derivación caiga en Atención
humana) se deja para **una sola fase final**.

Por qué: conectar de a poco mezcla bugs de tres lugares en uno. Con cada pieza
probada sola, la fase de conexión es cablear cosas que ya funcionan.

Lo mismo aplica adentro del agente: el prompt principal es un `.md` del sistema
que **consulta siempre** las fichas de información (fragmentos, catálogo,
horarios) por herramientas; nunca las tiene adentro. Y la bitácora de lo que
pensó Lucía se programa como pieza aparte con su tabla y su pantalla.

---

## 2. Fases

Cada fase tiene hitos que corren en paralelo entre los cuatro Claude Codes. Una
fase cierra cuando todos sus hitos pasaron su control y el **verificador**
reportó apto.

### Fase 0 — Cimientos (secuencial, la hace `logica`, medio día)

- Proyecto Supabase nuevo, `.env.example`, `.gitattributes` con `eol=lf`.
- Migraciones 0001–0010 de `STACK.md` § 2 y seed del primer admin.
- Hooks de territorio (§ 4) y `.claude/agents/`.
- Esqueleto de `panel/` con auth y layout de pestañas vacías.
- **Control:** test SQL en transacción con rollback que verifica idempotencia del
  webhook, cola (dos workers no toman el mismo trabajo) y RLS (anon y usuario sin
  perfil ven cero filas). `deno check` y `next build` limpios.

### Fase 1 — Cada pieza sola (paralelo)

| Claude Code | Hitos | Control |
| --- | --- | --- |
| `front` | H1.1 Sistema visual (tokens, tipografía, componentes base). H1.2 Cada pestaña maquetada con mock: Bandeja, Atención humana, Turnos, Clientes, Conocimiento, Catálogo, Bitácora, Configuración. | Cada pantalla abierta en el navegador, consola limpia, se ve bien en mobile |
| `agente` | H1.3 Análisis de la ficha → `prompt.md` vía `armar-prompt.mjs`. H1.4 Herramientas con schema + precondiciones + tests. H1.5 Barandillas con test doble. H1.6 Fragmentos cargados de la ficha. H1.7 Emulador `probar-agente` + 14 guiones. | Generador limpio, ≤ 300 líneas, **prompt mostrado a Mateo**. Cada rechazo de herramienta con test. Cada barandilla con test que dispara y test que no. Cada fragmento se encuentra escribiendo como cliente. Guiones corren contra el emulador y se verifican contra la base |
| `paneles` | H1.8 Queries y route handlers por pestaña. H1.9 Edición del dueño: fichas, horarios, precios, fragmentos, fotos, reglas, contexto, prompt base, herramientas, notas — con `version` e historial. H1.10 Solicitudes de acceso y aprobación por admin. | Typecheck y build limpios. Cada edición deja fila de historial. Un usuario no aprobado ve cero datos |
| `logica` | H1.11 Webhook → cola → worker con agente stub. H1.12 Google Calendar: crear, mover, cancelar. H1.13 Cálculo de huecos por probador y duración, con horario laboral en código. H1.14 Crons: recordatorio 24 hs, confirmación por botón, post-devolución, recontacto. | Mensaje de prueba entra y sale por Meta. Evento aparece en el Calendar. Tests de huecos (bordes: 14–15, sábado, mismo día, fuera de horario). Cada cron con test de "no reenvía si ya salió" |

### Fase 2 — Conexión (una sola fase, la lidera `logica`, los otros asisten)

- Panel lee datos reales en vez de mock (pestaña por pestaña, en este orden:
  Conocimiento → Catálogo → Turnos → Bandeja → Atención humana → Clientes →
  Bitácora → Configuración).
- Editar en el panel cambia lo que Lucía usa (regeneración del prompt, fragmentos
  activos, catálogo).
- Derivar desde Lucía cae en Atención humana; "devolver a Lucía" reactiva.
- Turno de Lucía → base + Calendar → pestaña Turnos → recordatorio → confirmación.
- **Control:** los 14 guiones corren de punta a punta con el worker real (no el
  emulador) y todo se verifica en la base y en el Calendar. Tester modo agente
  apto.

### Fase 3 — Lanzamiento

- Tester (repo) → verificador → seguridad → deploy. Sin saltearse ninguno.
- Número nuevo verificado, plantillas aprobadas por Meta, token permanente.
- Primer admin real, carga de fotos y links por el dueño.
- Una semana con Lucía **en modo sombra** (responde al emulador con mensajes
  reales copiados, no al cliente) revisando bitácora. Recién después, en vivo.

### Después — Mejora continua

Ver `PROCESOS.md` § 6. Ninguna mejora entra sin pasar por tester modo agente.

---

## 3. Anatomía de un hito

Todo hito se escribe igual, en `docs/hitos/<fase>.<n>-<nombre>.md`:

```
Hito: <nombre>            Claude Code: <rol>          Fase: <n>
Toca: <archivos/carpetas>
Depende de: <hitos o "nada">
Control: <cómo se demuestra que está terminado, verificable por otro>
Evidencia: <se completa al cerrar: capturas, filas, salida de tests>
Supuestos: <lo que se asumió, va también a docs/supuestos.md>
```

Un hito sin control escrito no se empieza. Un hito con control que no pasó no
se cierra ni "casi".

---

## 4. Cuatro Claude Codes en paralelo y el hook de territorio

### Setup

Cada sesión de Claude Code se abre en su **branch** (`front`, `agente`,
`paneles`, `logica`) sobre un **git worktree** propio (`../otto-front`,
`../otto-agente-ia`, `../otto-paneles`, `../otto-logica`), así los cambios no se
mezclan en el disco. En cada worktree se crea el archivo **`.claude/rol`** con
una sola palabra (el rol). Ese archivo no se commitea. Los comandos exactos y el
prompt inicial de cada sesión están en `ARRANQUE.md`.

### El hook

`.claude/hooks/territorio.mjs` (Node, sin dependencias, anda en Windows) corre
como **PreToolUse** sobre `Edit`, `Write` y `MultiEdit`. Lee el rol de
`.claude/rol`, la ruta del archivo que Claude quiere tocar, y la compara con
`.claude/hooks/territorios.json`:

- Adentro del territorio del rol: deja pasar, silencioso.
- Afuera: **bloquea** (código 2) y Claude Code le muestra a Mateo:
  `⛔ TERRITORIO: el rol "agente" quiere editar "panel/app/page.tsx", que es de
  "front". Explicale a Mateo por qué lo necesitás. Si acepta, que escriba:
  permiso panel/app/page.tsx`
- Mateo habilita con `node scripts/permiso.mjs <ruta>` (o le dice a Claude que
  lo corra). Queda en `.claude/permisos-sesion.txt` (no se commitea) y vale para
  el resto de la sesión.
- Archivos compartidos (`CLAUDE.md`, `docs/ficha-del-negocio.md`,
  `docs/supuestos.md`, los hooks): bloquea para todos los roles, siempre.

`territorios.json` es la **fuente de verdad** de los territorios; la tabla de
`CLAUDE.md` § 4 es una copia legible. Si cambia uno, cambia el otro.

### Además del hook

- Cada Claude Code hace commit en su branch con prefijo `<rol>:` en el mensaje.
- Merge a `main` solo al cerrar una fase, después del verificador.
- Si dos roles necesitan cambiar el mismo archivo en la misma fase, es señal de
  que el archivo está mal partido: se parte antes, no se comparte.

---

## 5. Convenciones

- Español rioplatense en código de dominio, comentarios, tablas y mensajes de
  commit. Inglés solo en lo que la librería impone.
- Nombres de tablas y columnas en `snake_case` sin tildes. Los enums en `kebab`
  para secciones (`que-incluye`) y `snake` para estados (`pendiente_confirmacion`).
- Un archivo por herramienta, por barandilla, por cron, por pestaña.
- Todo dato que el dueño pueda editar tiene `version`, `editado_por`, `editado_at`
  y una fila de historial.
- Ningún número de negocio en el código: precios, duraciones, horarios y textos
  de plantilla salen de tablas. Lo único en código son las **reglas** sobre esos
  datos.
- Tests: `tests/sql/` (transacción + rollback), `tests/herramientas/`,
  `tests/barandillas/`, `scripts/probar-turno.js` (guiones). Se corren con un
  solo `npm test`.

---

## 6. Qué hacer cuando algo choca

- **Dos hitos se necesitan mutuamente** → uno de los dos usa mock y el otro
  avanza; la dependencia real se resuelve en Fase 2.
- **El hook bloqueó y de verdad hace falta** → pedir permiso, hacer el cambio
  mínimo, avisar en el chat del otro rol qué se tocó.
- **Un control no pasa** → no se cierra el hito. Se anota qué falló en el
  archivo del hito y se sigue con otro.
- **Falta un dato del negocio** → supuesto por defecto + fila en
  `docs/supuestos.md`; nunca se frena una fase por un dato que se puede cargar
  después desde el panel.
