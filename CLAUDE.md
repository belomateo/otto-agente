# CLAUDE.md — Lucía, agente de WhatsApp de Otto Su Misura

Este archivo lo lee cada Claude Code al abrir el repo. Es el contrato del proyecto:
qué se construye, cómo se divide el trabajo, qué no se negocia y quién controla.
Los detalles viven en los otros .md: leélos cuando llegues a su paso, no todos al
principio.

| Archivo | Qué tiene | Cuándo leerlo |
| --- | --- | --- |
| `STACK.md` | Herramientas, servicios, variables de entorno, límites | Antes de tocar infra o integraciones |
| `AGENTE.md` | Todo lo que pasa adentro de Lucía y alrededor | Antes de tocar prompt, herramientas, barandillas o subagentes LLM |
| `TRABAJO.md` | Cómo se divide el trabajo entre Claude Codes, fases, hitos, hooks | Al empezar cualquier sesión |
| `PROCESOS.md` | Paso a paso de cada proceso del sistema y mejora continua | Al implementar un flujo o un cron |
| `DISENO.md` | Brief visual para Claude Design | Solo el Claude Code de Front |
| `ARRANQUE.md` | Pasos y prompts para abrir los cuatro Claude Codes | Mateo, antes de empezar |
| `docs/ficha-del-negocio.md` | La ficha respondida por Mr Otto (datos del negocio) | Siempre que necesites un dato del negocio |

---

## 1. Qué es esto

Un agente de WhatsApp llamado **Lucía** que atiende el número nuevo de alquiler de
trajes de **Otto Su Misura** (Mr Otto, España 764, Rosario). Conversa con clientes
reales, descubre qué necesitan, ancla el valor de la casa y concreta **un turno
agendado** en el local. Al lado, un **panel web** para que el equipo vea las
charlas, los turnos, la ficha de cada cliente y edite todo lo que el agente sabe.

### Alcance de la V1 (lo único que se construye ahora)

- Canal: **solo alquiler**. Un número de WhatsApp nuevo. Venta online y corporativo
  quedan para fases posteriores con el mismo motor y otra ficha.
- Conversión: **turno agendado**. No cobra, no manda links de pago, no presupuesta.
- El turno se escribe en la base y en **Google Calendar**; el panel muestra el
  calendario. (doyturnos: ver supuesto en `STACK.md` § 4.)
- Recordatorio + plantilla de confirmación **24 hs antes** del turno, en código.
- Post-devolución: agradecimiento y pedido de reseña de Google, en código.
- Panel con pestañas: Bandeja, Atención humana, Turnos, Clientes, Conocimiento,
  Catálogo, Bitácora, Configuración.

### Lo que NO está en la V1

Presupuestos por WhatsApp, "Alugable", cobro, integración con DUX, envíos, venta
online, pedidos corporativos (se derivan), alquiler fuera de Rosario.

---

## 2. Principios que no se negocian

Cada uno viene de un error que ya pasó en producción en sistemas como este.

1. **Determinístico en código, LLM solo para lo no determinístico.** Todo lo que
   puede salir 100% bien sin interpretar (horarios laborales, validación de un
   turno, confirmación 24 hs, recordatorios, cálculo de fechas, formato de
   plantillas, marcar "confirmado") es código. El LLM entiende intención, redacta y
   decide qué herramienta llamar. Nunca decide un hecho.
2. **El prompt solo tiene lo que sirve para cualquier mensaje.** Precios, horarios,
   modelos, políticas, links y fotos viven en la base y se consultan con
   herramientas. Un precio en el prompt es un precio viejo el día que cambie.
3. **El prompt es un archivo versionado** (`supabase/functions/_shared/prompt.md`),
   generado por `scripts/armar-prompt.mjs`. El dueño lo edita desde el panel; el
   panel escribe el archivo fuente y regenera. Nada que cambie turno a turno entra
   ahí (rompe el caché del prefijo).
4. **Lo que el agente tiene que saber siempre se inyecta en el turno**: la libreta
   del cliente, su ficha, sus turnos. Si saberlo cuesta una llamada, a veces no se
   hace.
5. **Escribir la memoria es una herramienta**, y se usa en el mismo turno en que se
   entera.
6. **Nada que toque el mundo real se ejecuta sin validar en código** lo que el
   modelo mandó. Un turno fuera de horario de Mr Otto se rechaza en código aunque
   el modelo lo haya pedido.
7. **Derivar corta el turno.** Nunca se anuncia un pase sin ejecutarlo, y nunca se
   pregunta algo en el mismo mensaje en que se deriva.
8. **Quedarse sin respuesta no es un final válido.** Sin texto del modelo, se
   deriva.
9. **La verdad es lo que quedó en la base**, no lo que el agente dijo.
10. **Falla del agente no es falla del dato.** Si contestó mal porque el dato no
    está cargado, se carga el dato; no se toca el prompt.
11. **Nunca decir "no" a secas.** Regla de la casa: se dice que no ofreciendo lo que
    sí hay (ficha, § Identidad).
12. **El dueño edita sin programador.** Fichas, horarios, precios, fragmentos,
    fotos, reglas, contexto, prompt base, herramientas (activar/desactivar y
    descripción) y notas: todo desde el panel, con historial.

---

## 3. Estructura del repo

```
otto-agente/
├── CLAUDE.md  STACK.md  AGENTE.md  TRABAJO.md  PROCESOS.md  DISENO.md
├── docs/
│   ├── ficha-del-negocio.md        # la ficha respondida (dato, no prompt)
│   ├── supuestos.md                # lo que se asumió por lo que faltaba
│   └── informes/                   # informes de subagentes por fase
├── .claude/
│   ├── agents/                     # verificador.md · seguridad.md · tester.md
│   ├── hooks/territorio.sh         # ver TRABAJO.md § 4
│   └── settings.json
├── supabase/
│   ├── migrations/                 # esquema, cola, RLS, storage, cron, fragmentos
│   ├── seeds/                      # fragmentos, catálogo, horarios, reglas
│   └── functions/
│       ├── _shared/                # prompt.md · herramientas · barandillas · cliente LLM
│       ├── webhook-whatsapp/       # recibe, dedup, encola
│       ├── worker/                 # toma de la cola, corre el turno
│       ├── cron/                   # recordatorios, confirmación, agradecimiento, analista
│       └── probar-agente/          # emulador: mismo agente sin Meta
├── panel/                          # Next.js — una carpeta por pestaña en app/
├── scripts/
│   ├── armar-prompt.mjs
│   ├── probar-turno.js             # guiones contra el emulador
│   └── probar-basicas.js
└── tests/                          # SQL con rollback, barandillas, herramientas
```

---

## 4. Los cuatro Claude Codes y sus territorios

Mateo abre cuatro sesiones de Claude Code en paralelo desde VS Code. Cada una tiene
un rol y un territorio de archivos. Un hook avisa y pide permiso cuando una sesión
toca archivos de otra (detalle en `TRABAJO.md` § 4).

| Rol (`CLAUDE_ROL`) | Territorio | Qué hace |
| --- | --- | --- |
| `front` | `panel/app/**`, `panel/components/**`, `panel/styles/**`, `DISENO.md` | Estética, componentes, cada pestaña como pantalla aislada con datos mock |
| `agente` | `supabase/functions/_shared/**`, `supabase/seeds/fragmentos*`, `scripts/armar-prompt.mjs`, `scripts/probar-*.js`, `AGENTE.md` | Prompt, herramientas, barandillas, subagentes LLM, emulador, guiones |
| `paneles` | `panel/lib/**`, `panel/app/api/**`, `supabase/migrations/**` (tablas de negocio) | Datos reales de cada pestaña, queries, edición por el dueño, auth y solicitudes de acceso |
| `logica` | `supabase/functions/webhook-whatsapp/**`, `worker/**`, `cron/**`, `supabase/migrations/**` (cola, RLS, cron), Google Calendar, `STACK.md`, `PROCESOS.md` | Pipeline, integraciones, crons, conexión entre partes (fase final) |

Compartidos (cualquiera puede leer, el hook bloquea la edición para todos): `CLAUDE.md`,
`ARRANQUE.md`, `docs/ficha-del-negocio.md`, `docs/supuestos.md`, `.claude/hooks/**`.
La fuente de verdad de los territorios es `.claude/hooks/territorios.json`.

---

## 5. Subagentes de código

Tres subagentes de Claude Code, definidos en `.claude/agents/`. Cada uno con el
modelo acorde a su tarea. **Reportan al Claude Code principal que los invocó**;
no le hablan a Mateo directo. El informe se guarda en `docs/informes/<fase>-<agente>.md`.

| Subagente | Modelo | Cuándo corre | Qué hace | Permisos |
| --- | --- | --- | --- | --- |
| **verificador** | opus | Al **cierre de cada fase**, una vez por fase | Revisa el código de la fase como si no conociera la historia: compila, lógica, código muerto, errores no manejados, dependencias, rendimiento evidente. Corrige lo que puede. | Read, Edit, Write, Bash, Grep, Glob |
| **seguridad** | opus | **Solo antes de deploy** a producción | Credenciales expuestas, env vars faltantes, separación cliente/servidor, headers, endpoints sin validación, RLS, dependencias vulnerables, bundle del panel sin secretos. Corrige lo que puede. | Read, Edit, Write, Bash, Grep, Glob |
| **tester** | sonnet | **Modo agente:** cada vez que se toca prompt, fragmentos, herramientas o barandillas. **Modo repo:** antes de cada push a GitHub | Modo agente: corre los guiones contra el emulador y verifica contra la base, no contra lo que dijo Lucía. Modo repo: build, typecheck, tests, secretos en el front, `.env` fuera del repo. | Read, Bash, Grep, Glob, Write (solo informes) |

Orden obligatorio antes de un deploy: **tester (repo) → verificador → seguridad →
deploy**. Ninguno se saltea. Si uno devuelve "no apto", no se sigue.

Qué los diferencia para que no se pisen: el **tester** confirma que el sistema
*hace lo que dice* (outputs, base, build); el **verificador** confirma que el
código *está bien hecho*; **seguridad** confirma que *no se puede atacar*.

---

## 6. Controles de cada paso

Ningún hito se cierra sin su control (lista completa en `TRABAJO.md` § 3). Los que
más se olvidan:

- El generador del prompt corre limpio, sin `{{` ni `[[`, cuerpo ≤ 300 líneas,
  reglas numeradas, el nombre sale de la primera línea. **Mostrar el prompt al
  usuario antes de seguir.**
- Cada fragmento de conocimiento se encuentra con `buscar_informacion` usando las
  palabras de un cliente: sin tildes, con errores, sin las palabras del título.
- Cada herramienta de acción rechaza en código lo que no cumple sus precondiciones,
  con un test por cada rechazo.
- Cada barandilla tiene un test que la dispara y otro que confirma que NO se
  dispara en el caso parecido.
- Cada pantalla del panel se abre en el navegador, logueado, y se mira la consola.
  Un build que compila puede dibujar una página en blanco.
- Cada guion de prueba se lee entero y se verifica contra la base.

---

## 7. Trampas conocidas de este stack

- **Finales de línea.** Windows deja CRLF. Todo archivo que sea *dato* (prompt,
  seeds) se normaliza al leerlo (`.replace(/\r\n?/g, "\n")`) y va con `eol=lf` en
  `.gitattributes`.
- **Heredocs y backslashes.** Para editar código usá la herramienta de edición, no
  regex en el shell.
- **Tipos de Supabase**: no se regeneran a lo bruto si hay vistas tipadas a mano.
  Agregá solo lo que cambió.
- **Verificá abriendo la página**, no con grep sobre el bundle.
- **El registro de migraciones puede mentir.** Antes de desplegar una función que
  usa una tabla nueva, confirmá que exista en producción.
- **Los secretos nunca van al repo.** Antes de publicar cualquier build estática,
  barré el bundle.
- **Emulador con UNA charla de prueba.** Dos guiones a la vez se pisan.

---

## 8. Qué se entrega al cerrar cada fase

- Qué quedó andando y cómo se comprobó, con evidencia de la base.
- Supuestos tomados por lo que faltaba (van a `docs/supuestos.md`).
- Lo que falta cargar (datos) y quién lo tiene que cargar.
- Lo que quedó sin probar, dicho así.
