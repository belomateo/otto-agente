import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { enviarImagen, enviarTexto } from "./enviar.ts";

const CFG = { token: "tok-prueba", phoneNumberId: "123" };

function metaDoble(respuesta: () => Response) {
  const pedidos: { url: string; auth: string | null; cuerpo: Record<string, unknown> }[] = [];
  const fetcher = ((url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), auth: new Headers(init?.headers).get("Authorization"), cuerpo: JSON.parse(String(init?.body)) });
    return Promise.resolve(respuesta());
  }) as typeof fetch;
  return { fetcher, pedidos };
}

const ok = () => Response.json({ messages: [{ id: "wamid.OK" }] });

Deno.test("enviarTexto: POST al número de la cuenta, con el token y el texto; devuelve el wamid", async () => {
  const meta = metaDoble(ok);
  assertEquals(await enviarTexto(CFG, "5493410000001", "hola", meta.fetcher), "wamid.OK");
  const [p] = meta.pedidos;
  assertEquals(p.url, "https://graph.facebook.com/v21.0/123/messages");
  assertEquals(p.auth, "Bearer tok-prueba");
  assertEquals(p.cuerpo, { messaging_product: "whatsapp", to: "5493410000001", type: "text", text: { body: "hola" } });
});

Deno.test("enviarImagen: la foto va por link", async () => {
  const meta = metaDoble(ok);
  await enviarImagen(CFG, "5493410000001", "https://x.supabase.co/storage/v1/object/public/catalogo/a.png", meta.fetcher);
  assertEquals(meta.pedidos[0].cuerpo, {
    messaging_product: "whatsapp",
    to: "5493410000001",
    type: "image",
    image: { link: "https://x.supabase.co/storage/v1/object/public/catalogo/a.png" },
  });
});

Deno.test("si Meta responde con error o sin id, tira con el detalle", async () => {
  const caida = metaDoble(() => Response.json({ error: { message: "Re-engagement message" } }, { status: 400 }));
  await assertRejects(() => enviarTexto(CFG, "5493410000001", "hola", caida.fetcher), Error, "Re-engagement message");
  const sinId = metaDoble(() => Response.json({ messages: [] }));
  await assertRejects(() => enviarImagen(CFG, "5493410000001", "https://x/a.png", sinId.fetcher), Error, "no devolvió el id");
});
