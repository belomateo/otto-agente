# Panel de Lucía — Otto Su Misura

Implementación de `Panel Lucía - Otto Su Misura.dc.html` (Claude Design,
proyecto `c6e325de-78c6-4c6b-bd8b-642eb7b4402e`). Cubre **H1.1** (sistema
visual: tokens, tipografía, componentes base) y **H1.2** (las 8 pestañas
maquetadas con datos mock, responsive) de `../TRABAJO.md`.

## Corrida local

```bash
npm install
npm run dev
```

Abre en `http://localhost:3000` (o el puerto siguiente libre). `npm run build`
compila sin errores de tipos ni vulnerabilidades (`npm audit` en cero).

## Qué hay

- **`tailwind.config.js`** — los tokens tal cual `DISENO.md` § TOKENS
  (`otto-tokens.tailwind.js`): paleta, tipografía (Fraunces + Inter, vía
  `next/font/google`), radios, sombras, espaciados con nombre.
- **`components/ui-otto/`** — los 10 componentes base del diseño (chip,
  ficha de cliente, burbuja de mensaje, bitácora, bloque de turno, editor,
  switch, tarjeta de KPI, estado vacío, toast).
- **`components/nav/`** — Sidebar (desktop, 216px) y TabbarMobile + hoja
  "Más" (mobile), con los mismos íconos SVG del diseño.
- **`lib/mock-data.ts`** — los datos de ejemplo del canvas (conversaciones,
  turnos, clientes, catálogo, reglas, KPIs), sin inventar nada nuevo.
- **`app/(panel)/`** — las 8 pestañas: bandeja, atención, turnos, clientes,
  conocimiento, catálogo, estadísticas, configuración. Cada `page.tsx`
  renderiza la variante de escritorio y la de mobile (`hidden md:flex` /
  `flex md:hidden`), no son rutas separadas.
- **`app/(auth)/`** — login y "esperando aprobación": Auth real de Supabase
  (ver abajo), no solo el molde.
- **`lib/supabase/{client,server}.ts`** y **`middleware.ts`** — el patrón
  oficial de `@supabase/ssr` para App Router. El middleware es la guarda de
  acceso: sin sesión manda a `/login`; con sesión pero perfil no aprobado,
  a `/esperando`; aprobado y visitando `/login`/`/esperando`, a `/bandeja`.
- **`public/logo-otto.png`** — el logo real de Otto Su Misura. Estaba
  embebido como imagen dentro de `Sidebar.dc.html`, no llegó como archivo
  aparte (`logo-otto.png` y `support.js` que se mencionaban al pedir la
  implementación no forman parte de este export: `support.js` es el runtime
  genérico del canvas de Claude Design, no hace falta portarlo).

## Auth (Fase 0, adelantado)

`ARRANQUE.md` pone la Auth del panel en Fase 0 (rol `logica`, antes que
`front`/`agente`/`paneles` arranquen). Como acá el panel ya existía (H1.1/H1.2),
al llegar Fase 0 se sumó la Auth real encima en vez de rehacer el esqueleto:

- **Registro abierto** desde `/login` ("Pedir acceso"): crea la cuenta en
  Supabase Auth; un trigger (`0010_auth_solicitudes.sql`) le crea su fila en
  `perfiles` (`estado='pendiente'`) y en `solicitudes_acceso` automáticamente.
  Sin confirmación de email (`mailer_autoconfirm=true` — panel interno, el
  filtro real es la aprobación manual; ver `docs/supuestos.md` #19).
- **`/esperando`** hasta que un admin apruebe (Configuración › Accesos es
  H1.10, todavía no existe la pantalla — por ahora se aprueba a mano por SQL).
- El pie del Sidebar/hoja "Más" ya muestra nombre y rol reales del perfil
  logueado, y "Salir" cierra sesión de verdad.
- Probado de punta a punta con un usuario de prueba (registro → pendiente →
  promovido a admin por SQL → `/bandeja` con sus datos reales) y borrado
  después; no queda ningún usuario cargado todavía.

## Qué falta (a propósito, no es un olvido)

El sistema visual (H1.1) y las 8 pestañas maqueteadas (H1.2) siguen con
**datos mock** — la Auth ya es real, pero Bandeja/Turnos/Clientes/etc. todavía
no leen la base. Eso es H1.8/H1.9 (rol `paneles`, Fase 1). Consecuencias
concretas:

- **Todo el contenido de las 8 pestañas es mock.** Nada de lo que se ve viene
  de una base de datos ni se guarda al tocar "Guardar" — los botones existen
  visualmente, algunos (Editor, Switch, Toast) tienen estado local de React
  para que no se vean rotos, pero no persisten nada.
- **Falta uno de los tres visuales por pestaña.** El diseño trae desktop +
  mobile para las 8 pestañas más login/esperando; ambas variantes están acá.
  Lo que no están son estados alternativos (p. ej. "Bandeja" con 0 charlas,
  "Atención humana" con la pestaña "Consultas OK" activa): son extrapolables
  de `EstadoVacio` y del propio componente, pero no se maquetaron pantalla
  por pantalla porque el canvas tampoco las traía.

Cuando `logica` termine su Fase 0, este `panel/` se puede mover/fusionar con
el esqueleto que genere (mismo `package.json` raíz, mismas convenciones de
`STACK.md` § 6), y `paneles` conecta H1.8/H1.9/H1.10 sobre esta base visual.
