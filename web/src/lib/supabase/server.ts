import { createClient } from "@supabase/supabase-js";

/**
 * Single-user mode: Supabase JS client used for server-side reads in pages.
 * RLS is disabled on user tables; the anon key reads/writes freely.
 */
export async function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
