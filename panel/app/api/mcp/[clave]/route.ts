// Conector MCP de Sofía (13/11): la dirección que se carga en Claude como «conector personalizado».
// https://<panel>/api/mcp/<MCP_SOFIA_CLAVE>. La clave larga en la dirección es lo que deja entrar: quien no la tiene
// recibe 404. Transporte: MCP «Streamable HTTP» sin streaming (cada pedido JSON-RPC se contesta con un JSON).
// Las herramientas y su sesión: lib/mcp. No pasa por el middleware de cookies (ver middleware.ts).
import { timingSafeEqual } from 'node:crypto';
import { HERRAMIENTAS, ejecutarHerramienta } from '@/lib/mcp/herramientas';
import { sesionDeSofia } from '@/lib/mcp/sesion';

export const dynamic = 'force-dynamic';

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCCIONES =
  'Sos el asistente de Sofía, dueña de Otto Su Misura (alquiler de trajes, Rosario). Con estas herramientas ve y maneja el ' +
  'sistema de turnos y la información que usa Lucía (la asistente que atiende el WhatsApp). Hablale en castellano rioplatense, ' +
  'simple y corto. Antes de CUALQUIER cambio (crear, mover, cancelar, cerrar un día, bloquear, corregir un dato, volver atrás) ' +
  'contale exactamente qué vas a hacer y esperá su OK. Para corregir un dato, leelo primero y mostrale el antes y el después. ' +
  'Si se equivoca, se puede volver atrás con el historial. Las fechas y horas son de Rosario (-03:00). No inventes datos: ' +
  'si una herramienta devuelve un error, contale qué dijo el sistema.';

function claveValida(clave: string): boolean {
  const esperada = process.env.MCP_SOFIA_CLAVE ?? '';
  if (esperada.length < 32) return false; // sin una clave larga configurada, el conector no existe
  const a = Buffer.from(clave);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Pedido = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Pedido['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const mal = (id: Pedido['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function atender(p: Pedido) {
  const esNotificacion = p.id === undefined;
  switch (p.method) {
    case 'initialize': {
      const pedida = String(p.params?.protocolVersion ?? '');
      return ok(p.id, {
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'otto-su-misura', title: 'Otto Su Misura · Sofía', version: '1.0.0' },
        instructions: INSTRUCCIONES,
      });
    }
    case 'ping':
      return ok(p.id, {});
    case 'tools/list':
      return ok(p.id, { tools: HERRAMIENTAS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
    case 'tools/call': {
      const nombre = String(p.params?.name ?? '');
      const args = (p.params?.arguments ?? {}) as Record<string, unknown>;
      let sesion;
      try {
        sesion = await sesionDeSofia();
      } catch (e) {
        return ok(p.id, { content: [{ type: 'text', text: (e as Error).message }], isError: true });
      }
      const r = await ejecutarHerramienta(nombre, args, sesion);
      return ok(p.id, { content: [{ type: 'text', text: r.texto }], isError: r.error });
    }
    default:
      return esNotificacion ? null : mal(p.id, -32601, `Método no soportado: ${p.method}`);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ clave: string }> }) {
  const { clave } = await ctx.params;
  if (!claveValida(clave)) return new Response('Not found', { status: 404 });
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json(mal(null, -32700, 'JSON inválido'), { status: 400 });
  }
  const lote = Array.isArray(cuerpo);
  const pedidos = (lote ? cuerpo : [cuerpo]) as Pedido[];
  const respuestas = (await Promise.all(pedidos.map((p) => atender(p)))).filter((r) => r !== null);
  if (respuestas.length === 0) return new Response(null, { status: 202 });
  return Response.json(lote ? respuestas : respuestas[0], { headers: { 'Cache-Control': 'no-store' } });
}

// Sin streaming del lado del servidor: GET (SSE) y DELETE (cerrar sesión) no se usan.
export async function GET(_request: Request, ctx: { params: Promise<{ clave: string }> }) {
  const { clave } = await ctx.params;
  if (!claveValida(clave)) return new Response('Not found', { status: 404 });
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
export const DELETE = GET;
