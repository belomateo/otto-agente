// Validación del prompt base con el generador de `agente` (scripts/armar-prompt.mjs, H1.3).
// El panel no reimplementa las reglas del generador: las corre. Dos validadores que dicen
// cosas distintas son peores que uno.
//
// Contrato del generador (rama agente, H1.3):
//   node scripts/armar-prompt.mjs --plantilla <archivo> --solo-validar
//   Arma el prompt con esa plantilla más reglas_agente y contexto_agente leídos de la base
//   (SUPABASE_DB_URL del .env de la raíz: por eso corre parado en la raíz del repo) y lo valida
//   sin escribir nada. Código 0 si pasa; 1 y los motivos por stderr, uno por línea, si no.
// El prompt base que edita el dueño ES esa plantilla: lleva {{REGLAS_NUMERADAS}} y
// {{CONTEXTO:clave}}, que el generador completa. Lo que rechaza es lo que queda sin resolver,
// más de 300 líneas, reglas sin numerar, una primera línea que no empiece con "Sos Lucía," y
// datos del negocio (precios, horarios, links, duraciones) escritos en el texto.
// Mientras el generador no exista en este checkout, el prompt base no se puede guardar (503):
// nunca se activa un prompt que no pasó el generador (PROCESOS.md § 8).
import 'server-only';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function rutaGenerador(): string {
  // El panel corre parado en panel/: el generador está en la raíz del repo. El comentario
  // turbopackIgnore evita que el rastreo de archivos del build meta el repo entero en el
  // bundle del servidor por esta ruta armada en tiempo de ejecución.
  return (
    process.env.ARMAR_PROMPT_SCRIPT ||
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..', 'scripts', 'armar-prompt.mjs')
  );
}

export async function validarPromptBase(texto: string): Promise<{ status: number; mensaje: string } | null> {
  const script = rutaGenerador();
  if (!existsSync(/*turbopackIgnore: true*/ script)) {
    return {
      status: 503,
      mensaje:
        'Todavía no se puede validar el prompt base: falta el generador (scripts/armar-prompt.mjs, hito 1.3 de agente). No se guardó nada.',
    };
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'prompt-base-'));
  const archivo = path.join(dir, 'plantilla.md');
  try {
    await writeFile(archivo, texto.replace(/\r\n?/g, '\n'), 'utf8');
    const r = await new Promise<{ codigo: number; salida: string }>((resolve) => {
      execFile(
        process.execPath,
        [script, '--plantilla', archivo, '--solo-validar'],
        { cwd: path.resolve(path.dirname(script), '..'), timeout: 30_000, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          const codigo = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
          resolve({ codigo, salida: String(stderr || stdout || err?.message || '').trim() });
        }
      );
    });
    if (r.codigo === 0) return null;
    return { status: 422, mensaje: `El generador rechazó el prompt: ${r.salida.slice(0, 2000) || 'sin detalle'}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
