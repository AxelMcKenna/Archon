import { NextResponse } from "next/server";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import { sendPasswordReset } from "@/lib/email/password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Base URL for the reset link. Prefer an explicit env, fall back to the
// request origin (correct on Vercel where the request host is the site).
function siteUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return new URL(req.url).origin;
}

// Public, unauthenticated by design - anyone can ask to reset the password
// for any email. Always responds with the same generic {ok:true} regardless
// of whether the address has an account, so this can't be used to enumerate
// registered users (mirrors the /api/waitlist duplicate-signup handling).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawEmail = (body as { email?: unknown })?.email;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  const generic = NextResponse.json({ ok: true });

  let admin;
  try {
    admin = getSupabaseServiceRole();
  } catch (err) {
    console.error("forgot-password: missing service-role config", err);
    return generic;
  }

  const site = siteUrl(req);

  // generateLink also validates the account exists - a "not found" error here
  // is the common case (no account for this email) and must stay silent.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${site}/auth/confirm` },
  });

  if (error || !data?.properties?.hashed_token) {
    if (error && !/not.*found|no.*user/i.test(error.message)) {
      console.error("forgot-password: generateLink failed", error);
    }
    return generic;
  }

  const confirmUrl = new URL(`${site}/auth/confirm`);
  confirmUrl.searchParams.set("token_hash", data.properties.hashed_token);
  confirmUrl.searchParams.set("type", "recovery");
  confirmUrl.searchParams.set("next", "/auth/reset-password");

  const sent = await sendPasswordReset(email, confirmUrl.toString());
  if (!sent) {
    console.error("forgot-password: email failed to send", email);
  }

  return generic;
}
