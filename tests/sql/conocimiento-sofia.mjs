// Control de las respuestas que dio Sofía el 17/9/2026 (docs/ficha-del-negocio.md § Alquiler):
// medios de pago del alquiler, cancelación, retoques en la prueba final, retiro anticipado,
// cambio de modelo y que se puede entrar sin turno.
//
// Prueba dos cosas distintas, y las dos hacen falta:
//  1. que el fragmento se ENCUENTRE preguntando como un cliente, sin decirle la sección (es la
//     misma búsqueda que usa buscar_informacion: se importa busqueda.ts, no una copia);
//  2. que el DATO esté adentro del texto. Encontrar el fragmento correcto vacío de números no
//     sirve: Lucía inventaría el porcentaje.
//
// scripts/probar-busqueda.js cubre los 16 temas, pero afirma el TEMA, no cuál fragmento gana
// adentro del tema — y reserva-y-garantia, como-funciona y ubicacion-horarios ahora tienen dos.
// Uso: node tests/sql/conocimiento-sofia.mjs
import "dotenv/config";
import pg from "pg";
import { buscarFragmentos } from "../../supabase/functions/_shared/conocimiento/busqueda.ts";

if (!process.env.SUPABASE_DB_URL) {
  console.error("Falta SUPABASE_DB_URL en .env.");
  process.exit(1);
}

let fallas = 0;
const assert = (ok, msg) => {
  console.log(`  ${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fallas++;
};

const cliente = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await cliente.connect();
const db = { consulta: async (sql, valores = []) => (await cliente.query(sql, valores)).rows };

// [lo que escribe el cliente, título del fragmento que tiene que ganar, datos que no pueden faltar]
const CASOS = [
  ["se puede pagar en cuotas?", "Pago y garantía", ["10%", "tres pagos", "débito"]],
  ["puedo pagar con tarjeta de credito en varios pagos", "Pago y garantía", ["un pago"]],
  ["si cancelo me devuelven la plata?", "Si cancelás el alquiler", ["30%", "70%", "9 días"]],
  ["quiero cancelar el alquiler, pierdo todo?", "Si cancelás el alquiler", ["5 días hábiles", "10 días"]],
  ["puedo ir sin turno solo a mirar?", "Venir sin turno", ["sin turno", "medir"]],
  ["si no me queda bien en la prueba me lo arreglan ahi?", "Retoques en la prueba final", ["en el momento", "una y dos horas"]],
  ["puedo cambiar el modelo despues?", "Cambiar el modelo elegido", ["disponible"]],
  ["me voy de viaje, lo puedo retirar antes?", "Cómo es el alquiler, paso a paso", ["uno o dos días antes"]],
];

console.log("\n[1] Cada respuesta de Sofía se encuentra preguntando como un cliente");
for (const [consulta, titulo, datos] of CASOS) {
  const { encontrados } = await buscarFragmentos(db, { consulta, limite: 3 });
  const primero = encontrados[0];
  const ok = primero?.titulo === titulo;
  assert(ok, `«${consulta}» → ${titulo}` + (ok ? "" : ` → GANÓ «${primero?.titulo ?? "nada"}» [${encontrados.map((e) => e.titulo).join(" · ")}]`));
  if (!ok) continue;
  for (const d of datos) {
    assert(primero.texto.includes(d), `    y el texto trae «${d}»`);
  }
}

// Lo que Lucía NO tiene que poder decir: la ficha deja la devolución tardía como interna.
console.log("\n[2] Lo que quedó fuera a propósito");
const todos = (await db.consulta("select titulo, texto from fragmentos where activo")).map((f) => f.texto).join(" ");
assert(!/nunca nos pas|obligad/i.test(todos), "la devolución fuera de plazo no está en ningún fragmento (es interna: deriva)");
assert(!/\$/.test(todos), "ningún fragmento trae un precio (los precios salen del catálogo)");

await cliente.end();
console.log(fallas === 0 ? "\n✅ Las respuestas de Sofía están cargadas y se encuentran.\n" : `\n❌ ${fallas} control(es) no pasaron.\n`);
process.exit(fallas === 0 ? 0 : 1);
