// Plantillas, botones, ventana y envío de plantillas (hito 1.14), sin base ni red.
// Correr: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/whatsapp

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import { botonDeTurno, PAYLOAD } from "./botones.ts";
import { enviarPlantilla } from "./enviar.ts";
import { armarPlantilla, primerNombre } from "./plantillas.ts";
import { puedeTextoLibre, VENTANA_MS } from "./ventana.ts";

const TZ = "America/Argentina/Cordoba";
const TURNO = "2d7f6c1e-8a3b-4c5d-9e0f-1a2b3c4d5e6f";
const CHARLA = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";

Deno.test("recordatorio: nombre, día y hora en orden, y un botón por acción con el turno", () => {
  const p = armarPlantilla("recordatorio_18h", {
    nombre: "juan pérez",
    inicio: new Date("2030-06-06T16:00:00-03:00"),
    referencia: TURNO,
    linkResena: null,
  }, TZ);
  assert(!("falta" in p));
  assertEquals(p.nombre, "recordatorio_turno_18h");
  assertEquals(p.idioma, "es_AR");
  assertEquals(p.cuerpo, ["Juan", "jueves 6 de junio", "16:00"]);
  assertEquals(p.botones, [`CONFIRMO:${TURNO}`, `REPROGRAMAR:${TURNO}`]);
  assert(p.texto.startsWith("Hola, Juan. Te recordamos tu turno en Otto Su Misura: mañana jueves 6 de junio a las 16:00"));
});

Deno.test("agradecimiento: sin el link de reseña no se arma; con el link, va como {{2}}", () => {
  const sin = armarPlantilla("agradecimiento_resena", { nombre: "Ana", inicio: null, referencia: TURNO, linkResena: null }, TZ);
  assert("falta" in sin && sin.falta.includes("reseñas"));
  const con = armarPlantilla("agradecimiento_resena", { nombre: "Ana", inicio: null, referencia: TURNO, linkResena: "https://g.page/r/x" }, TZ);
  assert(!("falta" in con));
  assertEquals(con.cuerpo, ["Ana", "https://g.page/r/x"]);
  assertEquals(con.botones, []);
});

Deno.test("recontacto: la misma plantilla para el primero y el segundo, con la charla en los botones", () => {
  for (const tipo of ["recontacto_1", "recontacto_2"] as const) {
    const p = armarPlantilla(tipo, { nombre: "MARTÍN", inicio: null, referencia: CHARLA, linkResena: null }, TZ);
    assert(!("falta" in p));
    assertEquals(p.nombre, "recontacto_turno_pendiente");
    assertEquals(p.cuerpo, ["Martín"]);
    assertEquals(p.botones, [`RECONTACTO_SI:${CHARLA}`, `RECONTACTO_LUEGO:${CHARLA}`]);
  }
});

Deno.test("sin nombre no sale ninguna plantilla (Meta no acepta variables vacías)", () => {
  for (const nombre of [null, "", "   "]) {
    const p = armarPlantilla("recontacto_1", { nombre, inicio: null, referencia: CHARLA, linkResena: null }, TZ);
    assert("falta" in p, `nombre ${JSON.stringify(nombre)}`);
  }
  assertEquals(primerNombre("  maría  josé "), "María");
});

Deno.test("control 2: solo la respuesta a un BOTÓN confirma; el texto 'confirmo' no", () => {
  assertEquals(botonDeTurno({ type: "button", button: { text: "Confirmo", payload: `${PAYLOAD.confirmar}:${TURNO}` } }), {
    accion: "confirmar",
    turnoId: TURNO,
  });
  assertEquals(botonDeTurno({ type: "button", button: { text: "Necesito reprogramar", payload: `REPROGRAMAR:${TURNO}` } })?.accion, "reprogramar");
  assertEquals(botonDeTurno({ type: "text", text: { body: "confirmo" } }), null);
  assertEquals(botonDeTurno({ type: "text", text: { body: `CONFIRMO:${TURNO}` } }), null); // escrito a mano
  assertEquals(botonDeTurno({ type: "button", button: { text: "Confirmo", payload: "CONFIRMO:no-es-un-id" } }), null);
  assertEquals(botonDeTurno({ type: "button", button: { text: "Sí, buscame uno", payload: `RECONTACTO_SI:${CHARLA}` } }), null);
  assertEquals(botonDeTurno({ type: "button", button: { text: "Confirmo" } }), null); // sin payload
});

Deno.test("control 5: texto libre solo dentro de las 24 hs desde el último mensaje del cliente", () => {
  const ahora = new Date("2030-06-06T16:00:00Z");
  assert(puedeTextoLibre(new Date(ahora.getTime() - 60_000), ahora));
  assert(puedeTextoLibre(new Date(ahora.getTime() - VENTANA_MS + 1), ahora));
  assert(!puedeTextoLibre(new Date(ahora.getTime() - VENTANA_MS), ahora));
  assert(!puedeTextoLibre(null, ahora));
  assert(!puedeTextoLibre(new Date("no es fecha"), ahora));
});

Deno.test("enviarPlantilla arma el pedido de Meta: cuerpo, un componente por botón y el wamid de vuelta", async () => {
  let pedido: Record<string, unknown> = {};
  const fetcher = ((_url: string, init?: RequestInit) => {
    pedido = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: "wamid.PLANTILLA" }] }), { status: 200 }));
  }) as typeof fetch;
  const id = await enviarPlantilla({ token: "t", phoneNumberId: "1" }, "5493410000000", {
    nombre: "recordatorio_turno_18h",
    idioma: "es_AR",
    cuerpo: ["Juan", "jueves 6 de junio", "16:00"],
    botones: [`CONFIRMO:${TURNO}`, `REPROGRAMAR:${TURNO}`],
  }, fetcher);
  assertEquals(id, "wamid.PLANTILLA");
  assertEquals(pedido.type, "template");
  const template = pedido.template as { name: string; language: { code: string }; components: Record<string, unknown>[] };
  assertEquals([template.name, template.language.code], ["recordatorio_turno_18h", "es_AR"]);
  assertEquals(template.components[0], {
    type: "body",
    parameters: [{ type: "text", text: "Juan" }, { type: "text", text: "jueves 6 de junio" }, { type: "text", text: "16:00" }],
  });
  assertEquals(template.components[2], {
    type: "button",
    sub_type: "quick_reply",
    index: "1",
    parameters: [{ type: "payload", payload: `REPROGRAMAR:${TURNO}` }],
  });
});

Deno.test("si Meta rechaza la plantilla, enviarPlantilla falla con el motivo", async () => {
  const fetcher = (() =>
    Promise.resolve(new Response(JSON.stringify({ error: { code: 132001, message: "Template name does not exist" } }), { status: 404 }))) as typeof fetch;
  await assertRejects(
    () => enviarPlantilla({ token: "t", phoneNumberId: "1" }, "549", { nombre: "x", idioma: "es_AR", cuerpo: [], botones: [] }, fetcher),
    Error,
    "132001",
  );
});
