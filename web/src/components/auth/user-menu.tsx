import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function UserMenu() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="font-display uppercase tracking-[0.14em] text-[13px] text-ink-700 transition-colors hover:text-ink-900"
      >
        Sign in
      </Link>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.username || user.email || "Account";

  return (
    <div className="flex items-center gap-3">
      <span className="hidden font-display uppercase tracking-[0.14em] text-[13px] leading-none text-ink-700 md:inline">
        {displayName}
      </span>
      <span aria-hidden className="hidden h-3.5 w-px bg-ink-900/15 md:inline-block" />
      <form action="/auth/signout" method="post" className="leading-none">
        <button
          type="submit"
          className="font-display uppercase tracking-[0.14em] text-[13px] leading-none text-ink-500 transition-colors hover:text-ink-900"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
