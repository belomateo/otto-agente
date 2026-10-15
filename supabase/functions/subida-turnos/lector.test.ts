import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { charlaParaElLector, leerAcuerdo } from "./lector.ts";

const TZ = "America/Argentina/Cordoba";
const AHORA = new Date("2026-10-14T12:00:00-03:00");
const m = (direccion: "entrante" | "saliente", contenido: string | null, hora: string, extra: Record<string, unknown> = {}) => ({
  direccion, contenido, enviadoAt: new Date(`2026-10-13T${hora}:00-03:00`), ...extra,
});

Deno.test("la charla se arma con quién habla, la hora de cada mensaje y el audio transcripto", () => {
  const t = charlaParaElLector([
    m("entrante", "Consulto si me podrían adelantar el turno", "14:40"),
    m("saliente", "[mostrador] este jueves a las 13:30 podria ser", "15:43"),
    m("entrante", null, "15:44", { transcripcion: "dale perfecto", tipo: "audio" }),
    m("saliente", "Hola Javier! Te recordamos el turno para alquilar tu traje", "09:00"),
  ], AHORA, TZ);
  assertMatch(t, /Hoy es 2026-10-14/);
  assertMatch(t, /Cliente: Consulto si me podrían adelantar/);
  assertMatch(t, /Local: este jueves a las 13:30 podria ser/);
  assertMatch(t, /Cliente: \[audio: dale perfecto\]/);
  assertEquals(t.includes("Te recordamos el turno"), false, "el recordatorio automático no es parte del acuerdo");
});

function fetchCon(contenido: string): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: contenido } }], usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } } }),
    } as unknown as Response)) as unknown as typeof fetch;
}

Deno.test("leerAcuerdo convierte la respuesta del modelo", async () => {
  Deno.env.set("LLM_EXTRACTOR", "modelo-de-prueba");
  Deno.env.set("OPENAI_API_KEY", "prueba");
  const a = await leerAcuerdo("charla", fetchCon(JSON.stringify({
    frase: "ya te agende", hay_acuerdo: true, dia: "2026-10-15", hora: "13:30", propuso: "local", acepto: "cliente",
    nombre: "Marcos", email: null, intencion_sin_hora: false, motivo: "el local propuso y el cliente aceptó",
  })));
  assertEquals(a?.hayAcuerdo, true);
  assertEquals(a?.dia, "2026-10-15");
  assertEquals(a?.hora, "13:30");
  assertEquals(a?.propuso, "local");
  assertEquals(a?.email, null);
});

Deno.test("leerAcuerdo: una respuesta que no es lo pedido devuelve null (nunca carga)", async () => {
  Deno.env.set("LLM_EXTRACTOR", "modelo-de-prueba");
  Deno.env.set("OPENAI_API_KEY", "prueba");
  assertEquals(await leerAcuerdo("charla", fetchCon("no es json")), null);
  assertEquals(await leerAcuerdo("charla", fetchCon(JSON.stringify({ frase: "x" }))), null);
});

Deno.test("leerAcuerdo: sin modelo configurado devuelve null", async () => {
  Deno.env.delete("LLM_EXTRACTOR");
  assertEquals(await leerAcuerdo("charla", fetchCon("{}")), null);
});
