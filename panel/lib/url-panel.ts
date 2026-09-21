// La URL pública del panel (para el link del mail de invitación, decisión de Mateo 17/9). Sin
// 'server-only': es código puro (ni secretos ni nada que no deba ver un bundle de cliente), así
// se puede importar y probar directo, sin levantar el panel ni pasar por su bundler (hallazgo
// de logica, 21/9 — el mail salió sin link porque nadie se enteró de que faltaba PANEL_URL).
//
// PANEL_URL primero; si nadie la cargó, el nombre solo que expone Vercel (sin esquema: hay que
// anteponerle https://). Sin ninguna de las dos, no hay URL — quien llama decide qué hacer.
export function urlPanel(): string | null {
  let cruda = process.env.PANEL_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  if (!cruda) return null;
  if (!/^https?:\/\//i.test(cruda)) cruda = `https://${cruda}`;
  return cruda.replace(/\/+$/, '');
}
