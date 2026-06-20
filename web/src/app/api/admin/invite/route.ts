import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseServiceRole } from "@/lib/supabase/server";
import { sendAccountInvite } from "@/lib/email/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Constant-time bearer-token check against INVITE_SECRET.
function authorized(req: Request): boolean {
  const secret = process.env.INVITE_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Base URL for the invite link. Prefer an explicit env, fall back to the
// request origin (correct on Vercel where the request host is the site).
function siteUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  if (!process.env.INVITE_SECRET) {
    return NextResponse.json({ error: "Invites are not configured." }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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

  let admin;
  try {
    admin = getSupabaseServiceRole();
  } catch (err) {
    console.error("invite: missing service-role config", err);
    return NextResponse.json({ error: "Invites are not configured." }, { status: 503 });
  }

  const site = siteUrl(req);
  const redirectTo = `${site}/auth/confirm`;

  // generateLink creates the pending auth.users row and returns a one-time
  // token — it does NOT send an email itself, so there's no double-send.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.hashed_token) {
    const msg = error?.message ?? "Could not generate an invite link.";
    // A user that already exists is the common case — surface it clearly.
    const status = /already|exists|registered/i.test(msg) ? 409 : 500;
    console.error("invite: generateLink failed", error);
    return NextResponse.json({ error: msg }, { status });
  }

  // Build a link that lands on our own /auth/confirm route (keeps the clicked
  // URL on the app domain) which verifies the token and starts the session.
  const confirmUrl = new URL(`${site}/auth/confirm`);
  confirmUrl.searchParams.set("token_hash", data.properties.hashed_token);
  confirmUrl.searchParams.set("type", "invite");
  confirmUrl.searchParams.set("next", "/auth/set-password");

  const sent = await sendAccountInvite(email, confirmUrl.toString());
  if (!sent) {
    return NextResponse.json(
      { error: "Invite user created, but the email failed to send. Check RESEND_API_KEY." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email });
}
