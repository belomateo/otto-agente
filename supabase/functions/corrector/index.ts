// Corrector de Lucía (0104, pedido de Mateo del 10/10): la función que el panel llama cuando un
// admin pide un cambio en cómo atiende Lucía. Dos endpoints en el mismo POST:
//
//  1. ANALIZAR: { pedido: "...", quien: "email", quien_id: "uuid" }
//     → Lee las instrucciones, fichas y herramientas actuales.
//     → Le pide al modelo qué contradice el pedido y qué opciones hay.
//     → Guarda la corrección con estado 'analizada' y devuelve el id + el análisis.
//
//  2. ELEGIR: { correccion_id: "uuid", opcion: "editar"|"agregar", indice: 0 }
//     → Arma el cambio concreto (las instrucciones editadas, o la ficha nueva).
//     → Genera pruebas, las corre con Lucía real (en transacción con rollback) y las juzga.
//     → Si pasa todo: aplica (corrector_aplicar de 0104). Si no: rechaza.
//     → Devuelve el resultado.
//
// Autenticación: WORKER_SECRET en el header, igual que el analista y cron-envios.
//
// El modelo: LLM_CORRECTOR y, si no está, LLM_ANALISTA o LLM_PRINCIPAL. Razonamiento: medium
// (armar el cambio necesita más que el análisis de charla del analista, que usa low).
// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { type ClienteSql, dbDesde } from "../_shared/db.ts";
import { apiKey } from "../_shared/llm/cliente.ts";
import { huellaDe } from "../_shared/instrucciones.ts";
import { igualesEnTiempoConstante } from "../_shared/whatsapp/firma.ts";
import { analizarPedido } from "./analisis.ts";
import {
  actualizarCorreccion,
  aplicarCorreccion,
  crearCorreccion,
  crearPruebas,
  crearVersionBorrador,
  elegirOpcion,
  fichasActivas,
  guardarResultadoPrueba,
  herramientasActivas,
  instruccionesActuales,
  leerCorreccion,
  pruebasPendientes,
  rechazarCorreccion,
  saltearPruebasRestantes,
  tomarPrueba,
} from "./base.ts";
import { armarCambio } from "./candidata.ts";
import { generarPruebas, juzgarPrueba } from "./pruebas.ts";
import { correrCharlaDePrueba } from "../_shared/turno/charla_de_prueba.ts";

const SECRETO = Deno.env.get("WORKER_SECRET") ?? "";
const TZ = Deno.env.get("NEGOCIO_TZ") || "America/Argentina/Cordoba";
const RAZONAMIENTO = "medium" as const;

function modeloDelCorrector(): string | null {
  return Deno.env.get("LLM_CORRECTOR") || Deno.env.get("LLM_ANALISTA") || Deno.env.get("LLM_PRINCIPAL") || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || SECRETO === "" || !igualesEnTiempoConstante(req.headers.get("x-worker-secret") ?? "", SECRETO)) {
    return new Response("forbidden", { status: 403 });
  }

  const modelo = modeloDelCorrector();
  if (!modelo) return Response.json({ error: "falta LLM_CORRECTOR (o LLM_ANALISTA o LLM_PRINCIPAL)" }, { status: 500 });
  try { apiKey(); } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }

  const cuerpo = await req.json().catch(() => ({}));
  const cliente = new pg.Client({ connectionString: Deno.env.get("SUPABASE_DB_URL") });
  cliente.on("error", (e: Error) => console.error("corrector: se cortó la conexión con la base", e.message));
  await cliente.connect();

  try {
    const db = dbDesde(cliente as unknown as ClienteSql);

    // --- Ruta 1: analizar un pedido nuevo ---
    if (typeof cuerpo.pedido === "string" && cuerpo.pedido.trim()) {
      return await manejarAnalisis(db, cuerpo, modelo);
    }

    // --- Ruta 2: elegir opción y correr pruebas ---
    if (typeof cuerpo.correccion_id === "string") {
      return await manejarEleccion(db, cliente as unknown as ClienteSql, cuerpo, modelo);
    }

    return Response.json({ error: "falta 'pedido' (texto) o 'correccion_id' (uuid)" }, { status: 400 });
  } catch (e) {
    console.error("corrector: falló", e);
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  } finally {
    await cliente.end().catch(() => {});
  }
});

async function manejarAnalisis(db: ReturnType<typeof dbDesde>, cuerpo: Record<string, unknown>, modelo: string): Promise<Response> {
  const pedido = String(cuerpo.pedido).trim();
  if (pedido.length < 3 || pedido.length > 2000) {
    return Response.json({ error: "el pedido tiene que tener entre 3 y 2000 caracteres" }, { status: 400 });
  }
  const quien = String(cuerpo.quien ?? "desconocido");
  const quienId = typeof cuerpo.quien_id === "string" ? cuerpo.quien_id : null;

  const ahora = new Date();
  const [instrucciones, fichas, herramientas] = await Promise.all([
    instruccionesActuales(db, ahora),
    fichasActivas(db),
    herramientasActivas(db),
  ]);

  const resultado = await analizarPedido({ pedido, instrucciones, fichas, herramientas }, modelo, RAZONAMIENTO);
  if ("error" in resultado) return Response.json({ error: resultado.error }, { status: 422 });

  const base = {
    origen: instrucciones.origen,
    version: instrucciones.version ?? null,
    huella: instrucciones.huella,
    etiqueta: instrucciones.etiqueta,
  };
  const correccionId = await crearCorreccion(db, {
    pedido,
    analisis: resultado.analisis as unknown as Record<string, unknown>,
    base,
    modelo,
    costoUsd: resultado.consumo.costoUsd,
    quien,
    quienId,
  });

  return Response.json({ correccion_id: correccionId, analisis: resultado.analisis });
}

async function manejarEleccion(
  db: ReturnType<typeof dbDesde>,
  sql: ClienteSql,
  cuerpo: Record<string, unknown>,
  modelo: string,
): Promise<Response> {
  const correccionId = String(cuerpo.correccion_id);
  const correccion = await leerCorreccion(db, correccionId);
  if (!correccion) return Response.json({ error: "corrección no encontrada" }, { status: 404 });
  if (correccion.estado !== "analizada") return Response.json({ error: `la corrección ya está ${correccion.estado}` }, { status: 409 });

  const indice = typeof cuerpo.indice === "number" ? cuerpo.indice : 0;
  const analisis = correccion.analisis as unknown as { opciones?: unknown[] };
  const opciones = Array.isArray(analisis?.opciones) ? analisis.opciones : [];
  if (indice < 0 || indice >= opciones.length) return Response.json({ error: `no hay opción ${indice}` }, { status: 400 });

  const opcionElegida = opciones[indice] as Record<string, unknown>;
  const opcion = {
    tipo: String(opcionElegida.tipo ?? "editar") as "editar" | "agregar",
    destino: String(opcionElegida.destino ?? "instrucciones") as "instrucciones" | "ficha" | "herramienta",
    descripcion: String(opcionElegida.descripcion ?? ""),
    fichaId: opcionElegida.fichaId ? String(opcionElegida.fichaId) : undefined,
    fichaTema: opcionElegida.fichaTema ? String(opcionElegida.fichaTema) : undefined,
    fichaTitulo: opcionElegida.fichaTitulo ? String(opcionElegida.fichaTitulo) : undefined,
    herramientaNombre: opcionElegida.herramientaNombre ? String(opcionElegida.herramientaNombre) : undefined,
  };

  const ahora = new Date();
  const [instrucciones, fichas, herramientas] = await Promise.all([
    instruccionesActuales(db, ahora),
    fichasActivas(db),
    herramientasActivas(db),
  ]);

  // 1. Armar el cambio
  const cambioResult = await armarCambio(
    opcion,
    { pedido: correccion.pedido, analisis: correccion.analisis as unknown as import("./analisis.ts").AnalisisCompleto, instrucciones, fichas, herramientas },
    modelo, RAZONAMIENTO,
  );
  if ("error" in cambioResult) {
    await rechazarCorreccion(db, correccionId, cambioResult.error);
    return Response.json({ error: cambioResult.error, rechazada: true }, { status: 422 });
  }

  // Si es un cambio de instrucciones, crear la versión borrador
  if (cambioResult.cambio.destino === "instrucciones" && cambioResult.cambio.textoCompleto) {
    await crearVersionBorrador(db, {
      correccionId,
      texto: cambioResult.cambio.textoCompleto,
      pedido: correccion.pedido,
      resumen: cambioResult.cambio.resumen ?? correccion.pedido,
      baseOrigen: instrucciones.origen,
      baseVersion: instrucciones.version ?? null,
      hashArchivo: instrucciones.huella,
      creadoPor: String(cuerpo.quien ?? "corrector"),
    });
  }

  // 2. Generar pruebas
  const pruebasResult = await generarPruebas(
    { pedido: correccion.pedido, resumen: cambioResult.cambio.resumen ?? "", cambioDescripcion: opcion.descripcion },
    modelo, "low",
  );
  if ("error" in pruebasResult) {
    await rechazarCorreccion(db, correccionId, `no se pudieron generar pruebas: ${pruebasResult.error}`);
    return Response.json({ error: pruebasResult.error, rechazada: true }, { status: 422 });
  }

  // Guardar la opción elegida y el cambio
  await elegirOpcion(db, correccionId, {
    opcion: opcion.tipo,
    destino: opcion.destino,
    cambio: cambioResult.cambio as unknown as Record<string, unknown>,
    costoUsd: cambioResult.consumo.costoUsd + pruebasResult.consumo.costoUsd,
  });

  // Guardar las pruebas
  await crearPruebas(db, correccionId, pruebasResult.pruebas.map((p) => ({
    nombre: p.nombre,
    mensajes: p.mensajes,
    ficha: p.ficha,
    debe: p.debe,
    noDebe: p.noDebe,
  })));

  // 3. Correr las pruebas
  const promptDePrueba = cambioResult.cambio.textoCompleto ?? instrucciones.texto;
  const pendientes = await pruebasPendientes(db, correccionId);
  let costoTotal = 0;
  let total = 0;
  let ok = 0;
  let primeraFalla: string | null = null;

  for (const prueba of pendientes) {
    if (primeraFalla) {
      // Ya falló una: no correr las demás
      await saltearPruebasRestantes(db, correccionId, `se salteó porque otra prueba falló: ${primeraFalla}`);
      break;
    }
    if (!(await tomarPrueba(db, prueba.id))) continue;
    total++;

    try {
      // Correr la charla de prueba en una transacción con rollback
      await sql.query("begin");
      await sql.query("set local otto.sin_disparo = 'on'");

      const resultado = await correrCharlaDePrueba(sql, {
        nombre: `prueba-${prueba.orden}`,
        ficha: (prueba.ficha ?? undefined) as Record<string, string | null> | undefined,
        mensajes: prueba.mensajes as (string | string[])[],
      }, {
        prompt: promptDePrueba,
        ahora: new Date(),
        tz: TZ,
      });

      await sql.query("rollback");

      // Armar el texto de la charla para el juez
      const textoCharla = resultado.turnos.map((t) => {
        const clienteTexto = t.cliente.map((m) => `CLIENTE: ${m}`).join("\n");
        const luciaTexto = t.lucia.map((m) => `LUCÍA: ${m}`).join("\n");
        return [clienteTexto, ...(t.apagada ? ["(Lucía apagada)"] : [luciaTexto])].join("\n");
      }).join("\n\n");

      // Juzgar
      const juicio = await juzgarPrueba(
        { charla: textoCharla, debe: prueba.debe as string[], noDebe: prueba.noDebe as string[] },
        modelo, "low",
      );

      if ("error" in juicio) {
        await guardarResultadoPrueba(db, prueba.id, {
          estado: "error", charla: resultado.turnos, veredicto: null, motivo: juicio.error, costoUsd: 0,
        });
      } else {
        const estado = juicio.veredicto.paso ? "paso" : "fallo";
        costoTotal += juicio.consumo.costoUsd;
        if (estado === "paso") ok++;
        else primeraFalla = juicio.veredicto.motivo ?? prueba.nombre;

        await guardarResultadoPrueba(db, prueba.id, {
          estado,
          charla: resultado.turnos,
          veredicto: juicio.veredicto,
          motivo: juicio.veredicto.motivo,
          costoUsd: juicio.consumo.costoUsd + resultado.consumo.reduce((a, c) => a + c.costoUsd, 0),
        });
      }
    } catch (e) {
      // Asegurar rollback
      try { await sql.query("rollback"); } catch { /* ya rolledback */ }
      await guardarResultadoPrueba(db, prueba.id, {
        estado: "error", charla: null, veredicto: null,
        motivo: String((e as Error)?.message ?? e).slice(0, 500),
        costoUsd: 0,
      });
      primeraFalla = `error en prueba ${prueba.nombre}: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
    }
  }

  await actualizarCorreccion(db, correccionId, { costoUsd: costoTotal, pruebasTotal: total, pruebasOk: ok });

  // 4. Decidir: si todo pasó, aplicar; si no, rechazar
  const quien = String(cuerpo.quien ?? "corrector");
  if (total > 0 && ok === total) {
    const hashArchivo = await huellaDe(instrucciones.texto);
    const aplicacion = await aplicarCorreccion(db, correccionId, quien, hashArchivo);
    console.log(JSON.stringify({ correccion_id: correccionId, ...aplicacion }));
    return Response.json({ correccion_id: correccionId, ...aplicacion });
  } else {
    const motivo = primeraFalla ?? `${ok} de ${total} pruebas pasaron`;
    await rechazarCorreccion(db, correccionId, motivo);
    console.log(JSON.stringify({ correccion_id: correccionId, aplicada: false, motivo }));
    return Response.json({ correccion_id: correccionId, aplicada: false, motivo, pruebas_ok: ok, pruebas_total: total });
  }
}
