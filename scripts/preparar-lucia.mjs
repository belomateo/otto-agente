// Genera los archivos de configuración locales desde el inventario revisado. No publica.
import { readFileSync, writeFileSync } from 'node:fs';
import { armarPrompt } from './armar-prompt.mjs';
const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const guardar = (p, t) => writeFileSync(new URL(`../${p}`, import.meta.url), t);
const datos = JSON.parse(leer('docs/informes/inventario-lucia-base.json'));
const sql = (s) => `'${s.replaceAll("'", "''")}'`;
const cambios = {
  1: 'Solo explicás descuentos aprobados cuando te consultan y después de buscar sus condiciones. Nunca inventás descuentos ni autorizás excepciones: las decide el equipo.',
  2: 'Consultás la fuente del tema cuando la necesitás. Si falta información del negocio o hay contradicciones, derivás al equipo sin inventar ni afirmar que no hay.',
  4: 'Nunca pedís datos de tarjeta, ni mandás links ni datos de pago. Para explicar pagos y garantía consultás reserva-y-garantia; las operaciones las resuelve el local.',
  5: 'Agendás con teléfono, fecha y hora elegidas, comprobando disponibilidad. Nombre y correo son opcionales: los pedís después de reservar y, cuando llegan, actualizás la misma reserva con guardar_datos_cliente. El sistema manda una sola lista de datos al reservar y al actualizarlos; no la repitas ni inventes datos.',
  7: 'Antes de afirmar que falta un producto, talle, servicio o disponibilidad, derivás directamente al equipo sin enviar una negativa. Una búsqueda vacía no demuestra que no exista. No inventás disponibilidad ni ofrecés una alternativa para encubrir una negativa.',
  10: 'Para compra, envíos, ubicaciones y alcance del servicio consultás que-no-hacemos y ubicacion-horarios. No prometés una modalidad que no esté confirmada; ante dudas derivás sin negar.',
  12: 'En pedidos corporativos y uniformes el sistema avisa al equipo. Consultás que-no-hacemos para recabar los datos necesarios, sin prometer precios ni plazos y sin repetir preguntas.',
};
const reglas = datos.reglas.map((r) => ({ ...r, texto: cambios[r.numero] ?? r.texto }));
const plantilla = leer('plantilla-agente/02-prompt.md');
const baseFragmentos = leer('supabase/seeds/fragmentos.sql').split('\n-- Conocimiento adicional revisado 2026-10-01')[0].trimEnd();
const conocimiento = leer('supabase/migrations/0076_conocimiento_talles_y_derivacion.sql');
const inicioExtras = conocimiento.indexOf('INSERT INTO fragmentos');
const finExtras = conocimiento.indexOf('UPDATE reglas_agente');
guardar('supabase/seeds/fragmentos.sql', baseFragmentos + '\n\n-- Conocimiento adicional revisado 2026-10-01\n' + conocimiento.slice(inicioExtras, finExtras).trimEnd() + '\n');
const contexto = Object.fromEntries(datos.contexto.map((r) => [r.clave, r.valor]));
const { prompt, errores } = armarPrompt({ plantilla, reglas, contexto });
if (errores.length) throw new Error(errores.join('\n'));
guardar('supabase/functions/_shared/prompt.md', prompt);
guardar('supabase/seeds/reglas.sql', '-- Reglas revisadas. Las condiciones del negocio se consultan en su fuente.\n' +
  'INSERT INTO reglas_agente (numero, texto, activo, editado_por) VALUES\n' +
  reglas.map((r) => `(${r.numero}, ${sql(r.texto)}, ${r.activo}, 'Revisión Lucía 2026-10-01')`).join(',\n') +
  '\nON CONFLICT (numero) DO UPDATE SET texto = excluded.texto, activo = excluded.activo, editado_por = excluded.editado_por;\n');
guardar('supabase/migrations/0078_prompt_consulta_por_tema.sql',
  '-- Publicar junto con el worker nuevo, después de 0074–0077.\n' +
  Object.entries(cambios).map(([n, t]) => `UPDATE reglas_agente SET texto = ${sql(t)}, editado_por = 'Revisión Lucía 2026-10-01' WHERE numero = ${n};`).join('\n') +
  `\nUPDATE prompt_base SET texto = ${sql(plantilla)}, editado_at = now() WHERE unica = true;\n`);
// No conservar metadatos personales de editores en el inventario de negocio.
for (const clave of ['accesorios', 'configuracion_agenda']) {
  for (const fila of datos[clave]) { delete fila.editado_por; delete fila.creado_por; }
}
guardar('docs/informes/inventario-lucia-base.json', JSON.stringify(datos, null, 2) + '\n');
console.log(`Prompt preparado: ${prompt.trimEnd().split('\n').length} líneas. Sin publicar cambios.`);
