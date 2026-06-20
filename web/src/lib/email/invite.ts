import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Account invite email
//
// Sent when an admin invites someone to create an account. The `actionUrl` is a
// one-time Supabase invite link (generated via auth.admin.generateLink) that
// drops the user on /auth/confirm -> set-password. Mirrors the waitlist email's
// brand language so the two reads as one product.
//
// Unlike the waitlist confirmation, sending here is NOT best-effort: if the
// email can't go out, the invite is useless, so the caller should surface a
// failure. We still never throw - we return false and let the route decide.
// ---------------------------------------------------------------------------

const FROM = process.env.WAITLIST_FROM_EMAIL ?? "Arro <onboarding@resend.dev>";
const REPLY_TO = process.env.WAITLIST_REPLY_TO ?? "arrotechnology@gmail.com";

let client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

/**
 * Send the branded account-creation invite. Resolves to true on send, false if
 * skipped (no key) or failed. Never throws.
 */
export async function sendAccountInvite(email: string, actionUrl: string): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn("invite email: RESEND_API_KEY not set, skipping invite");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      replyTo: REPLY_TO,
      subject: "You're invited to Arro",
      html: inviteHtml(actionUrl),
      text: inviteText(actionUrl),
    });
    if (error) {
      console.error("invite email: send failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("invite email: send threw", err);
    return false;
  }
}

// --- Brand tokens (mirrors web/tailwind.config.ts) -------------------------
const INK_900 = "#0b0e14";
const INK_700 = "#1f2530";
const INK_600 = "#334155";
const INK_500 = "#4a5568";
const INK_400 = "#94a3b8";
const INK_150 = "#eaeef3";
const SURFACE_SOFT = "#f7f9fb";
const SURFACE_SUNKEN = "#eef2f8";
const ACCENT = "#0f766e";

const DISPLAY =
  "'DM Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SANS =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function dot(size = 7, color = ACCENT): string {
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background-color:${color};vertical-align:middle;"></span>`;
}

function bullet(text: string): string {
  return `<tr><td style="padding:7px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${INK_700};vertical-align:top;">
<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:${ACCENT};vertical-align:middle;margin:0 10px 2px 0;"></span>${text}
</td></tr>`;
}

export function inviteHtml(actionUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>You're invited to Arro</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
a { text-decoration:none; }
@media (max-width:520px) {
  .card-pad { padding:32px 24px !important; }
  .h1 { font-size:30px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${SURFACE_SOFT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">You've been invited to create your Arro account. The link inside is single-use.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${SURFACE_SOFT};">
<tr>
<td align="center" style="padding:44px 16px;">

<!-- Wordmark -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">
<tr><td style="padding:0 4px 18px 4px;font-family:${DISPLAY};font-size:21px;font-weight:700;letter-spacing:3.4px;text-transform:uppercase;color:${INK_900};">ARRO</td></tr>
</table>

<!-- Card -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background-color:#ffffff;border:1px solid ${INK_150};border-radius:4px;overflow:hidden;box-shadow:0 1px 2px rgba(11,14,20,0.04),0 12px 32px -8px rgba(11,14,20,0.10);">
<tr>
<td class="card-pad" style="padding:40px 44px 36px 44px;">

<!-- Eyebrow -->
<div style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${INK_500};">
${dot(7)}<span style="margin-left:9px;">Your access is ready</span>
</div>

<!-- Display headline -->
<h1 class="h1" style="margin:18px 0 0 0;font-family:${DISPLAY};font-size:34px;line-height:1.08;font-weight:500;letter-spacing:0.2px;color:${INK_900};">You're invited to<br />Arro<span style="color:${ACCENT};">.</span></h1>

<p style="margin:18px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK_500};max-width:380px;">
Create your account to bring your projects, drawings, and council RFIs into Arro. It takes under a minute - just set a password.
</p>

<!-- Inset panel echoing the site's product cards -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0 0;background-color:${SURFACE_SUNKEN};border:1px solid ${INK_150};border-radius:4px;">
<tr>
<td style="padding:14px 18px 4px 18px;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${INK_500};">${dot(6)}<span style="margin-left:8px;">What's inside</span></td>
</tr>
<tr><td style="padding:6px 18px 16px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${bullet("Plan analysis &amp; RFI auto-response")}
${bullet("NZBC &amp; council-ready from day one")}
${bullet("Your projects, private to your account")}
</table>
</td></tr>
</table>

<!-- CTA -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 0 0;">
<tr><td style="border-radius:4px;background-color:${INK_900};box-shadow:0 1px 2px rgba(11,14,20,0.10);">
<a href="${actionUrl}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:13px;font-weight:600;color:#ffffff;letter-spacing:0.2px;">Create your account&nbsp;&nbsp;&rarr;</a>
</td></tr>
</table>

<div style="margin:32px 0 0 0;border-top:1px solid ${INK_150};"></div>

<p style="margin:20px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_600};">
This invite link is single-use and expires. If you didn't expect it, you can safely ignore this email.
</p>

</td>
</tr>
</table>

<!-- Footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">
<tr><td style="padding:22px 6px 0 6px;font-family:${SANS};">
<div style="font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:${INK_400};">${dot(5)}<span style="margin-left:8px;">Arro &middot; Construction, accelerated by AI</span></div>
<div style="margin-top:10px;font-size:11px;line-height:1.5;color:${INK_400};">You're receiving this because someone invited you to <a href="https://arro.co.nz" style="color:${INK_500};">arro.co.nz</a>.</div>
</td></tr>
</table>

</td>
</tr>
</table>
</body>
</html>`;
}

function inviteText(actionUrl: string): string {
  return [
    "ARRO · YOU'RE INVITED",
    "",
    "Create your account.",
    "",
    "You've been invited to Arro. Create your account to bring your projects,",
    "drawings, and council RFIs in. It takes under a minute - just set a password.",
    "",
    `Create your account: ${actionUrl}`,
    "",
    "This invite link is single-use and expires. If you didn't expect it, ignore this email.",
    "",
    "Arro · Construction, accelerated by AI",
  ].join("\n");
}
