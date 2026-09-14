-- 0013_negocio_herramientas.sql — hito 1.9 (paneles). Las herramientas de Lucía como
-- dato editable desde Configuración › Herramientas (PROCESOS.md § 5): el dueño puede
-- activar/desactivar cada una y editar la descripción que el modelo lee. El schema y las
-- precondiciones viven en código (`_shared/herramientas/<nombre>.ts`, rol `agente`, H1.4)
-- y no se tocan desde acá.
--
-- Los nombres son los 13 de AGENTE.md § 4 (los mismos que H1.4). Las descripciones
-- iniciales salen de esa misma tabla; son el punto de partida que el dueño edita.
-- Idempotente: si una herramienta ya está cargada, no se pisa lo que el dueño editó.

create table if not exists herramientas_agente (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('consulta', 'accion')),
  descripcion text not null,
  activa boolean not null default true,
  orden int not null default 0,
  version int not null default 1,
  editado_por text,
  editado_at timestamptz not null default now()
);
drop trigger if exists trg_historial on herramientas_agente;
create trigger trg_historial before update on herramientas_agente
  for each row execute function historial_antes_de_editar();

alter table herramientas_agente enable row level security;
drop policy if exists herramientas_agente_aprobados on herramientas_agente;
create policy herramientas_agente_aprobados on herramientas_agente for all
  using (es_usuario_aprobado()) with check (es_usuario_aprobado());

insert into herramientas_agente (nombre, tipo, orden, descripcion) values
  ('buscar_informacion', 'consulta', 1,
   'Busca fragmentos de la base de conocimiento por tema. Obligatoria antes de afirmar cualquier política, horario, condición o "qué incluye".'),
  ('consultar_catalogo', 'consulta', 2,
   'Devuelve los modelos de alquiler: nombre, colores, talles, precio base y fotos. Obligatoria antes de decir un precio o describir un modelo. Todo precio va con la aclaración de que incluye sastrería y tintorería.'),
  ('consultar_accesorios', 'consulta', 3,
   'Devuelve camisa, corbata, cinturón y zapatos con precio de alquiler y opción de compra. Solo cuando el cliente pregunta o al ofrecer el look completo.'),
  ('buscar_horarios', 'consulta', 4,
   'Devuelve los huecos reales por probador, ya filtrados por horario laboral. Obligatoria antes de ofrecer un horario. Se ofrecen dos, nunca más de tres.'),
  ('ver_turnos_cliente', 'consulta', 5,
   'Devuelve los turnos del cliente. Ya vienen en el contexto: se llama solo si acaba de crear o mover uno en este mismo turno.'),
  ('agendar_turno', 'accion', 6,
   'Agenda un turno en el local. Necesita fecha y hora de un hueco devuelto por buscar_horarios, tipo de turno, nombre, teléfono, evento y fecha del evento. Crea el turno en la agenda y confirma al cliente con dirección y mapa.'),
  ('reprogramar_turno', 'accion', 7,
   'Mueve un turno existente del cliente a otro hueco válido. Nunca crea uno nuevo encima.'),
  ('cancelar_turno', 'accion', 8,
   'Cancela un turno del cliente y anota el motivo.'),
  ('guardar_datos_cliente', 'accion', 9,
   'Guarda o actualiza la ficha del cliente: evento, fecha, rol, día o noche, talle aproximado, ciudad, color preferido, presupuesto mencionado.'),
  ('anotar', 'accion', 10,
   'Deja una nota libre en la libreta del cliente.'),
  ('enviar_fotos', 'accion', 11,
   'Manda las fotos de hasta 3 modelos del catálogo, desde los links cargados en cada ficha.'),
  ('enviar_link', 'accion', 12,
   'Manda un link de la casa: mapa, reseña de Google o web.'),
  ('derivar_a_persona', 'accion', 13,
   'Pasa la conversación a una persona del equipo con un motivo y, si corresponde, un mensaje al cliente sin preguntas. Corta el turno.')
on conflict (nombre) do nothing;
