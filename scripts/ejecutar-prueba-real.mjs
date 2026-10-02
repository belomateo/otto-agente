// Ensayo autorizado del proyecto. Prioriza .env sobre variables ajenas de la computadora.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const env = { ...process.env, ...dotenv.parse(readFileSync(new URL('../.env', import.meta.url))) };
const pos = process.argv.indexOf('--modelos');
if (pos !== -1) {
  const modelos = dotenv.parse(readFileSync(process.argv[pos + 1]));
  for (const k of ['LLM_PRINCIPAL', 'LLM_CLASIFICADOR', 'LLM_EXTRACTOR']) if (!env[k]) env[k] = modelos[k];
}
for (const k of ['OPENAI_API_KEY', 'SUPABASE_DB_URL', 'LLM_PRINCIPAL', 'LLM_CLASIFICADOR', 'LLM_EXTRACTOR']) {
  if (!env[k]?.trim()) throw new Error(`Falta configurar ${k}; no se inició la prueba.`);
}
if (!env.OPENAI_API_KEY.startsWith('sk-')) throw new Error('La clave local no corresponde al proveedor de Lucía.');
console.log(`Modelos del ensayo: ${env.LLM_PRINCIPAL}, ${env.LLM_CLASIFICADOR}, ${env.LLM_EXTRACTOR}`);
const filtro = process.argv.indexOf('--filtro');
const p = spawn('deno', ['test', '--no-lock', '--node-modules-dir=none', '--allow-net', '--allow-env', '--allow-read', ...(filtro >= 0 ? ['--filter', process.argv[filtro + 1]] : []), 'scripts/probar-reserva-minima.ts'], { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
const redactar = (b) => String(b).replaceAll(env.OPENAI_API_KEY, '[clave omitida]').replace(/sk-[\w.*-]+/g, '[clave omitida]');
p.stdout.on('data', (b) => process.stdout.write(redactar(b)));
p.stderr.on('data', (b) => process.stderr.write(redactar(b)));
p.on('error', (e) => { console.error(e.message); process.exitCode = 1; });
p.on('exit', (code) => { process.exitCode = code ?? 1; });
