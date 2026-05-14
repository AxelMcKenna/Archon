import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function UserMenu() {
  const supabase = await getSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? null;

  if (!email) {
    return (
      <Link
        href="/login"
        className="font-display uppercase tracking-[0.14em] text-[14px] text-ink-700 transition-colors hover:text-ink-900"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="hidden text-[12px] uppercase tracking-[0.18em] text-ink-500 md:inline">
        {email}
      </span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="font-display uppercase tracking-[0.14em] text-[14px] text-ink-700 transition-colors hover:text-ink-900"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
