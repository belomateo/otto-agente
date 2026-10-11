// El analista de charlas con el modelo de verdad (0102, 10/10): analiza 3 charlas reales del 9/10
// leyendo la base en SOLO LECTURA (la sesión se abre read only y además se rechaza cualquier
// sentencia que no sea una consulta) y muestra lo que encontró. No guarda nada: no toma las charlas,
// no escribe hallazgos ni consumo. Cuesta centavos.
//
// Solo corre con PRUEBA_MODELO_REAL=1 (si no, queda ignorada). Necesita SUPABASE_DB_URL y
// OPENAI_API_KEY (--env-file=.env, sacando del entorno la OPENAI_API_KEY que tape la del .env) y el
// modelo en LLM_ANALISTA o LLM_PRINCIPAL:
//   env -u OPENAI_API_KEY PRUEBA_MODELO_REAL=1 LLM_ANALISTA=gpt-6.1-sol deno test tests/analista/modelo_real.test.ts \
//     --allow-all --env-file=.env --no-lock --node-modules-dir=none
// Otras charlas: PRUEBA_CHARLAS=id1,id2,id3 · otra fecha: PRUEBA_FECHA=AAAA-MM-DD.

// @deno-types="npm:@types/pg@8.11.10"
import pg from "npm:pg@8.13.1";
import { assert } from "jsr:@std/assert@1.0.13";
import type { Db } from "../../supabase/functions/_shared/db.ts";
import { costoUsd } from "../../supabase/functions/_shared/llm/precios.ts";
import { repositorioSql } from "../../supabase/functions/analista/base.ts";
import { llamadaReal } from "../../supabase/functions/analista/noche.ts";
import { armarCharla, armarInstrucciones, modeloDelAnalista, razonamientoDelAnalista } from "../../supabase/functions/analista/pedido.ts";
import { leerAnalisis } from "../../supabase/functions/analista/respuesta.ts";

const TZ = "America/Argentina/Cordoba";
const REAL = Deno.env.get("PRUEBA_MODELO_REAL") === "1";

Deno.test({
  name: "analista con el modelo real: 3 charlas del 9/10, base en solo lectura, sin guardar nada",
  ignore: !REAL,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const fecha = Deno.env.get("PRUEBA_FECHA") || "2026-10-09";
    const modelo = modeloDelAnalista(Deno.env.get("LLM_ANALISTA"), Deno.env.get("LLM_PRINCIPAL"));
    assert(modelo, "falta el modelo: LLM_ANALISTA o LLM_PRINCIPAL");
    const url = Deno.env.get("SUPABASE_DB_URL");
    assert(url, "falta SUPABASE_DB_URL (--env-file=.env)");

    const cliente = new pg.Client({ connectionString: url, options: "-c default_transaction_read_only=on" });
    await cliente.connect();
    try {
      await cliente.query("set session characteristics as transaction read only");
      const db: Db = {
        async consulta<T>(sql: string, valores: unknown[] = []) {
          if (!/^\s*(select|with\b[\s\S]*\bselect\b)/i.test(sql) || /^\s*with[\s\S]*\b(insert|update|delete)\b/i.test(sql)) {
            throw new Error(`la prueba real es de solo lectura: ${sql.slice(0, 60)}`);
          }
          return (await cliente.query(sql, valores)).rows as T[];
        },
      };
      const repo = repositorioSql(db, TZ);
      const elegidas = (Deno.env.get("PRUEBA_CHARLAS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const candidatas = await repo.candidatas(fecha);
      const ids = elegidas.length ? elegidas : candidatas.slice(0, 3);
      console.log(`\n${candidatas.length} charlas del ${fecha} en que habló Lucía; se analizan ${ids.length}. Modelo: ${modelo}.`);

      const prompt = await Deno.readTextFile(new URL("../../supabase/functions/_shared/prompt.md", import.meta.url));
      const instrucciones = armarInstrucciones({ prompt, ...(await repo.datosDeReferencia(fecha)) });
      const llamar = llamadaReal({
        modelo,
        razonamiento: razonamientoDelAnalista(Deno.env.get("LLM_RAZONAMIENTO_ANALISTA")),
        fecha,
        hoy: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()),
      });

      let total = 0;
      for (const id of ids) {
        const charla = await repo.cargarCharla(fecha, id);
        const armada = armarCharla(charla, fecha, TZ);
        const t0 = Date.now();
        const r = await llamar({ instrucciones, charla: armada.texto }, Date.now() + 120_000);
        assert(r, `el modelo no contestó para ${id}`);
        const costo = costoUsd(r.modelo, r.uso.tokensIn, r.uso.tokensOut, r.uso.tokensCacheados);
        total += costo;
        const lectura = leerAnalisis(r.contenido, armada.numerados);
        console.log(
          `\n=== ${charla.cliente ?? "sin nombre"} (${id}) · ${armada.numerados.length} mensajes del día · ` +
            `${r.uso.tokensIn} tokens de entrada (${r.uso.tokensCacheados} en caché), ${r.uso.tokensOut} de salida · ` +
            `US$ ${costo.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
        );
        assert(lectura, `la respuesta para ${id} no se pudo leer: ${String(r.contenido).slice(0, 300)}`);
        if (!lectura.hallazgos.length) console.log("Sin errores ni mejoras.");
        for (const h of lectura.hallazgos) {
          const numero = armada.numerados.find((m) => m.id === h.mensajeId)?.numero;
          console.log(`\n[${h.tipo} · ${h.categoria}${h.gravedad ? ` · ${h.gravedad}` : ""}${h.tema ? ` · ficha ${h.tema}` : ""}]`);
          if (h.cita) console.log(`  «${h.cita}» (${h.autorCita}, mensaje ${numero ?? "?"})`);
          console.log(`  Qué pasó: ${h.quePaso}`);
          if (h.queConviene) console.log(`  Qué conviene: ${h.queConviene}`);
          if (h.textoSugerido) console.log(`  Texto sugerido: ${h.textoSugerido}`);
        }
        for (const d of lectura.descartados) console.log(`  (descartado: ${d})`);
      }
      console.log(`\nCosto total de la prueba: US$ ${total.toFixed(4)}`);
    } finally {
      await cliente.end();
    }
  },
});
