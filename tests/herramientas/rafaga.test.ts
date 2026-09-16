// agrupar_rafaga (AGENTE.md § 3 paso 3), el campo soloNoTexto (supuesto #33, H2.1, 15/9) y los
// botones (auditoría de Mateo, 15/9): si lo único que llegó en la ventana no es texto (foto,
// audio, sticker...), no es lo mismo que "no pasó nada" — turno.ts lo usa para no quedarse en
// silencio. Un botón de plantilla ("Necesito reprogramar") SÍ cuenta como texto: no es una foto,
// es una frase que el cliente tocó en vez de escribir (el de "Confirmo" nunca llega acá: se
// resuelve antes, en atender.ts, sin correr el turno).

import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { agruparRafaga, MAXIMO_CARACTERES_RAFAGA } from "../../supabase/functions/_shared/turno/rafaga.ts";
import { AHORA, prueba } from "./_arnes.ts";

async function insertar(
  sql: import("npm:pg@8.13.1").Client,
  conversacionId: string,
  p: { direccion: "entrante" | "saliente"; tipo: string; contenido: string | null; enviadoAt: Date },
) {
  await sql.query(
    "insert into mensajes (conversacion_id, direccion, tipo, contenido, enviado_at) values ($1, $2, $3, $4, $5::timestamptz)",
    [conversacionId, p.direccion, p.tipo, p.contenido, p.enviadoAt.toISOString()],
  );
}

prueba("agrupar_rafaga: nada nuevo en la ventana no es soloNoTexto (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: un mensaje de texto normal no es soloNoTexto (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "hola", enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "hola");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: solo una foto sin epígrafe es soloNoTexto, sin texto", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "image", contenido: null, enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "");
  assertEquals(r.soloNoTexto, true);
  assert(r.ultimoEnviadoAt, "aunque no sea texto, la barandilla fuera_ventana_meta necesita saber cuándo escribió");
});

prueba("agrupar_rafaga: audio y sticker juntos, sin texto, siguen siendo soloNoTexto", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "audio", contenido: null, enviadoAt: AHORA });
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "sticker", contenido: null, enviadoAt: new Date(AHORA.getTime() + 1000) });
  const r = await agruparRafaga(ctx.db, conversacionId, new Date(AHORA.getTime() + 2000));
  assertEquals(r.texto, "");
  assertEquals(r.soloNoTexto, true);
});

prueba("agrupar_rafaga: una foto con epígrafe Y un mensaje de texto en la misma ráfaga: gana el texto (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "image", contenido: "esto es lo que quiero", enviadoAt: AHORA });
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "les mando la foto", enviadoAt: new Date(AHORA.getTime() + 1000) });
  const r = await agruparRafaga(ctx.db, conversacionId, new Date(AHORA.getTime() + 2000));
  assertEquals(r.texto, "les mando la foto");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: el botón «Necesito reprogramar» cuenta como texto, no como soloNoTexto", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "button", contenido: "Necesito reprogramar", enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.texto, "Necesito reprogramar");
  assertEquals(r.soloNoTexto, false);
});

prueba("agrupar_rafaga: un texto corto no se toca (caso parecido)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "hola, necesito un turno", enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.recortada, false);
  assertEquals(r.texto, "hola, necesito un turno");
});

prueba("agrupar_rafaga: una ráfaga que pasa el tope se recorta antes del clasificador y el principal (hallazgo de Mateo, 16/9)", async ({ ctx, sql, conversacionId }) => {
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "a".repeat(2000), enviadoAt: AHORA });
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: "b".repeat(2000), enviadoAt: new Date(AHORA.getTime() + 1000) });
  const r = await agruparRafaga(ctx.db, conversacionId, new Date(AHORA.getTime() + 2000));
  assertEquals(r.recortada, true);
  assertEquals([...r.texto].length, MAXIMO_CARACTERES_RAFAGA);
  // El corte cae adentro del segundo mensaje (2000 "a" + un salto de línea + 499 "b"): no se
  // pierde el principio de la ráfaga, se corta lo de más.
  assert(r.texto.endsWith("b"), "el corte cae en el segundo mensaje, no antes");
  assert(!r.texto.includes("b".repeat(2000)), "no entró el segundo mensaje completo");
});

prueba("agrupar_rafaga: un emoji justo en el borde del tope no se parte a la mitad", async ({ ctx, sql, conversacionId }) => {
  const texto = "a".repeat(MAXIMO_CARACTERES_RAFAGA - 1) + "😊😊";
  await insertar(sql, conversacionId, { direccion: "entrante", tipo: "texto", contenido: texto, enviadoAt: AHORA });
  const r = await agruparRafaga(ctx.db, conversacionId, AHORA);
  assertEquals(r.recortada, true);
  assertEquals([...r.texto].length, MAXIMO_CARACTERES_RAFAGA);
  assertEquals(r.texto, "a".repeat(MAXIMO_CARACTERES_RAFAGA - 1) + "😊");
});
