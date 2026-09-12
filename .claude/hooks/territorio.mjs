// Hook PreToolUse: bloquea Edit/Write/MultiEdit fuera del territorio del rol.
// Lee el rol de .claude/rol (un archivo con una palabra: front | agente | paneles | logica).
// Territorios en .claude/hooks/territorios.json. Permisos de sesión en .claude/permisos-sesion.txt.
// Salida: código 0 = deja pasar. Código 2 + mensaje por stderr = bloquea y se lo muestra a Claude.
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

const raiz = process.cwd();
const leer = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n?/g, "\n") : "");

let entrada = "";
for await (const chunk of process.stdin) entrada += chunk;
let tool;
try { tool = JSON.parse(entrada); } catch { process.exit(0); }

const ruta = tool?.tool_input?.file_path || tool?.tool_input?.path;
if (!ruta) process.exit(0);

const rol = leer(resolve(raiz, ".claude/rol")).trim();
if (!rol) {
  console.error("⛔ TERRITORIO: falta .claude/rol en este worktree. Escribí una palabra (front | agente | paneles | logica) y volvé a intentar.");
  process.exit(2);
}

const territorios = JSON.parse(leer(resolve(raiz, ".claude/hooks/territorios.json")));
const rel = relative(raiz, resolve(raiz, ruta)).split(sep).join("/");

const globARegex = (g) =>
  new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
const pega = (globs) => (globs || []).some((g) => globARegex(g).test(rel));

// permisos otorgados por Mateo en esta sesión
const permisos = leer(resolve(raiz, ".claude/permisos-sesion.txt")).split("\n").map((s) => s.trim()).filter(Boolean);
if (permisos.some((p) => rel === p || rel.startsWith(p.replace(/\/?$/, "/")))) process.exit(0);

if (pega(territorios.compartidos)) {
  console.error(`⛔ TERRITORIO: "${rel}" es un archivo compartido. Nadie lo edita sin permiso. Pedile a Mateo que escriba: permiso ${rel}`);
  process.exit(2);
}
if (pega(territorios.roles[rol])) process.exit(0);

const dueno = Object.entries(territorios.roles).find(([r, globs]) => r !== rol && pega(globs))?.[0] || "nadie (fuera de todo territorio)";
console.error(`⛔ TERRITORIO: el rol "${rol}" quiere editar "${rel}", que es de "${dueno}". Explicale a Mateo por qué lo necesitás. Si acepta, que escriba: permiso ${rel}`);
process.exit(2);
