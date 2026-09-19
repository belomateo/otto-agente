// Mail de invitación al panel (decisión de Mateo, 17/9), vía Resend (REST directa, sin SDK).
// Efecto secundario de POST /api/accesos/invitaciones, que ya pasó por crear_invitacion()
// (es_admin() adentro, 0053): esto no gatea nada, solo avisa. La pre-aprobación es la garantía
// real — si Resend falla o RESEND_API_KEY todavía no está cargada (Mateo la está gestionando),
// la invitación queda creada igual y esto no tira ningún error al que la creó.
//
// El link deja a la persona a un solo paso (pedido de Mateo, 17/9): /login?modo=crear-cuenta con
// el email precargado, mismos nombres de query param que usa front del otro lado.
import 'server-only';

const ETIQUETA_ROL: Record<'admin' | 'equipo', string> = { admin: 'Administrador', equipo: 'Colaborador' };

function escaparHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function mandarMailInvitacion(email: string, rol: 'admin' | 'equipo') {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const panelUrl = process.env.PANEL_URL;
  const link = panelUrl ? `${panelUrl}/login?modo=crear-cuenta&email=${encodeURIComponent(email)}` : null;
  const etiqueta = ETIQUETA_ROL[rol];

  const text = link
    ? `Te invitaron al panel de Otto Su Misura como ${etiqueta}.\n\nEntrá a ${link} y poné una contraseña para tu cuenta (${email}) — te deja adentro directo, sin esperar que nadie te apruebe.`
    : `Te invitaron al panel de Otto Su Misura como ${etiqueta}.\n\nEntrá al panel y registrate con este mismo mail (${email}) para entrar directo, sin esperar que nadie te apruebe.`;

  const html = link
    ? `<p>Te invitaron al panel de Otto Su Misura como <strong>${etiqueta}</strong>.</p>
<p><a href="${escaparHtml(link)}" style="display:inline-block;padding:10px 20px;background:#A8703F;color:#fff;text-decoration:none;border-radius:6px;font-family:sans-serif">Poner mi contraseña</a></p>
<p style="font-family:sans-serif;color:#5C6068;font-size:13px">Es para ${escaparHtml(email)} — te deja adentro directo, sin esperar que nadie te apruebe.</p>`
    : `<p>Te invitaron al panel de Otto Su Misura como <strong>${etiqueta}</strong>.</p>
<p>Entrá al panel y registrate con este mismo mail (${escaparHtml(email)}) para entrar directo, sin esperar que nadie te apruebe.</p>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Otto Su Misura <onboarding@resend.dev>',
        to: [email],
        subject: 'Te invitaron al panel de Otto Su Misura',
        text,
        html,
      }),
    });
    if (!r.ok) {
      console.error('[mail-invitacion] Resend respondió mal:', r.status, await r.text().catch(() => '(sin cuerpo)'));
    }
  } catch (e) {
    console.error('[mail-invitacion] no se pudo mandar (la invitación ya está creada igual):', e instanceof Error ? e.message : e);
  }
}
