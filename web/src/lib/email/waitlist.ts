import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Waitlist confirmation email
//
// Sending is best-effort: if RESEND_API_KEY is unset (local/dev) or the API
// errors, we log and move on. A confirmation email must never block or fail a
// waitlist signup.
//
// `WAITLIST_FROM_EMAIL` must be an address on a domain you've verified in
// Resend. Until arro.co.nz is verified, Resend's shared test sender
// (onboarding@resend.dev) works out of the box. Replies route to
// `WAITLIST_REPLY_TO` so a Gmail inbox can field responses even though Resend
// can't *send* from gmail.com.
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
 * Send the branded waitlist confirmation. Resolves to true on send, false if
 * skipped (no key) or failed. Never throws.
 */
export async function sendWaitlistConfirmation(email: string): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn("waitlist email: RESEND_API_KEY not set, skipping confirmation");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      replyTo: REPLY_TO,
      subject: "You're on the Arro waitlist",
      html: confirmationHtml(),
      text: confirmationText(),
    });
    if (error) {
      console.error("waitlist email: send failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("waitlist email: send threw", err);
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

// Font stacks lead with the site's actual faces (DM Sans for display, Inter for
// body), pulled in via the @import in <head>. Clients that honour web fonts
// (Apple Mail, iOS Mail) render the real brand type; the rest fall back to a
// near-identical geometric-sans system stack. The brand language (uppercase
// tracked micro-labels, teal accent, dark wordmark) survives either way.
const DISPLAY =
  "'DM Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SANS =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Small reusable bits keep the markup readable.
function dot(size = 7, color = ACCENT): string {
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background-color:${color};vertical-align:middle;"></span>`;
}

function bullet(text: string): string {
  return `<tr><td style="padding:7px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${INK_700};vertical-align:top;">
<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:${ACCENT};vertical-align:middle;margin:0 10px 2px 0;"></span>${text}
</td></tr>`;
}

export function confirmationHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>You're on the Arro waitlist</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">You're on the Arro waitlist. We'll be in touch as we open up access.</div>
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
${dot(7)}<span style="margin-left:9px;">Now onboarding early teams</span>
</div>

<!-- Display headline -->
<h1 class="h1" style="margin:18px 0 0 0;font-family:${DISPLAY};font-size:34px;line-height:1.08;font-weight:500;letter-spacing:0.2px;color:${INK_900};">You're on the<br />waitlist<span style="color:${ACCENT};">.</span></h1>

<p style="margin:18px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK_500};max-width:380px;">
Thanks for joining. We're onboarding early teams now, and you'll be among the first to bring your projects, drawings, and RFIs into Arro.
</p>

<!-- Inset panel echoing the site's product cards -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0 0;background-color:${SURFACE_SUNKEN};border:1px solid ${INK_150};border-radius:4px;">
<tr>
<td style="padding:14px 18px 4px 18px;font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${INK_500};">${dot(6)}<span style="margin-left:8px;">What you get</span></td>
</tr>
<tr><td style="padding:6px 18px 16px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${bullet("First access to plan analysis &amp; RFI auto-response")}
${bullet("NZBC &amp; council-ready from day one")}
${bullet("No spam, ever. Just a note when access opens")}
</table>
</td></tr>
</table>

<!-- CTA -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 0 0;">
<tr><td style="border-radius:4px;background-color:${INK_900};box-shadow:0 1px 2px rgba(11,14,20,0.10);">
<a href="https://arro.co.nz" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:13px;font-weight:600;color:#ffffff;letter-spacing:0.2px;">Visit Arro&nbsp;&nbsp;&rarr;</a>
</td></tr>
</table>

<div style="margin:32px 0 0 0;border-top:1px solid ${INK_150};"></div>

<p style="margin:20px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_600};">
Questions? Just reply to this email. It reaches a real person.
</p>

</td>
</tr>
</table>

<!-- Footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">
<tr><td style="padding:22px 6px 0 6px;font-family:${SANS};">
<div style="font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:${INK_400};">${dot(5)}<span style="margin-left:8px;">Arro &middot; Construction, accelerated by AI</span></div>
<div style="margin-top:10px;font-size:11px;line-height:1.5;color:${INK_400};">You're receiving this because you joined the waitlist at <a href="https://arro.co.nz" style="color:${INK_500};">arro.co.nz</a>.</div>
</td></tr>
</table>

</td>
</tr>
</table>
</body>
</html>`;
}

function confirmationText(): string {
  return [
    "ARRO · WAITLIST CONFIRMED",
    "",
    "You're on the list.",
    "",
    "Thanks for joining the Arro waitlist. We're now onboarding early teams.",
    "You'll be among the first to bring your projects, drawings, and RFIs into Arro.",
    "",
    "We'll reach out as we open up access. No spam, ever.",
    "",
    "Visit Arro: https://arro.co.nz",
    "",
    "Questions? Just reply to this email. It reaches a real person.",
    "",
    "Arro · Construction, accelerated by AI",
    "You're receiving this because you joined the waitlist at arro.co.nz.",
  ].join("\n");
}
