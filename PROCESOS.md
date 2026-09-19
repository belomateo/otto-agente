# PROCESOS.md — Paso a paso de cada proceso

Cada proceso del sistema, de punta a punta, con qué parte lo hace (código, LLM,
persona) y dónde queda la evidencia. Si un paso no está acá, todavía no existe.

Leyenda: 🔧 código · 🧠 LLM · 👤 persona · 📋 evidencia en la base

---

## 1. Un mensaje entra y sale

1. 🔧 Meta manda el POST al webhook. Se verifica la firma; si no coincide, 401 y
   nada más.
2. 🔧 Dedup por `wa_message_id`. Si ya existe, 200 y fin. 📋 `mensajes`
3. 🔧 Se guarda el mensaje y se encola. Respuesta 200 en < 1 s.
4. 🔧 El worker toma el trabajo. Espera 4 s por si el cliente escribe en ráfaga;
   si llegan más, se contestan juntos.
5. 🔧 Si la conversación está **pausada** (derivada a una persona), no responde
   Lucía. Se marca como mensaje nuevo en Atención humana y fin.
6. 🧠 Clasificador: intención, urgencia, derivación dura. 📋 `eventos_agente`
7. 🔧 Si derivación dura → proceso § 4 y fin.
8. 🔧 Se arma el contexto: libreta, ficha, turnos activos, hora, horario laboral
   de hoy, si es charla nueva.
9. 🧠 Lucía responde con herramientas (máx 6 iteraciones).
10. 🔧 Cada acción se valida contra sus precondiciones antes de ejecutarse.
11. 🔧 Barandillas. Si una salta, se rehace una vez; si vuelve a saltar, § 4.
12. 🔧 Se envía por Meta, partido en burbujas. 📋 `mensajes` (dirección: salida)
13. 🧠 Extractor actualiza la ficha del cliente. 📋 `clientes`
14. 🔧 Bitácora: herramientas, razonamiento, tokens, latencia, errores.
    📋 `eventos_agente`, `consumo_llm`

Tiempo objetivo: < 25 s. Si pasa, derivación con texto fijo.

---

## 2. Un turno, de la consulta a la reseña

| Paso | Quién | Qué pasa | Evidencia |
| --- | --- | --- | --- |
| Consulta | 🧠 | Lucía descubre evento, fecha, rol, día/noche; ancla valor; muestra dos looks | `mensajes`, `clientes` |
| Elección de momento | 🧠→🔧 | Lucía pregunta mañana/tarde; `buscar_horarios` calcula huecos reales | traza en `eventos_agente` |
| Agenda | 🔧 | `agendar_turno` valida hueco, horario laboral, datos mínimos, sin turno previo → fila + evento en Google Calendar | `turnos`, `google_event_id` |
| Confirmación al cliente | 🔧 | Texto fijo: día, hora, España 764, mapa, un acompañante, 45 min con 10 de tolerancia, la reserva del traje se abona en el local, avisar si no puede | `mensajes` |
| Recontacto si NO agendó | 🔧 | Consultó y no agendó → plantilla al día siguiente y a las 72 hs, una vez cada una | `recontactos` |
| 24 hs antes | 🔧 | Plantilla `recordatorio_turno_24h` con botones. `recordatorio_enviado_at` | `turnos` |
| Confirmación | 🧠→🔧 | Decisión de Mateo, 16/9: sin botón. Lucía entiende la intención de confirmar, venga como venga (respondiendo al recordatorio o en cualquier otro momento de la charla) y ejecuta `confirmar_turno`, que marca `confirmado=true` con `confirmado_por = 'cliente'`. "Reprogramar" → Lucía retoma con `reprogramar_turno` | `turnos.confirmado_at` |
| Sin respuesta al recordatorio | 👤 | Aparece en Turnos con estado "sin confirmar"; el equipo decide llamar | panel |
| 30 min antes | 🔧→👤 | Cartel en todo el panel con los datos del turno (decisión #10). El OK de alguien del equipo lo cierra para todos y, si el turno seguía sin confirmar, lo confirma con `confirmado_por` = su email | `turnos.aviso_ok_at` |
| En el local | 👤 | Turno de 45'; el asesor toma medidas; se reserva con el 100% (esto lo hace el equipo, Lucía nunca cobra) | el asesor marca "alquiló" en Turnos |
| Prueba final | 🔧+👤 | Al marcar "alquiló", el sistema propone el turno de prueba final (15') un día antes del evento y lo agenda si el asesor confirma | `turnos` (tipo prueba_final) |
| Retiro y devolución | 👤 | El asesor marca "retiró" y "devolvió" en Turnos | `turnos.estado` |
| Agradecimiento | 🔧 | Al día siguiente de "devolvió": plantilla de agradecimiento, pedido de reseña de Google si le pareció buen servicio, y pedido de fotos del evento | `mensajes` |

---

## 3. Fuera del horario humano

- Lucía **sigue atendiendo** a toda hora.
- Agenda igual, pero `buscar_horarios` solo devuelve huecos dentro del horario
  laboral de Mr Otto (Lun–Vie 10–19, Sáb 9:30–18:30, cortes según probador).
- Si necesita derivar fuera de horario, el mensaje al cliente es fijo: «Le paso tu
  consulta al equipo y te escriben apenas abran mañana.» La derivación queda en
  Atención humana con la hora.

---

## 4. Derivación a una persona

1. 🔧 o 🧠 Se decide derivar (dura en código; por el LLM con la tool).
2. 🔧 Se crea la fila en `derivaciones` con motivo (enum), resumen del extractor y
   últimos 5 mensajes.
3. 🔧 Se pausa la conversación para Lucía.
4. 🔧 **Pendiente** (hallazgo de logica, 16/9): se avisa por WhatsApp al número del
   canal de alquiler: «Nueva derivación: <motivo> — <nombre> — <resumen>. Panel:
   <link>». `derivaciones.destino_tel` ya se guarda; falta el paso que manda el
   mensaje (`worker/atender.ts`, con `ResultadoTurno.avisoEquipo` que el turno ya
   devuelve). Hasta entonces, la derivación solo se ve en el panel.
5. 🔧 Al cliente se le manda un mensaje: el `mensaje_al_cliente` que escribió Lucía,
   o si es reclamo, cliente enojado o descuento, un texto fijo aprobado en su lugar
   (para que siga una persona sin discutir). Pedido de Mateo, 19/9: ninguna
   derivación deja al cliente sin nada — la única excepción real es sin_respuesta/
   timeout (el cliente dejó de escribir) y la ventana de Meta cerrada (no se puede
   mandar texto libre).
6. 👤 Alguien la toma desde Atención humana: responde desde el panel (esos
   mensajes salen marcados `[mostrador]` en el historial que Lucía lee), y al
   terminar aprieta **"Devolver a Lucía"** o **"Cerrar"**.
7. 🔧 "Devolver a Lucía" despausa; el siguiente mensaje del cliente lo contesta
   ella con todo el historial, sin volver a presentarse.

Motivos (enum): `reclamo`, `cliente_enojado` (el tono, no el contenido: lo detecta el
clasificador aunque no diga "reclamo" ni nombre nada roto — pedido de Mateo, 16/9),
`prenda_danada`, `corporativo`, `turno_urgente_sin_hueco`,
`evento_inminente` (evento hoy o mañana: deriva siempre, decisión #8 del 14/9),
`descuento`, `dato_no_encontrado`, `pide_persona`, `barandilla_doble`, `sin_respuesta`,
`timeout`, `fallo_tecnico` (se agotaron los 2 intentos de un trabajo de la cola, o un mensaje
quedó en duda al mandarlo por Meta — logica, 0044, 16/9).

---

## 5. El dueño edita (sin programador)

Todo desde el panel, todo con historial y botón "volver a la versión anterior".

| Qué | Pestaña | Efecto | Cuándo lo ve Lucía |
| --- | --- | --- | --- |
| Precios, modelos, colores, talles, fotos | Catálogo | Upsert en `catalogo_alquiler` | En el próximo turno (herramienta) |
| Accesorios y precios | Catálogo | `accesorios_alquiler` | Próximo turno |
| Horarios, cortes, probadores, duraciones | Configuración › Agenda | `horarios` | Próximo cálculo de huecos |
| Fragmentos de conocimiento | Conocimiento | `fragmentos` (activar / editar / versión) | Próximo turno |
| Reglas del agente | Configuración › Reglas | `reglas_agente` → regenera `prompt.md` | ≤ 60 s (caché del prompt en Storage) |
| Contexto y presentación | Configuración › Lucía | `contexto_agente` → regenera | ≤ 60 s |
| Prompt base | Configuración › Lucía › Avanzado | Edita el fuente de `prompt.md`; el generador valida (sin `{{`, ≤ 300 líneas) y **rechaza** si no pasa | ≤ 60 s |
| Herramientas | Configuración › Herramientas | Activar/desactivar y editar la descripción que Lucía lee. El schema y las precondiciones no se tocan desde acá | Próximo turno |
| Notas adicionales | Configuración › Notas | `notas_dueno`: texto libre que se inyecta como fragmento `notas-del-dueno` | Próximo turno |
| Fichas de cliente | Clientes | Edita la libreta a mano | Próximo turno |
| Links (web, mapa, reseña) | Configuración › Enlaces | `enlaces` | Próximo turno |

Cada cambio en Reglas, Contexto o Prompt base **dispara el tester modo agente**
en segundo plano y muestra el resultado en Bitácora: «los 14 guiones pasaron» o
«falló `solo-precio`: ver». No bloquea el cambio, pero avisa.

---

## 6. Mejora continua

### Analista nocturno (🧠, 03:00)

1. Lee todas las charlas del día con su bitácora.
2. Para cada regla de § 5 de `AGENTE.md`, busca turnos donde se rompió y los lista
   con el mensaje textual.
3. Detecta preguntas de clientes que terminaron en `dato_no_encontrado` o en una
   búsqueda vacía de `buscar_informacion` → propone el fragmento que faltó, con
   tema y texto sugerido.
4. Detecta objeciones sin guion (el cliente frenó y no hay sección que pegue) →
   propone la sección.
5. Calcula: consultas, turnos agendados, tasa de conversión, derivaciones por
   motivo, costo por conversación, latencia p50/p95. 📋 `metricas_diarias`
6. Escribe todo en `propuestas_mejora` con estado `pendiente`. **Nunca aplica.**

### El dueño o Mateo revisa (👤, pestaña Bitácora › Propuestas)

- Cada propuesta tiene "Aplicar", "Editar y aplicar" o "Descartar".
- Aplicar un fragmento lo crea activo. Aplicar una regla regenera el prompt.
- Al aplicar, corre el tester modo agente. Si un guion falla, la propuesta queda
  "aplicada con alerta" y aparece en rojo hasta que alguien la mire.

### Falla del agente vs falla del dato

Antes de tocar el prompt por un error, la pregunta es una sola: **¿el dato estaba
cargado?** Si no estaba, se carga el dato. Si estaba y Lucía no lo usó, es falla
de herramienta o de prompt, en ese orden. La mayoría de los problemas de estos
sistemas son datos en mal estado.

---

## 7. Deploy

1. 🔧 `npm test` verde en el worktree del rol.
2. 🤖 **tester modo repo**: build, typecheck, tests, bundle sin secretos, `.env`
   fuera del repo. Informe en `docs/informes/`.
3. 🤖 **verificador** (opus): revisión de código de la fase. Informe.
4. 🤖 **seguridad** (opus): auditoría. Informe. Si "no apto", se frena.
5. 👤 Mateo lee los tres informes y aprueba.
6. 🔧 Antes de desplegar una función que usa una tabla nueva, confirmar que la
   migración esté aplicada en producción (`supabase migration list`).
7. 🔧 `supabase functions deploy` + `vercel --prod`.
8. 🔧 Un guion de humo contra producción con el número de prueba
   (`invitado-casamiento`), verificado en la base y en el Calendar.
9. 📋 Fila en `deploys` con commit, quién, informes.

---

## 8. Cuando algo se rompe en producción

- **Lucía no responde**: el worker deriva por timeout; la charla cae en Atención
  humana. Nadie queda sin respuesta.
- **Meta rechaza el envío** (ventana cerrada, plantilla no aprobada): se registra
  en `eventos_agente` con el error y se reintenta con plantilla si corresponde.
- **Google Calendar falla**: el turno se guarda igual en la base con
  `google_event_id = null` y un cron reintenta cada 5 min; en Turnos aparece con
  un ícono "sin sincronizar".
- **OpenAI caído**: reintento 1; después derivación con texto fijo.
- **El dueño rompió el prompt**: el generador rechaza el cambio y la versión
  anterior sigue activa. Nunca se despliega un prompt que no pasa el generador.
