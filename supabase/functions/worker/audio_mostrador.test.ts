// La rama 'mostrador_audio' del worker (0109, pedido de Sofía 22/10) sin base: una base de mentira
// que contesta por el texto de la consulta y un fetch que hace de bucket y de Meta. A diferencia
// de atender.test.ts (contra la base real) corre en cualquier lado.
import { assertEquals } from "jsr:@std/assert@1.0.13";
import type { Db, Fila } from "../_shared/db.ts";
import { type Dependencias, procesarTrabajo } from "./atender.ts";

const AHORA = new Date("2026-10-22T15:00:00Z");

function armar(o: { telefono?: string; ultimoCliente?: Date; yaSalio?: string | null } = {}) {
  const updates: unknown[][] = [];
  const eventos: Record<string, unknown>[] = [];
  const db: Db = {
    consulta<T extends Fila = Fila>(q: string, v?: unknown[]): Promise<T[]> {
      let r: Fila[] = [];
      if (q.includes("from conversaciones c join clientes")) {
        r = [{ estado: "derivada", cliente_id: "c1", telefono: o.telefono ?? "5493410000001", lucia_activa: false }];
      } else if (q.startsWith("select wa_message_id from mensajes")) r = [{ wa_message_id: o.yaSalio ?? null }];
      else if (q.includes("max(enviado_at)")) r = [{ at: o.ultimoCliente ?? new Date(AHORA.getTime() - 3600_000) }];
      else if (q.startsWith("update mensajes")) updates.push([q, ...(v ?? [])]);
      else if (q.includes("eventos_agente")) eventos.push(JSON.parse(String(v?.[2])));
      return Promise.resolve(r as T[]);
    },
  };
  const envios: Record<string, unknown>[] = [];
  const fetcher = ((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/storage/v1/object/adjuntos/")) return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    if (u.endsWith("/media")) {
      envios.push({ media: (init?.body as FormData).get("type") });
      return Promise.resolve(Response.json({ id: "media-audio" }));
    }
    envios.push(JSON.parse(String(init?.body)));
    return Promise.resolve(Response.json({ messages: [{ id: "wamid.AUDIO" }] }));
  }) as typeof fetch;
  const d = {
    wa: { token: "t", phoneNumberId: "1" },
    adjuntos: { base: "https://x.supabase.co/storage/v1/object/adjuntos/", clave: "k" },
    fetcher,
    ahora: () => AHORA,
    dormir: () => Promise.resolve(),
  } as unknown as Dependencias;
  const trabajo = {
    id: "t1",
    conversacion_id: "00000000-0000-4000-8000-000000000001",
    payload: { tipo: "mostrador_audio", mensaje_id: "m1", storage_path: "mostrador/c/1-audio.ogg", mime: "audio/ogg" },
  };
  return { db, d, trabajo, updates, eventos, envios };
}

Deno.test("audio del mostrador: baja del bucket, sube a /media y sale como audio por media_id", async () => {
  const { db, d, trabajo, updates, eventos, envios } = armar();
  await procesarTrabajo(db, trabajo, d);
  assertEquals(envios[0], { media: "audio/ogg" });
  assertEquals(envios[1].type, "audio");
  assertEquals(envios[1].audio, { id: "media-audio" });
  assertEquals(updates[0].slice(1), ["m1", "wamid.AUDIO", "media-audio"]);
  assertEquals(eventos[0].etapa, "mostrador-audio");
});

Deno.test("audio del mostrador fuera de las 24 hs: no sale y queda marcado ventana_cerrada", async () => {
  const { db, d, trabajo, updates, envios } = armar({ ultimoCliente: new Date(AHORA.getTime() - 25 * 3600_000) });
  await procesarTrabajo(db, trabajo, d);
  assertEquals(envios.length, 0);
  assertEquals(String(updates[0][0]).includes("ventana_cerrada"), true);
});

Deno.test("audio del mostrador que ya salió (reintento de la cola): no se manda de nuevo", async () => {
  const { db, d, trabajo, envios } = armar({ yaSalio: "wamid.VIEJO" });
  await procesarTrabajo(db, trabajo, d);
  assertEquals(envios.length, 0);
});

Deno.test("audio del mostrador a un teléfono ficticio: simulado, no toca Meta", async () => {
  const { db, d, trabajo, envios, eventos } = armar({ telefono: "5490000000103" });
  await procesarTrabajo(db, trabajo, d);
  assertEquals(envios.length, 0);
  assertEquals(eventos[0].simulado, true);
});
