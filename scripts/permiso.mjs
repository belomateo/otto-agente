// Uso: node scripts/permiso.mjs <ruta>   → habilita esa ruta para el rol de este worktree, solo en esta sesión.
import { appendFileSync } from "node:fs";
const ruta = process.argv[2];
if (!ruta) { console.error("Uso: node scripts/permiso.mjs <ruta>"); process.exit(1); }
appendFileSync(".claude/permisos-sesion.txt", ruta.replace(/\\/g, "/") + "\n");
console.log(`✅ permiso otorgado en esta sesión: ${ruta}`);
