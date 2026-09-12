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
- **`app/(auth)/`** — login y "esperando aprobación", solo el molde visual.
- **`public/logo-otto.png`** — el logo real de Otto Su Misura. Estaba
  embebido como imagen dentro de `Sidebar.dc.html`, no llegó como archivo
  aparte (`logo-otto.png` y `support.js` que se mencionaban al pedir la
  implementación no forman parte de este export: `support.js` es el runtime
  genérico del canvas de Claude Design, no hace falta portarlo).

## Qué falta (a propósito, no es un olvido)

Esto es **H1.1 + H1.2 nada más**: sistema visual y maqueta con datos mock.
Según `ARRANQUE.md`, el orden real del proyecto es que **Fase 0 (`logica`)
corra primero** — crea el proyecto de Supabase, las migraciones y el
esqueleto de `panel/` con Auth — y recién después arrancan `front`/`agente`/
`paneles` en paralelo. Acá se construyó el panel **antes** de esa Fase 0,
porque lo que se pidió fue implementar el archivo de diseño ya. Consecuencias
concretas:

- **No hay Supabase conectado.** `/login` y `/esperando` son solo el molde;
  no autentican a nadie todavía (eso es H1.10, rol `paneles`).
- **Todo es mock.** Nada de lo que se ve viene de una base de datos ni se
  guarda al tocar "Guardar" — los botones existen visualmente, algunos
  (Editor, Switch, Toast) tienen estado local de React para que no se vean
  rotos, pero no persisten nada.
- **Falta uno de los tres visuales por pestaña.** El diseño trae desktop +
  mobile para las 8 pestañas más login/esperando; ambas variantes están acá.
  Lo que no están son estados alternativos (p. ej. "Bandeja" con 0 charlas,
  "Atención humana" con la pestaña "Consultas OK" activa): son extrapolables
  de `EstadoVacio` y del propio componente, pero no se maquetaron pantalla
  por pantalla porque el canvas tampoco las traía.

Cuando `logica` termine su Fase 0, este `panel/` se puede mover/fusionar con
el esqueleto que genere (mismo `package.json` raíz, mismas convenciones de
`STACK.md` § 6), y `paneles` conecta H1.8/H1.9/H1.10 sobre esta base visual.
