import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ProfileMenu } from "@/components/auth/profile-menu";

// Landing-page header auth area. Signed-out visitors get a "Sign in" link;
// signed-in visitors get their profile menu for settings / sign out. The
// "Launch the platform" CTA itself lives in the hero copy, not the header.
export async function LandingAuthCta() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="font-display uppercase tracking-[0.14em] text-[14px] font-medium text-ink-600 transition-colors hover:text-ink-900"
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
