import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieSet = { name: string; value: string; options?: CookieOptions };

// Verifies a one-time email token (invite / recovery / magiclink) and writes
// the session cookies, then forwards to `next`. This is the landing point for
// the invite link generated in /api/admin/invite.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/projects";

  const failure = NextResponse.redirect(new URL("/login?error=invite_invalid", origin));

  if (!token_hash || !type) return failure;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return failure;

  let response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieSet[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    console.error("auth/confirm: verifyOtp failed", error);
    return failure;
  }

  return response;
}
