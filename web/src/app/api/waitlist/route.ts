import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { sendWaitlistConfirmation } from "@/lib/email/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal, pragmatic email shape check — the DB unique index is the real
// guard; this just rejects obvious garbage before we touch the database.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawEmail = (body as { email?: unknown })?.email;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const source =
    typeof (body as { source?: unknown })?.source === "string"
      ? ((body as { source: string }).source).slice(0, 120)
      : "landing-cta";

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // Anon/publishable client: the `waitlist_anon_insert` RLS policy on
  // public.waitlist grants anon INSERT only (no read-back), so the public
  // waitlist form works without a service-role secret.
  let supabase;
  try {
    supabase = await getSupabaseServer();
  } catch (err) {
    console.error("waitlist: missing Supabase config", err);
    return NextResponse.json(
      { error: "Waitlist is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("waitlist").insert({ email, source });

  if (error) {
    // 23505 = unique_violation: the email is already on the list. Treat as a
    // success so we never reveal whether an address was previously submitted.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, alreadyJoined: true });
    }
    console.error("waitlist: insert failed", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  // Fresh signup — send the branded confirmation. Best-effort: never let an
  // email failure turn a successful signup into an error for the user.
  await sendWaitlistConfirmation(email);

  return NextResponse.json({ ok: true });
}
