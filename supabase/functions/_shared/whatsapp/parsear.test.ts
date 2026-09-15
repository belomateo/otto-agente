import { assertEquals } from "jsr:@std/assert@1";
import { mensajesEntrantes } from "./parsear.ts";

const envolver = (value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1383999293336203", changes: [{ field: "messages", value }] }],
});

const metadata = { display_phone_number: "5493417519525", phone_number_id: "1292848483914840" };

Deno.test("mensaje de texto: telefono, nombre del contacto, contenido y hora", () => {
  const payload = envolver({
    messaging_product: "whatsapp",
    metadata,
    contacts: [{ profile: { name: "Franco" }, wa_id: "5493410000000" }],
    messages: [{ from: "5493410000000", id: "wamid.A1", timestamp: "1757700000", type: "text", text: { body: "hola, precio del alquiler?" } }],
  });
  const [m] = mensajesEntrantes(payload);
  assertEquals(m.waMessageId, "wamid.A1");
  assertEquals(m.telefono, "5493410000000");
  assertEquals(m.nombre, "Franco");
  assertEquals(m.tipo, "texto"); // en la base el tipo va en castellano: lo lee así agruparRafaga
  assertEquals(m.contenido, "hola, precio del alquiler?");
  assertEquals(m.enviadoAt, new Date(1757700000 * 1000).toISOString());
});

Deno.test("aviso de estado (sent/delivered/read): no genera mensajes", () => {
  const payload = envolver({
    messaging_product: "whatsapp",
    metadata,
    statuses: [{ id: "wamid.SALIENTE", status: "delivered", timestamp: "1757700001", recipient_id: "5493410000000" }],
  });
  assertEquals(mensajesEntrantes(payload), []);
});

Deno.test("respuesta a un botón de plantilla: el texto del botón y el crudo con su payload", () => {
  const payload = envolver({
    messaging_product: "whatsapp",
    metadata,
    messages: [{ from: "5493410000000", id: "wamid.B1", timestamp: "1757700002", type: "button", button: { text: "Confirmo", payload: "confirmar:turno-123" } }],
  });
  const [m] = mensajesEntrantes(payload);
  assertEquals(m.tipo, "button");
  assertEquals(m.contenido, "Confirmo");
  assertEquals((m.crudo.button as Record<string, unknown>).payload, "confirmar:turno-123");
  assertEquals(m.nombre, null);
});

Deno.test("foto sin epígrafe: tipo image y contenido null", () => {
  const payload = envolver({
    messaging_product: "whatsapp",
    metadata,
    messages: [{ from: "5493410000000", id: "wamid.C1", timestamp: "1757700003", type: "image", image: { id: "media-1", mime_type: "image/jpeg" } }],
  });
  const [m] = mensajesEntrantes(payload);
  assertEquals([m.tipo, m.contenido], ["image", null]);
});

Deno.test("una reacción (👍) o un aviso del sistema no entran: no son mensajes para contestar", () => {
  const payload = envolver({
    messaging_product: "whatsapp",
    metadata,
    messages: [
      { from: "5493410000000", id: "wamid.R1", timestamp: "1757700006", type: "reaction", reaction: { message_id: "wamid.SALIENTE", emoji: "👍" } },
      { from: "5493410000000", id: "wamid.S1", timestamp: "1757700007", type: "system", system: { body: "cambió de número", type: "customer_changed_number" } },
      { from: "5493410000000", id: "wamid.T1", timestamp: "1757700008", type: "text", text: { body: "gracias" } },
    ],
  });
  assertEquals(mensajesEntrantes(payload).map((m) => m.waMessageId), ["wamid.T1"]);
});

Deno.test("dos mensajes en el mismo POST: salen los dos, en orden", () => {
  const payload = envolver({
    messaging_product: "whatsapp",
    metadata,
    messages: [
      { from: "5493410000000", id: "wamid.D1", timestamp: "1757700004", type: "text", text: { body: "hola" } },
      { from: "5493410000000", id: "wamid.D2", timestamp: "1757700005", type: "text", text: { body: "es para un casamiento" } },
    ],
  });
  assertEquals(mensajesEntrantes(payload).map((m) => m.waMessageId), ["wamid.D1", "wamid.D2"]);
});

Deno.test("payload que no es de WhatsApp, vacío o con mensajes sin id: nada", () => {
  assertEquals(mensajesEntrantes({ object: "page", entry: [] }), []);
  assertEquals(mensajesEntrantes(null), []);
  assertEquals(mensajesEntrantes("texto"), []);
  const sinId = envolver({ messaging_product: "whatsapp", metadata, messages: [{ from: "5493410000000", type: "text", text: { body: "x" } }] });
  assertEquals(mensajesEntrantes(sinId), []);
});
