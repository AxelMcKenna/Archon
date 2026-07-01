import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Password reset email
//
// Sent when someone requests a password reset from /forgot-password. The
// `actionUrl` is a one-time Supabase recovery link (generated via
// auth.admin.generateLink) that lands on /auth/confirm -> /auth/reset-password.
// Mirrors the account-invite email's brand language and structure.
//
// Sending is best-effort here: the caller never reveals send failures to the
// requester (that would leak whether the address has an account), it just
// logs and moves on.
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
 * Send the branded password-reset email. Resolves to true on send, false if
 * skipped (no key) or failed. Never throws.
 */
export async function sendPasswordReset(email: string, actionUrl: string): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn("password reset email: RESEND_API_KEY not set, skipping send");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      replyTo: REPLY_TO,
      subject: "Reset your Arro password",
      html: resetHtml(actionUrl),
      text: resetText(actionUrl),
    });
    if (error) {
      console.error("password reset email: send failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("password reset email: send threw", err);
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
const ACCENT = "#0f766e";

const DISPLAY =
  "'DM Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SANS =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function dot(size = 7, color = ACCENT): string {
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background-color:${color};vertical-align:middle;"></span>`;
}

function resetHtml(actionUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>Reset your Arro password</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Reset your Arro password. The link inside is single-use and expires shortly.</div>
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
${dot(7)}<span style="margin-left:9px;">Password reset requested</span>
</div>

<!-- Display headline -->
<h1 class="h1" style="margin:18px 0 0 0;font-family:${DISPLAY};font-size:34px;line-height:1.08;font-weight:500;letter-spacing:0.2px;color:${INK_900};">Reset your<br />password<span style="color:${ACCENT};">.</span></h1>

<p style="margin:18px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK_500};max-width:380px;">
We received a request to reset the password for your Arro account. Click below to choose a new one.
</p>

<!-- CTA -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 0 0;">
<tr><td style="border-radius:4px;background-color:${INK_900};box-shadow:0 1px 2px rgba(11,14,20,0.10);">
<a href="${actionUrl}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:13px;font-weight:600;color:#ffffff;letter-spacing:0.2px;">Reset password&nbsp;&nbsp;&rarr;</a>
</td></tr>
</table>

<div style="margin:32px 0 0 0;border-top:1px solid ${INK_150};"></div>

<p style="margin:20px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_600};">
This link is single-use and expires shortly. If you didn't request a password reset, you can safely ignore this email - your password won't change.
</p>

</td>
</tr>
</table>

<!-- Footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">
<tr><td style="padding:22px 6px 0 6px;font-family:${SANS};">
<div style="font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:${INK_400};">${dot(5)}<span style="margin-left:8px;">Arro &middot; Construction, accelerated by AI</span></div>
<div style="margin-top:10px;font-size:11px;line-height:1.5;color:${INK_400};">You're receiving this because a password reset was requested for your account at <a href="https://arro.co.nz" style="color:${INK_500};">arro.co.nz</a>.</div>
</td></tr>
</table>

</td>
</tr>
</table>
</body>
</html>`;
}

function resetText(actionUrl: string): string {
  return [
    "ARRO · PASSWORD RESET REQUESTED",
    "",
    "Reset your password.",
    "",
    "We received a request to reset the password for your Arro account.",
    "Use the link below to choose a new one.",
    "",
    `Reset password: ${actionUrl}`,
    "",
    "This link is single-use and expires shortly. If you didn't request this, ignore this email - your password won't change.",
    "",
    "Arro · Construction, accelerated by AI",
  ].join("\n");
}
