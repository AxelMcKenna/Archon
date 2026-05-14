import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type CookieSet = { name: string; value: string; options?: CookieOptions };

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing Supabase environment variable: ${name}`);
  return value;
}

// User-scoped server client. Reads the session from Next.js cookies; all
// queries run as the logged-in user and respect RLS.
export async function getSupabaseServer() {
  const url = requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  );
  const key = requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — middleware handles refresh.
        }
      },
    },
  });
}

// Service-role client for trusted server-side work that must bypass RLS
// (e.g. admin tasks, system writes). Use sparingly.
export function getSupabaseServiceRole() {
  const url = requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  );
  const key = requireEnv(
    "SUPABASE_SECRET_KEY | SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return createClient(url, key, { auth: { persistSession: false } });
}

// Returns the current user's access token (JWT) for forwarding to upstream
// FastAPI services, or null if no active session.
export async function getAccessToken(): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
