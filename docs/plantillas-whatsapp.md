# Plantillas de WhatsApp — borrador para aprobar

Los mensajes que salen solos, sin que el cliente haya escrito antes (hito 1.14). WhatsApp
solo deja mandarlos si Meta aprobó el texto antes, y la aprobación puede tardar días. Por
eso se redactan ahora: **Mateo (y Sofía) los aprueban o corrigen, y recién ahí se cargan en
Meta.** Después, cambiar una coma es volver a pedir aprobación.

Lo que va entre llaves lo completa el sistema en cada envío: `{{1}}` el nombre, y lo que
dice cada plantilla. Idioma: español (Argentina).

## 1. `recordatorio_turno_18h` — 18 horas antes del turno

- **Cuándo sale:** un día antes de cada turno, una sola vez.
- **Categoría en Meta:** utilidad (recordatorio de algo que el cliente ya reservó).
- **Variables:** `{{1}}` nombre · `{{2}}` día («jueves 6 de junio») · `{{3}}` hora («16:00»).

> Hola, {{1}}. Te recordamos tu turno en Otto Su Misura: mañana {{2}} a las {{3}}, en
> España 764, Rosario. ¿Nos confirmás que venís?

**Botones:** `Confirmo` · `Necesito reprogramar`

Al tocar «Confirmo» el turno queda confirmado en el panel (lo marca el sistema, no Lucía).
Con «Necesito reprogramar», Lucía retoma la charla y le ofrece otro horario.

## 2. `agradecimiento_resena` — al día siguiente de la devolución

- **Cuándo sale:** el día después de que el equipo marca «devolvió» en Turnos, una sola vez.
- **Categoría en Meta:** probablemente marketing (Meta suele clasificar así los pedidos de
  reseña): tiene un costo por mensaje más alto que las de utilidad.
- **Variables:** `{{1}}` nombre · `{{2}}` el link para dejar la reseña en Google.

> ¡Gracias por elegirnos, {{1}}! Esperamos que el evento haya salido espectacular. Si te
> gustó cómo te atendimos, nos ayuda mucho que dejes tu reseña en Google: {{2}}
>
> Y si tenés fotos del evento, nos encantaría verlas. 😊

**Falta:** el link de reseñas de Google del local.

## 3. `recontacto_turno_pendiente` — consultó y no sacó turno

- **Cuándo sale:** al día siguiente de una consulta que no terminó en turno, y otra vez a
  las 72 horas. Una vez cada una. Si en el medio sacó turno, no sale.
- **Categoría en Meta:** marketing.
- **Variables:** `{{1}}` nombre.

> Hola, {{1}}. Te escribo de Otto Su Misura por el traje que estabas buscando. Cuando
> quieras, te reservo un turno en el local para que lo veas puesto y el equipo te asesore
> con el calce, los colores y los accesorios. ¿Te busco un horario?

**Botones:** `Sí, buscame uno` · `Más adelante`

Cualquiera de los dos botones vuelve a abrir la charla con Lucía: con «Sí» busca horarios, y
con «Más adelante» lo acepta sin insistir.

## Cómo se escribieron

- Con la voz de Lucía: voseo, cálida, sin presionar, una sola pregunta y al final.
- Sin precios, duraciones ni tolerancias: son datos que cambian, y cambiar el texto obliga
  a volver a pedir la aprobación de Meta. Lo que sí está fijo es la dirección.
- Ninguna dice «no», y ninguna cierra con fórmulas de relleno.
