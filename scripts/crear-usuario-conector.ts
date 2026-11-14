// Uso (desde otto-integracion): deno run --no-lock -A scripts/crear-usuario-conector.ts panel/.env.local
// Crea el usuario del conector de Sofía («Sofía (vía Claude)», admin aprobado) y guarda las credenciales y la clave
// del conector SOLO en panel/.env.local (no se commitea). No imprime ningún secreto.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const RUTA_ENV = Deno.args[0];
const env = Object.fromEntries((await Deno.readTextFile(RUTA_ENV)).split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
if (env.MCP_SOFIA_EMAIL) { console.log("ya existe la configuración del conector en .env.local: no se crea otro usuario"); Deno.exit(0); }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const aleatorio = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const email = "sofia-claude@ottosumisura.invalid";
const password = aleatorio(24);
const clave = aleatorio(32);
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre: "Sofía (vía Claude)" } });
if (error || !data.user) { console.log("no se pudo crear el usuario:", error?.message); Deno.exit(1); }
const { error: e2 } = await admin.from("perfiles").update({ nombre: "Sofía (vía Claude)", rol: "admin", estado: "aprobado", debe_cambiar_clave: false }).eq("id", data.user.id);
if (e2) { console.log("usuario creado pero no se pudo aprobar el perfil:", e2.message); Deno.exit(1); }
const { data: p } = await admin.from("perfiles").select("nombre, rol, estado, debe_cambiar_clave").eq("id", data.user.id).single();
await Deno.writeTextFile(RUTA_ENV, `\n# Conector MCP de Sofía (13/11). No commitear.\nMCP_SOFIA_EMAIL=${email}\nMCP_SOFIA_PASSWORD=${password}\nMCP_SOFIA_CLAVE=${clave}\n`, { append: true });
console.log("usuario creado:", JSON.stringify(p), "· credenciales guardadas en .env.local");
