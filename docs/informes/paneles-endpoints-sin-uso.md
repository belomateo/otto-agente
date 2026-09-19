# Auditoría de endpoints — quién llama qué (16/9)

Pedido de Mateo: cruzar los 10 grupos de `panel/app/api/` contra las pantallas
que los llaman, sin borrar nada todavía. Hecho contra el checkout real de
`front` (`otto-front`, rama `front`) — es la fuente de verdad de qué pantalla
llama qué, porque paneles no toca `app/(panel)/**` ni `components/`.

No se borró ni se tocó código de producción por esta auditoría: es diagnóstico.

## Método

`grep` de `/api/` en `app/(panel)/**` y `components/**` de `otto-front/panel`
(fuera de `.next` y de `app/api/**`), cruzado a mano contra cada ruta de
`panel/app/api/`. Un botón deshabilitado con `title={SIN_CONECTAR}` cuenta como
"sin uso" aunque el texto mencione la ruta en un comentario.

## Resultado por grupo

| Grupo | Sin uso hoy |
| --- | --- |
| accesos | — (las 2 rutas se usan) |
| atencion | — (se usa) |
| bandeja | — (las 6 rutas se usan, incluida `mensajes` vía `useAccionesCharla`) |
| **bitacora** | **`GET /api/bitacora`** — el grupo entero. `bitacora/page.tsx` sigue con `mock-data.ts` (`eventos`, `kpis`); no hay ningún `fetch`/`useDatos` a `/api/bitacora` en todo `otto-front`. |
| catalogo | `POST /api/catalogo/modelos` (alta): botón "Nuevo modelo" con `disabled title={SIN_CONECTAR}`. `POST /api/catalogo/accesorios` (alta): no hay botón de alta. `POST /api/catalogo/fotos`: "Subir fotos: {SIN_CONECTAR}" en `EdicionModelo.tsx`. Las ediciones (`PATCH .../modelos/[id]` y `.../accesorios/[id]`, vía `SwitchMuestra`) sí se usan. |
| clientes | — (las 3 rutas se usan) |
| **configuracion** | **Todo salvo el `GET /api/configuracion` base**: `agenda`, `contexto/[id]`, `duraciones/[id]`, `enlaces` (+ `[id]`), `franjas` (+ `[id]`), `herramientas/[id]`, `horarios` (+ `[id]`), `notas` (+ `[id]`), `prompt-base`, `reglas` (+ `[id]`) — 14 rutas. `configuracion/agenda/page.tsx` importa de un `agenda-mock.ts` propio, no de la API; el resto de las subpestañas de Configuración (Herramientas, Enlaces, Notas, Reglas, Avanzado) no tienen ningún `fetch` a su ruta en `otto-front`. Accesos es aparte (grupo `accesos`, ya migrado). |
| conocimiento | `POST /api/conocimiento/fragmentos` (alta): botón "Nuevo fragmento" con `disabled title={SIN_CONECTAR}`. `GET /api/conocimiento`, `GET /api/conocimiento/buscar` y `PATCH .../fragmentos/[id]` sí se usan. |
| historial | — (se usa genéricamente desde Catálogo, Clientes y Conocimiento vía `PanelHistorial.tsx`) |
| turnos | — (las 4 rutas se usan, incluidas `avisos` y `[id]/ok` vía el cartel de turno) |

## Lectura

- **bitacora** y la edición de **configuracion** son, en los hechos, el mismo
  frente que el punto (1) de hoy (mock-data.ts sin migrar): tiene sentido que
  se cierren juntos cuando front avise.
- **catalogo/fotos**, el alta de **catalogo/modelos** y **catalogo/accesorios**,
  y el alta de **conocimiento/fragmentos** son casos aparte: la pantalla ya
  existe y ya lee de la API real, pero el botón de creación quedó
  deliberadamente deshabilitado (`SIN_CONECTAR`) — no es candidato a borrado,
  es trabajo de front pendiente.
- Ninguna ruta de este listado se borró: queda para que Mateo decida qué hacer
  con cada caso.
