import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${name}`);
  }
  return value;
}

// Single-user mode: no auth, no cookies. Prefer server-side secret key when
// present; fall back to publishable/anon key for compatibility.
export async function getSupabaseServer() {
  const url = requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  );
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

  return createClient(
    url,
    requireEnv(
      "SUPABASE_SECRET_KEY | SUPABASE_SERVICE_ROLE_KEY | SUPABASE_ACCESS_TOKEN | NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY",
      key,
    ),
    { auth: { persistSession: false } },
  );
}
