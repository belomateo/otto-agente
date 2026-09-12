# Panel de Lucía — Otto Su Misura

> Pegá este archivo entero en Claude Design como primer mensaje. Si tenés el logo,
> la paleta y capturas del Instagram (@otto_sumisura), adjuntalos en el mismo
> mensaje: reemplazan la sección "Identidad propuesta". Si no los tenés, la
> identidad propuesta abajo está completa y se puede usar tal cual.

---

## Qué tenés que diseñar

Un panel web para el equipo de **Otto Su Misura**, el alquiler de trajes a
medida de **Mr Otto** (casa de indumentaria masculina de Rosario, Argentina,
desde 1968). El panel muestra lo que hace **Lucía**, la asistente de WhatsApp
que atiende a los clientes y agenda turnos en el local, y permite que el dueño
edite todo lo que Lucía sabe sin llamar a un programador.

Lo usan tres tipos de personas:

- **El dueño**, desde la computadora de la oficina. Quiere ver cuántos turnos
  hubo, qué contestó Lucía, y cambiar un precio o una regla en un minuto.
- **Los asesores del local** (dos o tres), desde el celular, parados entre
  probadores, con clientes esperando. Necesitan ver el turno de ahora, marcar
  "alquiló" o "devolvió", y atender una derivación urgente con una mano.
- **Mateo**, el que lo construye, desde la computadora, mirando la bitácora.

**Idioma:** español rioplatense (voseo). Todo el texto de la interfaz en español.

**Principio de diseño:** cada pantalla se entiende en cinco segundos y se
puede editar sin miedo. Lo que se puede tocar se ve como editable; lo que no,
no aparece. Cada cambio muestra "Guardado" y tiene "Deshacer".

---

## Identidad propuesta

Sastrería italiana, a medida, sobria, con sesenta años de trayectoria detrás.
No es una app de tecnología: es la oficina de una sastrería que ahora tiene un
sistema. El nombre de la marca ya lo dice: *su misura*, "a tu medida".

### Paleta

| Uso | Nombre | Hex |
| --- | --- | --- |
| Fondo general | Hueso | `#F6F3EE` |
| Superficies (tarjetas, paneles) | Lino | `#FFFFFF` con borde `#E6E1D8` |
| Texto principal | Tinta | `#171A1F` |
| Texto secundario | Grafito | `#5C6068` |
| Acento primario (botones, links, selección) | Cobre | `#A8703F` |
| Acento suave (fondos de chips, hover) | Cobre claro | `#F1E6D9` |
| Azul noche (encabezados, avatar de Lucía) | Noche | `#1F2A3C` |
| Confirmado / ok | Salvia | `#5E7F62` sobre `#E7EFE7` |
| Esperando / sin confirmar | Ámbar | `#B8862B` sobre `#F7EFDD` |
| Atención humana / error | Ladrillo | `#A6473A` sobre `#F6E3DF` |
| Lucía (mensajes) | Noche sobre `#EEF1F5` | — |
| Equipo "mostrador" (mensajes) | Cobre claro | `#F1E6D9` |
| Cliente (mensajes) | Lino con borde | — |

Sin gradientes. Sin sombras pesadas (máximo `0 1px 2px rgba(0,0,0,.06)`). Sin
íconos multicolor: íconos de línea en Grafito, en Cobre cuando están activos.

### Tipografía

- **Títulos, nombres de clientes, números grandes:** una serif con carácter,
  tipo etiqueta de sastrería. Propuesta: *Fraunces* (o *Cormorant Garamond*).
  Pesos 500–600. Nunca en cuerpo de texto.
- **Todo lo demás:** *Inter*. Tamaños generosos: cuerpo 15–16 px, secundario
  13–14 px. En mobile no bajar de 14 px: se lee en el local, con luz de vidriera
  y gente alrededor.
- Números (precios, horas) en tabular figures.

### Tono visual

Mucho aire. Pocas líneas. Tablas con filas altas (56 px). Bordes de 1 px en
Lino, radios de 8 px. Fotos de trajes grandes, en proporción 3:4, sin
recortes raros. Un solo color de acción: Cobre. Nada compite con el contenido.

### Lucía tiene presencia

Un avatar circular Noche con una "L" en serif Hueso. Aparece en cada mensaje
suyo, en la pestaña de configuración y en el estado vacío ("Lucía está
atendiendo sola"). Los mensajes del equipo que responden desde el panel llevan
una etiqueta chica "mostrador" para que nadie los confunda con los de Lucía.

---

## Datos de ejemplo (usalos en todas las pantallas, que se vean reales)

**Clientes:** Franco Bertolini (novio, casamiento 14/11, noche, talle 50) ·
Verónica Díaz (mamá de Tomás, graduación 28/11, Roldán) · Nicolás Pereyra
(invitado, casamiento 25/10, de día) · Martín Sosa (evento laboral 3/10) ·
Agustín Ferreyra (graduado 12/12, urgente, mismo día).

**Turnos de hoy (sábado 12/9):** 10:00 Franco Bertolini — Novio — Probador 1 —
Confirmado · 10:15 Nicolás Pereyra — Invitado — Probador 2 — Sin confirmar ·
11:30 Martín Sosa — Invitado — Probador 3 — Confirmado · 12:15 Tomás Díaz —
Graduado — Probador 1 — Confirmado · 16:00 Prueba final — Lucas Amado — 15' —
Probador 2.

**Derivaciones abiertas:** Agustín Ferreyra — Turno urgente sin hueco — hace 12
min · Empresa Litoral Seguros — Corporativo (uniformes, 18 personas) — hace 2 h.

**Catálogo:** Ambo azul noche corte italiano — $150.000 · Ambo gris perla —
$150.000 · Smoking negro — $185.000 · Chaquet — $210.000. Accesorios: camisa +
corbata $33.500; zapato + cinturón $55.000.

**Fragmentos:** "Qué incluye el alquiler" · "Cómo funciona: retiro y devolución"
· "Reserva y garantía" · "Talles: del XS al 68" · "Objeción: es caro" ·
"Objeción: lo voy a pensar".

**Números del día:** 23 consultas · 7 turnos agendados · 30% conversión · 2
derivaciones · $4.120 de costo de IA.

**Charla de ejemplo** (Bandeja):
> Cliente: hola queria saber cuanto sale alquilar un traje
> Lucía: ¡Hola! Soy Lucía, asistente de Mr. Otto. Claro que sí, te ayudo. Para recomendarte la mejor opción, contame: ¿para qué evento necesitás el traje?
> Cliente: casamiento el 25 de octubre
> Lucía: ¡Qué bueno! ¿Vas como invitado o sos el novio?
> Cliente: invitado
> Lucía: Perfecto. Para un casamiento podemos trabajar desde un azul noche clásico hasta opciones más actuales. El alquiler a medida arranca desde $150.000 e incluye sastrería y tintorería antes y después del evento. ¿Es de día o de noche? 🤵‍♂️
>
> Bitácora de ese turno (desplegable): Clasificador → intención "alquiler", urgencia baja · consultar_catalogo(evento: casamiento) ✓ · Razonamiento: "Ya tengo evento y rol, falta día/noche antes de mostrar looks. Anclé el valor antes del precio." · 1.840 tokens · 3,2 s.
>
> Mini resumen al costado de un mensaje con problema: `⚠ Rehecho: precio sin herramienta`.

---

## Navegación

- **Desktop:** barra lateral izquierda fija, 8 entradas con ícono y nombre,
  avatar del usuario abajo. Contador en Atención humana cuando hay pendientes.
- **Mobile:** barra inferior con 4: Bandeja · Atención humana · Turnos · Más
  (que abre las otras cuatro). El contenido ocupa todo el ancho.

---

## Las 8 pestañas

### 1. Bandeja
Dos columnas en desktop (lista 360 px + charla). En mobile, lista; tocar abre
la charla a pantalla completa.

**Lista:** por conversación: nombre en serif, último mensaje truncado, hora, y
un chip: *Lucía* (Noche) / *Persona* (Cobre) / *Cerrada* (Grafito). Buscador
arriba. Filtros: Todas · Con Lucía · Con persona · Sin respuesta.

**Charla:** estilo WhatsApp, burbujas del cliente a la izquierda en Lino, de
Lucía a la derecha en gris azulado con su avatar, del equipo en Cobre claro
con la etiqueta "mostrador". Cada burbuja de Lucía tiene, en la esquina, un
ícono pequeño (una lupa o un "i") que **despliega la bitácora de ese turno**
debajo de la burbuja: lista de pasos con ✓/✗, el razonamiento en cursiva,
tokens y tiempo. Plegada por defecto. Si el turno tuvo un error, barandilla o
derivación, se ve un **mini resumen de una línea al costado** de la burbuja,
sin abrir nada, en Ámbar o Ladrillo.

**Cabecera de la charla:** ficha compacta del cliente en una línea:
`Nicolás Pereyra · Invitado · Casamiento 25/10 · Noche · Talle 48 · Turno sáb 10:15`
con un botón "Ver ficha". Botón "Tomar la charla" (pasa a persona) y, si ya
está en persona, "Devolver a Lucía".

Abajo, campo de respuesta para el equipo, deshabilitado mientras la charla la
tiene Lucía ("Lucía está atendiendo. Tomá la charla para responder").

### 2. Atención humana
Lista de derivaciones, la más urgente arriba. Cada tarjeta: nombre, chip del
motivo (Reclamo / Prenda dañada / Corporativo / Urgente / Descuento / Dato no
encontrado / Pide persona), hace cuánto, y el **resumen de dos líneas** que
armó el sistema. Tocar abre la charla con los últimos mensajes y un campo
grande para responder. Dos botones al final, bien separados: **Devolver a
Lucía** (Cobre) y **Cerrar** (borde). Estado vacío: el avatar de Lucía y
"Todavía no hay derivaciones. Lucía está atendiendo sola."

### 3. Turnos
Vista de **día** (default) y **semana**. En día: tres columnas, una por
probador, con la hora a la izquierda (9:30 a 19:00) y el corte 14–15
sombreado. Cada turno es un bloque con nombre en serif, tipo, y borde de color
por estado: Sin confirmar (Ámbar) · Confirmado (Salvia) · Alquiló · Retiró ·
Devolvió (Grafito). Un ícono chico de "sin sincronizar" si Google Calendar
falló. Tocar: tarjeta con la ficha, y acciones: **Mover**, **Cancelar**, y los
estados como pasos (Confirmado → Alquiló → Retiró → Devolvió). Filtro rápido
arriba: "Sin confirmar para mañana" con contador. Botón "Nuevo turno" para
cargar uno a mano.

En mobile, la vista de día es una lista vertical ordenada por hora, con el
probador como etiqueta.

### 4. Clientes
Tabla: nombre, teléfono, evento, fecha, rol, último contacto, turno. Buscador y
filtros por evento y por mes. Tocar: la **ficha completa** (la libreta de
Lucía) con los campos editables a mano —nombre, evento, fecha, rol, día/noche,
talle, ciudad, color preferido, notas— y debajo el historial de charlas y
turnos. Un aviso chico: "Lucía usa esta ficha en cada mensaje."

### 5. Conocimiento
Lo que Lucía sabe, agrupado por tema en secciones plegables (Qué incluye · Cómo
funciona · Reserva y garantía · Ubicación y horarios · Talles · A medida ·
Anticipación · Accesorios · Objeciones · Qué no hacemos · Descuentos · Guiones:
novio, graduado, invitado). Cada fragmento: título, texto, switch Activo,
versión y fecha, botón editar. Un campo arriba: **"Probá cómo lo encontraría un
cliente"**: escribís "cuanto se paga de seña" y muestra qué fragmento
devolvería. Botón "Nuevo fragmento".

Arriba de todo, si hay, una tarjeta **"Propuestas de Lucía"**: lo que el
análisis nocturno sugiere agregar, con Aplicar · Editar y aplicar · Descartar.

### 6. Catálogo
Grilla de modelos con foto grande 3:4, nombre en serif, colores como puntitos,
rango de talles, precio base. Switch "Lucía lo puede mostrar". Tocar: edición
completa con subida de fotos (arrastrar o link), colores, talles, precio,
descripción corta. Sección aparte "Accesorios" en tabla: nombre, precio de
alquiler, precio de compra con descuento, switch.

### 7. Bitácora
Arriba, **cuatro números del día** en tarjetas: Consultas · Turnos agendados ·
Conversión · Derivaciones (con el costo de IA en chico). Debajo, la línea de
tiempo de eventos con filtros (tipo, fecha, regla, cliente): cada evento en una
fila con hora, ícono, cliente, y descripción en una línea; las filas con error
o barandilla en Ámbar/Ladrillo. A la derecha (o abajo en mobile), el resultado
del último **tester**: "14 guiones · 14 ok" en Salvia, o el que falló en
Ladrillo con link.

### 8. Configuración
Subpestañas horizontales:

- **Lucía:** avatar, presentación (texto editable: "Hola, soy Lucía, asistente
  de Mr. Otto. ¿En qué puedo ayudarte hoy?"), contexto (texto largo), reglas
  numeradas (lista editable, cada una con su número, agregar/quitar), y un
  bloque plegado **"Avanzado: prompt base"** con editor de texto plano, botón
  "Validar y guardar" que muestra en rojo si no pasa.
- **Agenda:** horarios por día de la semana, cortes, cantidad de probadores,
  duraciones por tipo de turno (Novio 45' · Invitado 45' · Graduado 45' · Doble
  1:30 · Triple 2:00 · Prueba final 15'), escalonado (15').
- **Herramientas:** lista con nombre, descripción editable (lo que Lucía lee) y
  switch. Aviso: "Lo que la herramienta hace no se edita acá."
- **Enlaces:** web, mapa, reseña de Google, turnero.
- **Notas:** un campo grande de texto libre del dueño: "Lucía tiene esto en
  cuenta en cada charla."
- **Accesos:** solicitudes pendientes con nombre, email, fecha y Aprobar /
  Rechazar; debajo la lista de usuarios con rol (Admin / Equipo) y "Quitar".

Todas las ediciones tienen "Guardar" (Cobre), "Deshacer" y "Ver versión
anterior". Al guardar, un toast "Guardado · Lucía lo usa en el próximo mensaje".

---

## Pantallas extra

- **Login:** el logo de Otto Su Misura centrado sobre Hueso, email y
  contraseña, "Pedir acceso" como link. Nada más.
- **Esperando aprobación:** el avatar de Lucía, "Tu solicitud está esperando
  que un administrador la apruebe. Te avisamos por email."
- **Estado vacío** de cada pestaña, con una frase en el tono de la casa.

---

## Componentes a definir (se repiten en todas las pantallas)

1. Chip de estado (una palabra, fondo suave, texto del color del estado).
2. Ficha de cliente compacta (una línea) y completa (tarjeta).
3. Burbuja de mensaje en tres variantes: cliente, Lucía, mostrador.
4. Bloque de bitácora desplegable + mini resumen al costado.
5. Bloque de turno (calendario) en cinco estados.
6. Editor con Guardar / Deshacer / Versión anterior.
7. Switch con etiqueta.
8. Tarjeta de número del día.
9. Estado vacío.
10. Toast de confirmación.

---

## Entregar

- Las 8 pestañas en **desktop (1440)** y **mobile (390)**, más login, esperando
  aprobación, y la Bandeja con una bitácora desplegada.
- Los 10 componentes con sus estados.
- **Tokens exportables** (colores, tipografías, tamaños, espaciados, radios)
  en formato listo para Tailwind.

El resultado se lo pasa Mateo al Claude Code que arma el front del panel, así
que la prioridad es que las decisiones queden claras y consistentes, no que
haya muchas variantes.
