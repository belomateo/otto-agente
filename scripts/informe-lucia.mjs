import { readFileSync, writeFileSync } from 'node:fs';
const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const d = JSON.parse(leer('docs/informes/inventario-lucia-base.json'));
const dinero = (n) => Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const m = leer('supabase/migrations/0076_conocimiento_talles_y_derivacion.sql');
const fragmentos = d.fragmentos.filter((f) => f.activo).map((f) => ({ ...f }));
fragmentos.find((f) => f.id.endsWith('0501')).texto = m.match(/UPDATE fragmentos SET texto = '([^']+)'/)[1];
for (const f of m.matchAll(/\('([^']+)', '([^']+)', '([^']+)',\s*'([^']+)', true,/g)) {
  fragmentos.push({ id: f[1], tema: f[2], titulo: f[3], texto: f[4] });
}
const funciones = {
  agendar_turno: 'Guardar una visita en el calendario del panel.',
  anotar: 'Guardar preferencias o detalles útiles en la libreta del cliente.',
  buscar_horarios: 'Consultar huecos reales, incluida la fecha y hora exactas elegidas.',
  buscar_informacion: 'Buscar por tema las respuestas y condiciones del negocio.',
  cancelar_turno: 'Cancelar una visita del cliente.',
  confirmar_turno: 'Registrar la confirmación de asistencia.',
  consultar_accesorios: 'Consultar complementos, precios y condiciones cargadas.',
  consultar_catalogo: 'Consultar modelos, colores, talles, precios y fotos cargadas.',
  derivar_a_persona: 'Pasar la consulta al equipo y dejarla registrada para atención humana.',
  enviar_fotos: 'Enviar hasta tres fotos disponibles del catálogo.',
  enviar_link: 'Enviar mapa, reseña o web; evitar repetir el enlace salvo pedido expreso.',
  guardar_datos_cliente: 'Completar la ficha; después de reservar, actualizar el resumen del mismo turno.',
  reprogramar_turno: 'Mover una visita a otro horario disponible.',
  ver_turnos_cliente: 'Consultar las visitas vigentes del cliente.',
};
const textos = `# Lucía: información y funciones

Inventario del 1 de octubre de 2026, actualizado con pruebas reales del 2 de octubre. No incluye conversaciones ni datos personales de clientes reales.

## Estado de esta entrega

Los cambios están implementados y comprobados con la IA real y clientes ficticios. Todavía no están publicados en la versión que atiende WhatsApp ni en el panel del personal. Las secciones siguientes describen el comportamiento preparado y distinguen los datos que ya estaban cargados.

## Reservas

- Alcanza con teléfono, fecha y hora elegidas. El teléfono viene de la conversación.
- Lucía comprueba el horario y guarda el turno en el calendario del panel. No hace falta otro agente.
- Nombre y correo son opcionales. Si faltan, los solicita después de reservar.
- Envía una sola lista con Nombre, Número, Día y hora y Gmail. Los opcionales vacíos dicen «No especificado».
- Acepta correos de cualquier proveedor. «Gmail» es solamente la etiqueta que pediste.
- Si después recibe nombre o correo, actualiza la ficha vinculada a la misma reserva y muestra la lista actualizada. No cambia la fecha ni crea otro turno.
- Puede reprogramar, cancelar, consultar y confirmar asistencia.
- Una fecha ambigua se aclara; no se inventa. El horario elegido no se cambia sin el cliente.
- Si no puede confirmar disponibilidad, deriva al equipo sin negar que haya lugar.
- Cuando no se conoce el tipo de visita se usa la duración habitual, sin inventar el rol del cliente. Si se conoce que se prueban dos o tres personas, se contempla ese tiempo.

## Conversaciones y mensajes

- Los agradecimientos y cierres como «ok» o «muchas gracias por tu atención» no vuelven a disparar la explicación de venta.
- No debe repetir enlaces, preguntas ni información que ya dio. Puede reenviar un enlace si el cliente lo pide.
- Cada casilla muestra quién escribió el último mensaje: Cliente, Lucía o Equipo.
- Muestra día y hora del último mensaje y cantidad de mensajes sin leer.
- Las conversaciones se ordenan por su mensaje más reciente, venga del cliente o de nosotros.
- El filtro «Sin leer» permite ver las pendientes. «Sin respuesta» distingue las que terminan con un mensaje del cliente.
- La lectura es compartida por el personal: se marca al ver el final de la conversación, con la ventana visible. Una respuesta de Lucía no significa que el equipo haya leído.
- La bandeja consulta novedades cada cinco segundos. No es una notificación del teléfono ni una alarma sonora.
- La conversación abierta no cambia sola cuando otra sube al primer lugar.
- Los mensajes anteriores a la incorporación de esta función aparecen pendientes hasta abrirlos. El hilo carga hasta los últimos 500 mensajes; la bandeja muestra hasta 200 conversaciones.

## Dónde busca cada cosa

El mensaje principal quedó en ${leer('supabase/functions/_shared/prompt.md').trimEnd().split('\n').length} líneas. Conserva identidad, tono, reglas, cómo reservar y un índice de consultas.

Se sacaron del mensaje principal los detalles de direcciones, horarios, talles, condiciones comerciales, explicaciones del servicio y guiones de asesoramiento. Se consultan cuando hacen falta:

| Información | Lugar que consulta Lucía | Lugar para mantenerla |
|---|---|---|
| Condiciones y respuestas del negocio | Base de conocimiento, por tema | Conocimiento |
| Modelos, colores, talles y precios | Catálogo | Catálogo |
| Complementos y sus precios | Accesorios | Catálogo |
| Horarios, cierres, probadores y duración | Agenda y configuración | Calendario / Configuración de agenda |
| Datos del cliente y notas | Ficha del cliente | Clientes |
| Turnos existentes | Calendario propio | Calendario |
| Mapa, reseña y webs | Enlaces | Configuración de enlaces |

Usa la base de conocimiento que el proyecto ya tiene. No se agregó otro servicio ni se duplicó toda la información en el mensaje principal.

## Catálogo cargado

Estos son los valores leídos de la base en esta revisión; Lucía debe volver a consultarlos antes de cotizar.

| Modelo | Colores | Talles cargados | Alquiler | Fotos |
|---|---|---|---|---|
${d.catalogo.filter((c) => c.activo).map((c) => `| ${c.modelo} | ${c.colores.join(', ')} | ${c.talles.join(', ')} | ${dinero(c.precio_base)} | ${c.cantidad_fotos} |`).join('\n')}

| Accesorio | Alquiler | Compra |
|---|---|---|
${d.accesorios.filter((a) => a.activo).map((a) => `| ${a.nombre} | ${dinero(a.precio)} | ${a.precio_compra == null ? 'Sin precio cargado' : dinero(a.precio_compra)} |`).join('\n')}

**Niños: talles 4 al 16, confirmados por vos.** No hay todavía modelos, fotos, precios ni disponibilidad específica infantil en el catálogo. Ese rango no debe presentarse como una garantía de stock para cualquier fecha o modelo. La edad tampoco equivale automáticamente al talle.

## Atención y agenda

- Alquiler y prueba: España 764, Rosario.
- Lunes a viernes: 10 a 19. Sábado: 9:30 a 18:30.
- **Domingos cerrado**, confirmado por vos. La fila del domingo ya estaba desactivada; sus horas guardadas no significan que esté abierto.
- WhatsApp puede recibir consultas fuera del horario de atención presencial.
- Franjas de turnos: lunes a viernes de 10 a 14 y de 14 a 19; sábado de 9:30 a 12 y de 13:15 a 18:30.
- Hay tres probadores en la configuración; Lucía tiene dos habilitados. La capacidad de cada franja y los bloqueos también se respetan.
- Los comienzos se organizan cada 15 minutos. La configuración permite simultáneos el sábado.
- Duraciones: invitado, novio y graduado 45 minutos; doble 90; triple 120; prueba final 15.
- Configuración de reserva para urgencias: siete días. Aviso al equipo por proximidad del turno: 30 minutos.
- La disponibilidad real se calcula al consultar: no se deduce solamente del horario general.
- El destino actual de las reservas es el calendario del panel. La conexión con Google Calendar está pausada en este proyecto.

## Qué recuerda de cada cliente

Teléfono, nombre, correo, evento, fecha del evento, rol de quien usa el traje, si es de día o noche, talle aproximado, ciudad, color preferido y presupuesto mencionado. También conserva notas, historial de conversación y turnos.

Solo debe guardar lo que el cliente contó. Los datos del evento y las preferencias ayudan a asesorar, pero no son obligatorios para reservar una visita.

## Acciones disponibles

Las 14 funciones están habilitadas en la configuración leída:

${Object.entries(funciones).map(([k,v]) => `- **${k}:** ${v}`).join('\n')}

Puede trabajar con mensajes de texto, audios transcritos y fotos recibidas. Una imagen ayuda a entender la consulta, pero no confirma stock. Los adjuntos no soportados o audios incomprensibles requieren aclaración.

El personal puede intervenir, responder, tomar una charla y devolverla a Lucía. También dispone de fichas, notas, etiquetas y atención de derivaciones.

## Cuándo pasa la consulta al equipo

Antes de negar un producto, talle, servicio o disponibilidad; cuando falta un dato o hay contradicciones; ante reclamos, prendas dañadas o manchadas, pedidos expresos de hablar con una persona, descuentos fuera de las condiciones aprobadas y eventos urgentes. Los pedidos corporativos se notifican al equipo y pueden seguir completándose con los datos del pedido.

No debe inventar precios, sumar importes para crear un total no cargado, confirmar stock por una foto, pedir números de tarjeta, cobrar por WhatsApp ni enviar enlaces de pago.

## Automatizaciones existentes

El proyecto contiene recordatorios previos a la visita, confirmación de asistencia, agradecimiento con reseña, recontactos y avisos para el personal. Los envíos programados tienen controles para evitar duplicados y horarios inapropiados. Su código contempla recordatorios dentro de las 18 horas previas y recontactos a uno y tres días, sujetos a condiciones.

En esta revisión no se verificó que todas esas automatizaciones estén activas ni que sus plantillas estén habilitadas para enviar. No se hicieron envíos a clientes.

## Enlaces cargados

${d.enlaces.filter((e) => e.activo).map((e) => `- ${e.nombre}: ${e.url}`).join('\n')}

El enlace antiguo de turnos sigue guardado, pero la reserva solicitada se hace dentro del calendario del panel.

## Información completa de la base de conocimiento

Las siguientes fichas incluyen la corrección infantil y las explicaciones trasladadas fuera del mensaje principal. Son material de consulta, no un texto que Lucía tenga que enviar completo. Los guiones de preguntas nunca deben frenar una reserva con teléfono, fecha y hora.

${fragmentos.sort((a,b) => a.tema.localeCompare(b.tema) || a.titulo.localeCompare(b.titulo)).map((f) => `### ${f.titulo}\n\nTema: ${f.tema}.\n\n${f.texto}`).join('\n\n')}

## Datos pendientes y precauciones al responder

- Faltan modelos, colores, fotos, precios y existencias concretas de los talles infantiles. Lucía sabe el rango 4–16; para lo demás consulta o deriva.
- Los cinco modelos cargados no tienen descripción detallada. No debe inventar tela, corte o características.
- Faltan precios de compra de accesorios.
- El catálogo no demuestra disponibilidad de una prenda para una fecha.
- La ficha de compra incluye locales físicos y un precio inicial, pero el comportamiento anterior de venta empujaba siempre hacia la web. El nuevo mensaje indica consultar la ficha; se conserva el envío del enlace de venta, evitando repetirlo.
- Las penalidades de alquiler son una política general cargada. El importe que corresponda a un caso lo decide el equipo.
- Las condiciones del negocio deben mantenerse en sus pantallas correspondientes para que una modificación no deje versiones diferentes.

## Comprobaciones

Se validaron reservas sin nombre ni correo, actualización del mismo turno, lista única, búsqueda de talles infantiles, derivación antes de negativas, cierres de cortesía y lectura de mensajes. Las comprobaciones de base usan datos ficticios y revierten los cambios. El panel compiló correctamente.

El 2 de octubre se autorizó y realizó la prueba con la IA real. Pasaron la reserva sin nombre/correo, la actualización posterior sin duplicarla, el agradecimiento sin repetición, la pregunta por horario faltante, los talles infantiles 4–16 y la derivación por producto no confirmado. Se corrigieron cuatro fallas detectadas: año ausente en el contexto, otros días presentados como cerrados, resumen perdido cuando el modelo no agregaba texto y talles infantiles confundidos con precios. También se aclaró que la fecha de visita no es la del evento.

La revisión visual completa requiere iniciar sesión. Las pruebas no enviaron WhatsApp y revirtieron todos sus datos. Esta entrega no debe interpretarse como una publicación en producción.
`;
writeFileSync(new URL('../docs/LUCIA-INFORMACION-COMPLETA.md', import.meta.url), textos);
console.log(`Informe generado con ${fragmentos.length} fichas de conocimiento.`);
