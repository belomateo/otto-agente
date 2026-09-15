// Doble del generador del prompt (scripts/armar-prompt.mjs de agente, H1.3), SOLO para probar
// el cableado del handler de prompt base. Sigue el contrato del real:
//   node armar-prompt.mjs --plantilla <archivo> --solo-validar
//   → 0 si pasa; 1 y los motivos por stderr, uno por línea, si no.
// Como el real, rechaza cualquier argumento desconocido (por ejemplo --validar): si el handler
// pasara otro flag, la prueba del prompt válido fallaría. No lee la base ni completa
// {{REGLAS_NUMERADAS}} ni {{CONTEXTO:clave}}: valida lo que el real valida después de completar
// (marcas sin resolver, techo de 300 líneas, primera línea "Sos Lucía,").
import { readFileSync } from "node:fs";

const a = { plantilla: null, soloValidar: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v === "--plantilla") a.plantilla = argv[++i];
  else if (v === "--solo-validar") a.soloValidar = true;
  else {
    console.error(`❌ Argumento desconocido: ${v}`);
    process.exit(1);
  }
}
if (!a.plantilla || !a.soloValidar) {
  console.error("❌ el doble solo sabe hacer --plantilla <archivo> --solo-validar");
  process.exit(1);
}

const lineas = readFileSync(a.plantilla, "utf8").replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
const errores = [];
for (const [i, l] of lineas.entries()) {
  for (const marca of ["{{", "}}", "[[", "]]"]) {
    if (l.includes(marca)) errores.push(`Queda un "${marca}" sin resolver en la línea ${i + 1}: ${l.trim()}`);
  }
}
if (lineas.length > 300) errores.push(`El cuerpo tiene ${lineas.length} líneas y el techo es 300.`);
if (!/^Sos Lucía,/.test(lineas[0] ?? "")) {
  errores.push(`La primera línea tiene que empezar con "Sos Lucía," y dice: ${lineas[0] ?? "(vacía)"}`);
}

if (errores.length) {
  console.error(`❌ El prompt no pasa ${errores.length} validación(es); no se escribió nada:`);
  for (const e of errores) console.error(`   - ${e}`);
  process.exit(1);
}
console.log("✅ prompt válido (no escrito)");
process.exit(0);
