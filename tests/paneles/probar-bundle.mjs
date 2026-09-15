// H1.8, control 2: la service role solo aparece en panel/lib/supabase/admin.ts y en
// panel/app/api/** (fuente), y ni la clave ni un tramo de ella en .next/static (bundle del
// navegador) después de `npm run build`. Imprime solo conteos, nunca la clave.
// Uso, desde la raíz del repo y después de `npm run build` en panel/:
//   node tests/paneles/probar-bundle.mjs
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Rutas relativas a este archivo (tests/paneles/ → raíz del repo).
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PANEL = RAIZ + "panel/";
createRequire(RAIZ + "package.json")("dotenv").config({ path: PANEL + ".env.local" });
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!clave) {
  console.error("falta SUPABASE_SERVICE_ROLE_KEY en panel/.env.local");
  process.exit(1);
}

function archivos(dir, excluir = []) {
  const salida = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (excluir.includes(n)) continue;
    if (statSync(p).isDirectory()) salida.push(...archivos(p, excluir));
    else salida.push(p);
  }
  return salida;
}
const rel = (p) => path.relative(PANEL, p).split(path.sep).join("/");
let fallas = 0;

// 1. Fuente: quién menciona la variable o el cliente admin.
const fuente = archivos(PANEL, ["node_modules", ".next", ".env.local"]).filter((p) => /\.(ts|tsx|js|mjs)$/.test(p));
const conVariable = fuente.filter((p) => readFileSync(p, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY")).map(rel);
const conAdmin = fuente.filter((p) => readFileSync(p, "utf8").includes("crearClienteAdmin")).map(rel);
const fueraDeLugar = [...conVariable, ...conAdmin].filter((p) => p !== "lib/supabase/admin.ts" && !p.startsWith("app/api/"));
console.log("fuente que lee SUPABASE_SERVICE_ROLE_KEY:", conVariable.join(", ") || "(ninguno)");
console.log("fuente que usa crearClienteAdmin:", conAdmin.join(", ") || "(ninguno)");
console.log(fueraDeLugar.length ? `❌ fuera de admin.ts y app/api/**: ${fueraDeLugar.join(", ")}` : "✅ solo en lib/supabase/admin.ts y app/api/**");
if (fueraDeLugar.length) fallas++;

// 2. Bundle del navegador.
const estaticos = archivos(PANEL + ".next/static");
const contar = (aguja) => estaticos.reduce((n, p) => n + readFileSync(p, "latin1").split(aguja).length - 1, 0);

// En una clave JWT, el header y el comienzo del payload ({"iss":"supabase","ref":…) son
// iguales en la anon y en la service role, y la anon SÍ va al navegador (NEXT_PUBLIC_). Por
// eso se busca el tramo del payload desde donde las dos claves dejan de coincidir (el rol).
const partes = clave.split(".");
let tramoPropio = clave.slice(0, 24);
let comun = 0;
if (partes.length === 3) {
  const p = partes[1];
  const a = anon.split(".")[1] ?? "";
  while (comun < p.length && p[comun] === a[comun]) comun++;
  tramoPropio = p.slice(comun, comun + 24);
}
const agujas = {
  "clave completa": clave,
  "últimos 24 caracteres (firma)": clave.slice(-24),
  [`24 caracteres del payload desde donde se separa de la anon (posición ${comun})`]: tramoPropio,
};
for (const [nombre, aguja] of Object.entries(agujas)) {
  const n = contar(aguja);
  console.log(`${n === 0 ? "✅" : "❌"} ${nombre}: ${n} apariciones en ${estaticos.length} archivos de .next/static`);
  if (n) fallas++;
}
if (anon) console.log(`ℹ️  la clave anon (pública a propósito) aparece ${contar(anon)} vez/veces en .next/static`);
process.exit(fallas ? 1 : 0);
