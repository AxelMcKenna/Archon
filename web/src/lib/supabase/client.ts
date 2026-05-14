import { createBrowserClient } from "@supabase/ssr";

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing Supabase environment variable: ${name}`);
  return value;
}

export function getSupabaseBrowser() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return createBrowserClient(url, key);
}
