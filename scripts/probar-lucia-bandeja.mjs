// Pruebas deterministas: todo queda dentro de una transacción que se revierte.
// No llama a IA, no manda WhatsApp, no encola trabajos.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { validarPrompt } from './armar-prompt.mjs';
import { buscarFragmentos } from '../supabase/functions/_shared/conocimiento/busqueda.ts';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const { Client } = require('pg');
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;
try {
  await q('begin');
  await q("set local lock_timeout = '5s'");
  await q("set local otto.sin_disparo = 'on'");
  for (const f of ['0074_reserva_datos_minimos.sql', '0075_resumen_turno_datos_opcionales.sql', '0076_conocimiento_talles_y_derivacion.sql', '0077_bandeja_lecturas.sql', '0078_prompt_consulta_por_tema.sql', '0079_domingo_cerrado.sql']) {
    await q(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
  }
  const [{ texto }] = await q('select prompt_vigente() texto');
  assert.deepEqual(validarPrompt(texto), []);
  assert(texto.includes('Solo necesitás teléfono'));
  assert(!texto.includes('No trabajamos talles de niño'));
  assert(!texto.includes('ofrecés lo que sí hay'));
  assert.equal((await q('select activo from horarios where dia_semana=0'))[0].activo, false);
  for (const consulta of ['niños', 'nene', 'talle 4', 'talle 16', 'chicos']) {
    const r = await buscarFragmentos({ consulta: q }, { seccion: 'talles', consulta });
    assert(r.encontrados.some((f) => f.texto.includes('del 4 al 16')), consulta);
    assert(!r.encontrados.some((f) => f.texto.includes('no tenemos nada')), consulta);
  }
  console.log('Conocimiento infantil y prompt: correctos.');
  const uid = randomUUID();
  await q("insert into auth.users(id, email) values ($1, $2)", [uid, `prueba-${uid}@example.invalid`]);
  await q("insert into perfiles(id,nombre,estado) values ($1,'Prueba lectura','aprobado') on conflict(id) do update set estado='aprobado'", [uid]);
  const [{ id: cliente }] = await q('insert into clientes(telefono) values ($1) returning id', [`+549${Date.now()}`]);
  const [{ id: c1 }] = await q('insert into conversaciones(cliente_id) values ($1) returning id', [cliente]);
  const [{ id: c2 }] = await q("insert into conversaciones(cliente_id, estado) values ($1, 'cerrada') returning id", [cliente]);
  const mensaje = async (c, dir, fecha) => (await q("insert into mensajes(conversacion_id, direccion, contenido, enviado_at) values ($1,$2,'Prueba aislada',$3) returning id", [c, dir, fecha]))[0].id;
  const m1 = await mensaje(c1, 'entrante', '2026-10-01T12:00:00Z');
  const m2 = await mensaje(c1, 'entrante', '2026-10-01T12:01:00Z');
  const otro = await mensaje(c2, 'entrante', '2026-10-01T12:02:00Z');
  const salida = await mensaje(c1, 'saliente', '2099-10-01T12:03:00Z');
  const [{ ultimo_mensaje_at }] = await q('select ultimo_mensaje_at from conversaciones where id=$1', [c1]);
  assert.equal(new Date(ultimo_mensaje_at).toISOString(), '2099-10-01T12:03:00.000Z');
  await q('set local role authenticated');
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  const pendientes = () => q('select * from bandeja_no_leidos($1::uuid[])', [[c1, c2]]);
  assert.equal(Number((await pendientes()).find((r) => r.conversacion_id === c1).cantidad), 2);
  const [{ n }] = await q('select bandeja_marcar_leida($1,$2::uuid[]) n', [c1, [m1, otro, salida]]);
  assert.equal(n, 1, 'solo lee entrantes de la conversación elegida');
  assert.equal(Number((await pendientes()).find((r) => r.conversacion_id === c1).cantidad), 1, 'el mensaje no cargado sigue pendiente');
  assert.equal(Number((await pendientes()).find((r) => r.conversacion_id === c2).cantidad), 1);
  assert.equal((await q('select bandeja_marcar_leida($1,$2::uuid[]) n', [c1, [m1]]))[0].n, 0);
  await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: randomUUID(), role: 'authenticated' })]);
  assert.equal((await pendientes()).length, 0);
  await q('savepoint permiso');
  await assert.rejects(q('select bandeja_marcar_leida($1,$2::uuid[])', [c1, [m2]]), { code: '42501' });
  await q('rollback to savepoint permiso');
  console.log('Bandeja: conteo, lectura compartida, mensajes nuevos, orden y permisos correctos.');
} finally { await db.query('rollback'); await db.end(); }
console.log('Todos los cambios de prueba revertidos.');
