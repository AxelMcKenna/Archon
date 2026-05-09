import { createClient } from "@supabase/supabase-js";

// Single-user mode: no auth, no cookies. Server uses the anon key against
// permissive-RLS tables; privileged writes go via the FastAPI service.
export async function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
