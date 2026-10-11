// Lo común de las pruebas de los ayudantes de Lucía (trabajo 5, pedido de Mateo, 10/10): los modelos
// que trabajan al lado del principal, cada uno con su prueba. Hoy son dos: el fichero (extractor.ts,
// LLM_EXTRACTOR) y el transcriptor (transcripcion.ts, LLM_TRANSCRIPCION). El auditor de promesas lo
// arma otra persona en otra rama: su prueba va en tests/subagentes/auditor.test.ts, con este mismo
// molde (parte simulada siempre, parte con el modelo real solo si se pide).
//
// Dos partes en cada archivo:
//  · Simulada (corre siempre): sin base y sin red. OpenAI es un fetcher de mentira y la base, una
//    BaseEnMemoria (abajo). Por si algún camino se olvida el fetcher y sale con el fetch de verdad,
//    `simulada()` lo reemplaza por uno que revienta: una prueba simulada nunca gasta un peso.
//  · Con el modelo real (PRUEBA_MODELO_REAL=1): pocos casos chicos, para ver que el modelo entiende
//    la instrucción. Cuesta centavos y depende de OpenAI: no corre sola.
//
// Correr (desde la raíz del repo):
//   env -u OPENAI_API_KEY deno test tests/subagentes --allow-all --env-file=.env --no-lock --node-modules-dir=none
//   env -u OPENAI_API_KEY PRUEBA_MODELO_REAL=1 deno test tests/subagentes --allow-all --env-file=.env --no-lock --node-modules-dir=none
// El `env -u` va en las dos: en esta máquina OPENAI_API_KEY del entorno es la de Ollama y tapa la del
// .env (--env-file no pisa lo que ya está definido), así que sin él la parte real le pegaría a OpenAI
// con una clave que no es suya.

import type { Db, Fila } from "../../supabase/functions/_shared/db.ts";

export const MODELO_REAL = Deno.env.get("PRUEBA_MODELO_REAL") === "1";

// Antes de la parte real: que la clave sea de OpenAI y no la de Ollama del entorno (mismo control que
// scripts/ejecutar-prueba-real.mjs). Sin esto, la clave de otro proveedor viajaría a api.openai.com.
export function exigirClaveDeOpenAI() {
  if (!(Deno.env.get("OPENAI_API_KEY") ?? "").startsWith("sk-")) {
    throw new Error("La OPENAI_API_KEY del entorno no es de OpenAI: corré con `env -u OPENAI_API_KEY` para que se use la del .env.");
  }
}

// Una prueba simulada: sin red (fetch revienta) y con una clave de mentira si no hay ninguna (apiKey()
// tira sin clave, y eso es otra prueba). Si hay una clave de verdad en el entorno no se usa para nada:
// todos los pedidos van a fetchers de mentira.
export function simulada(nombre: string, fn: () => Promise<void> | void) {
  Deno.test(nombre, async () => {
    const fetchDeVerdad = globalThis.fetch;
    const habiaClave = Deno.env.get("OPENAI_API_KEY") !== undefined;
    globalThis.fetch = ((url: string | URL | Request) => {
      throw new Error(`una prueba simulada quiso salir a la red: ${url instanceof Request ? url.url : String(url)}`);
    }) as typeof fetch;
    if (!habiaClave) Deno.env.set("OPENAI_API_KEY", "clave-de-prueba-simulada");
    try {
      await fn();
    } finally {
      globalThis.fetch = fetchDeVerdad;
      if (!habiaClave) Deno.env.delete("OPENAI_API_KEY");
    }
  });
}

// Respuesta de Chat Completions como la arma OpenAI (lo que lee cliente.ts).
export function respuestaChat(contenido: string | null, uso = { prompt_tokens: 100, completion_tokens: 20 }): Response {
  return Response.json({
    choices: [{ message: { content: contenido } }],
    usage: { ...uso, prompt_tokens_details: { cached_tokens: 0 } },
  });
}

export const FICHA_NULA = {
  nombre: null, evento: null, fecha_evento: null, rol: null, dia_o_noche: null, talle_aprox: null, ciudad: null,
  color_preferido: null, presupuesto_mencionado: null, email: null,
};

// ── Base en memoria ─────────────────────────────────────────────────────────────────────────
// Lo justo para correr un turno entero (correrTurno) o una ráfaga (agruparRafaga) sin Postgres: cada
// consulta conocida se contesta con lo que la prueba cargó; cualquier otra devuelve [] (sin horarios,
// sin turnos, sin enlaces, sin feriados: el turno sigue igual) y queda anotada en `sinResolver`, para
// ver qué faltó si algún día una prueba se comporta raro. Las escrituras quedan registradas para
// poder mirar qué hizo el turno, igual que se mira la base en las pruebas de tests/herramientas.

export type MensajeEnMemoria = {
  id: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  contenido: string | null;
  enviado_at: string;
  transcripcion?: string | null;
  adjunto_estado?: string | null;
  adjunto_path?: string | null;
  adjunto_mime?: string | null;
  adjunto_segundos?: number | null;
  adjunto_voz?: boolean | null;
  adjunto_detalle?: string | null;
};

const unaLinea = (sql: string) => sql.replace(/\s+/g, " ").trim();
const ms = (v: unknown) => new Date(String(v)).getTime();

export class BaseEnMemoria implements Db {
  mensajes: MensajeEnMemoria[] = [];
  ficha: Record<string, string | null> = { ...FICHA_NULA };
  // tema → texto (fragmentos activos de la base de conocimiento)
  fragmentos: Record<string, string> = {};
  // catalogo_alquiler.precio_base de los modelos activos
  precios: number[] = [];
  // contexto_agente: clave → valor (los textos fijos)
  textos: Record<string, string> = {};
  eventos: { tipo: string; detalle: Record<string, unknown> }[] = [];
  consumo: { modelo: string; tokensIn: number; tokensOut: number; costo: number }[] = [];
  // Cada update de la ficha, con los campos que tocó (sin editado_por).
  fichaEscrita: Record<string, unknown>[] = [];
  sinResolver: string[] = [];
  #n = 0;

  agregarMensaje(m: Omit<MensajeEnMemoria, "id"> & { id?: string }): string {
    const id = m.id ?? `00000000-0000-4000-8000-${String(++this.#n).padStart(12, "0")}`;
    this.mensajes.push({ ...m, id });
    return id;
  }

  salientes(): string[] {
    return this.mensajes.filter((m) => m.direccion === "saliente").map((m) => String(m.contenido));
  }

  consulta<T extends Fila = Fila>(sqlCrudo: string, valores: unknown[] = []): Promise<T[]> {
    return Promise.resolve(this.#resolver(unaLinea(sqlCrudo), valores) as T[]);
  }

  #resolver(sql: string, v: unknown[]): Fila[] {
    // ── mensajes ──
    if (sql.startsWith("select enviado_at from mensajes where conversacion_id = $1 and direccion = 'saliente'")) {
      const s = this.mensajes.filter((m) => m.direccion === "saliente").sort((a, b) => ms(b.enviado_at) - ms(a.enviado_at));
      return s.length ? [{ enviado_at: s[0].enviado_at }] : [];
    }
    if (sql.startsWith("select id::text as id, contenido, tipo, enviado_at from mensajes")) {
      const tipos = v[1] as string[];
      return this.mensajes
        .filter((m) => m.direccion === "entrante" && tipos.includes(m.tipo) && ms(m.enviado_at) > ms(v[2]) && ms(m.enviado_at) <= ms(v[3]))
        .sort((a, b) => ms(a.enviado_at) - ms(b.enviado_at))
        .map((m) => ({ id: m.id, contenido: m.contenido, tipo: m.tipo, enviado_at: m.enviado_at }));
    }
    if (sql.startsWith("select count(*)::int as n, count(*) filter (where tipo = 'sticker')")) {
      const f = this.mensajes.filter((m) => m.direccion === "entrante" && ms(m.enviado_at) > ms(v[1]) && ms(m.enviado_at) <= ms(v[2]));
      const ultimo = f.length ? f.map((m) => m.enviado_at).sort((a, b) => ms(b) - ms(a))[0] : null;
      return [{ n: f.length, stickers: f.filter((m) => m.tipo === "sticker").length, ultimo }];
    }
    if (sql.startsWith("select adjunto_estado, adjunto_path, adjunto_mime")) {
      const m = this.mensajes.find((x) => x.id === v[0]);
      return m
        ? [{
          adjunto_estado: m.adjunto_estado ?? null, adjunto_path: m.adjunto_path ?? null, adjunto_mime: m.adjunto_mime ?? null,
          adjunto_segundos: m.adjunto_segundos ?? null, adjunto_voz: m.adjunto_voz ?? null, adjunto_detalle: m.adjunto_detalle ?? null,
        }]
        : [];
    }
    if (sql.startsWith("update mensajes set transcripcion = $1 where id = $2")) {
      const m = this.mensajes.find((x) => x.id === v[1]);
      if (m) m.transcripcion = String(v[0]);
      return [];
    }
    if (sql.startsWith("select direccion, tipo, contenido, transcripcion from mensajes")) {
      const tipos = v[1] as string[];
      return this.mensajes
        .filter((m) => ms(m.enviado_at) <= ms(v[2]))
        .filter((m) =>
          (tipos.includes(m.tipo) && m.contenido !== null) ||
          (m.direccion === "entrante" && m.tipo === "audio" && m.transcripcion) ||
          (m.direccion === "entrante" && m.tipo === "image")
        )
        .sort((a, b) => ms(b.enviado_at) - ms(a.enviado_at))
        .slice(0, Number(v[3]))
        .map((m) => ({ direccion: m.direccion, tipo: m.tipo, contenido: m.contenido, transcripcion: m.transcripcion ?? null }));
    }
    if (sql.startsWith("select enviado_at from mensajes where conversacion_id = $1 and enviado_at <= $2")) {
      const s = this.mensajes.filter((m) => ms(m.enviado_at) <= ms(v[1])).sort((a, b) => ms(b.enviado_at) - ms(a.enviado_at));
      return s.length ? [{ enviado_at: s[0].enviado_at }] : [];
    }
    if (sql.startsWith("insert into mensajes")) {
      this.agregarMensaje({ direccion: "saliente", tipo: "texto", contenido: String(v[1]), enviado_at: String(v[2]) });
      return [];
    }
    // ── la ficha ──
    if (sql.startsWith("select nombre, evento, fecha_evento::text as fecha_evento")) return [{ ...this.ficha }];
    if (sql.startsWith("update clientes set")) {
      const set = sql.slice("update clientes set".length, sql.indexOf(" where "));
      const cambios: Record<string, unknown> = {};
      for (const [, col, n] of set.matchAll(/(\w+) = \$(\d+)/g)) if (col !== "editado_por") cambios[col] = v[Number(n) - 1];
      const distintos = Object.entries(cambios).some(([c, valor]) => this.ficha[c] !== valor);
      if (!distintos) return [];
      Object.assign(this.ficha, cambios);
      this.fichaEscrita.push(cambios);
      return [{ id: v[0] }];
    }
    // ── conocimiento, catálogo y textos fijos ──
    if (sql.startsWith("select texto from fragmentos where activo and tema = $1")) {
      const t = this.fragmentos[String(v[0])];
      return t ? [{ texto: t }] : [];
    }
    if (sql.startsWith("select precio_base::float8 as precio_base from catalogo_alquiler")) return this.precios.map((p) => ({ precio_base: p }));
    if (sql.startsWith("select valor from contexto_agente where clave = $1")) {
      const t = this.textos[String(v[0])];
      return t === undefined ? [] : [{ valor: t }];
    }
    // ── bitácora ──
    if (sql.startsWith("insert into eventos_agente")) {
      this.eventos.push({ tipo: String(v[1]), detalle: JSON.parse(String(v[2])) });
      return [];
    }
    if (sql.startsWith("insert into consumo_llm")) {
      this.consumo.push({ modelo: String(v[1]), tokensIn: Number(v[2]), tokensOut: Number(v[3]), costo: Number(v[4]) });
      return [];
    }
    this.sinResolver.push(sql.slice(0, 120));
    return [];
  }
}
