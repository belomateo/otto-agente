-- 0001_base.sql — clientes, conversaciones, mensajes, notas, bitácora, derivaciones
-- Fase 0 (logica). Ver STACK.md § 2.

create extension if not exists pgcrypto with schema extensions;

create table clientes (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique,
  nombre text,
  email text,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create table conversaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  canal text not null default 'whatsapp',
  estado text not null default 'activa'
    check (estado in ('activa', 'derivada', 'cerrada')),
  iniciado_at timestamptz not null default now(),
  ultimo_mensaje_at timestamptz
);
create index conversaciones_cliente_id_idx on conversaciones(cliente_id);
create index conversaciones_estado_idx on conversaciones(estado);

-- direccion: 'entrante' (cliente -> Lucía) | 'saliente' (Lucía/equipo -> cliente)
-- wa_message_id único = base de la idempotencia del webhook (control de Fase 0).
create table mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  wa_message_id text unique,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  tipo text not null default 'texto',
  contenido text,
  enviado_at timestamptz not null default now()
);
create index mensajes_conversacion_id_idx on mensajes(conversacion_id);

-- Notas manuales del equipo sobre un cliente (libre, no confundir con notas_dueno de 0003).
create table notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  autor text not null,
  texto text not null,
  creado_at timestamptz not null default now()
);
create index notas_cliente_id_idx on notas(cliente_id);

-- Bitácora de lo que hizo/pensó Lucía en cada turno (principio 9: la verdad es la base).
-- tipo coincide 1:1 con PasoBitacora del componente ui-otto/Bitacora.tsx del panel (H1.1/H1.2),
-- más 'herramienta' y 'derivacion' que el mock del panel no necesitaba mostrar todavía.
create table eventos_agente (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  tipo text not null
    check (tipo in ('ok', 'error', 'pensamiento', 'herramienta', 'derivacion')),
  detalle jsonb not null default '{}'::jsonb,
  creado_at timestamptz not null default now()
);
create index eventos_agente_conversacion_id_idx on eventos_agente(conversacion_id);

create table derivaciones (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  motivo text not null,
  destino_tel text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'atendida')),
  creado_at timestamptz not null default now(),
  atendida_at timestamptz,
  atendida_por text
);
create index derivaciones_estado_idx on derivaciones(estado);
