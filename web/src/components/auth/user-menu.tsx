import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ProfileMenu } from "@/components/auth/profile-menu";

export async function UserMenu() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="font-display uppercase tracking-[0.14em] text-[14px] font-medium text-ink-400 transition-colors hover:text-ink-50"
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

  return <ProfileMenu displayName={displayName} />;
}
