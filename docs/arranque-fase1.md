# Arranque de Fase 1 — qué pegar en cada Claude Code

Son **3 Claude Code nuevos, uno por carpeta**. `logica` ya está andando en la sesión principal:
ese no se abre.

| Orden | Carpeta que abrís en VS Code | Prompt que pegás |
| --- | --- | --- |
| 1 | `otto-paneles` | **Prompt 1 — paneles** |
| 2 | `otto-agente-ia` | **Prompt 2 — agente** |
| 3 | `otto-front` | **Prompt 3 — front** |

Las tres carpetas están al lado de `otto-agente`, en `Automatizacion - Lucia`.

## Antes de pegar el prompt (una sola vez por carpeta)

Abrí la carpeta en VS Code y, en su terminal, corré estas líneas de a una:

```
npm install
cd panel
npm install
cd ..
node scripts/permiso.mjs docs/hitos
```

Después abrí un Claude Code parado en esa carpeta y pegá su prompt.

---

## Prompt 1 — paneles → carpeta `otto-paneles`

```
Sos el Claude Code de rol "paneles" del proyecto Lucía. Leé CLAUDE.md, TRABAJO.md, STACK.md (§ 2, 6 y 7), PROCESOS.md § 5, docs/informes/0-verificador.md y docs/decisiones-pendientes-fase1.md (la sección Resueltas). Tus hitos de Fase 1 ya están escritos y aprobados por Mateo: docs/hitos/1.8 a 1.10. No los reescribas: implementalos en orden, pero empezá por la migración de configuración de agenda de 1.9 (0012): logica la necesita para su hito 1.13. Tus migraciones van del 0011 al 0019. La base es la real y la comparten los cuatro roles: probá cada migración en una transacción con rollback antes de aplicarla. Para aplicarlas usá node + pg con SUPABASE_DB_URL, como tests/sql/run.mjs (no hay psql); no leas ni imprimas el .env. Cada hito se cierra solo cuando pasa su control, y ahí completás Evidencia. Commiteá en tu rama con prefijo "paneles:" y no hagas merge a main. Si el hook de territorio te frena, explicame por qué y esperá.
```

## Prompt 2 — agente → carpeta `otto-agente-ia`

```
Sos el Claude Code de rol "agente" del proyecto Lucía. Leé CLAUDE.md, TRABAJO.md, AGENTE.md, docs/ficha-del-negocio.md, docs/otto-bot-notas.md, plantilla-agente/02-prompt.md y docs/decisiones-pendientes-fase1.md (la sección Resueltas). Tus hitos de Fase 1 ya están escritos y aprobados por Mateo: docs/hitos/1.3 a 1.7. No los reescribas: implementalos en orden. Cada hito se cierra solo cuando pasa su control, y ahí completás Evidencia. En 1.3, mostrame el prompt generado completo y esperá mi ok antes de empezar 1.4. La regla más importante es la tabla de AGENTE.md § 2: nada determinístico lo resuelve el LLM. OPENAI_API_KEY todavía no está cargada: 1.7 espera. Commiteá en tu rama con prefijo "agente:" y no hagas merge a main. Si el hook de territorio te frena, explicame por qué y esperá.
```

## Prompt 3 — front → carpeta `otto-front`

```
Sos el Claude Code de rol "front" del proyecto Lucía. Leé CLAUDE.md, TRABAJO.md, DISENO.md, panel/README.md y docs/decisiones-pendientes-fase1.md (la sección Resueltas). Tus hitos de Fase 1 ya están escritos y aprobados por Mateo: docs/hitos/1.1-sistema-visual.md y docs/hitos/1.2-pestanas.md. No los reescribas: implementalos en orden. Cada hito se cierra solo cuando pasa su control, y ahí completás Evidencia. Para verificar logueado, pedile a Mateo el usuario admin de prueba y no lo escribas en ningún archivo (el repo es público). Commiteá en tu rama con prefijo "front:" y no hagas merge a main. Si el hook de territorio te frena, explicame por qué y esperá. Al cerrar los dos hitos, avisame.
```

---

## Qué te van a pedir

- **paneles:** nada tuyo para arrancar.
- **agente:** en el hito 1.3 te muestra las instrucciones completas de Lucía y espera tu ok.
  Más adelante (1.7) necesita la clave de OpenAI.
- **front:** el usuario admin de prueba, para entrar al panel. Dáselo por el chat, nunca en
  un archivo: el repo es público.

La versión anterior de este archivo, con los prompts de antes de escribir los hitos, quedó en
el historial de git (commit 8f8d184). Ya no se usa.
