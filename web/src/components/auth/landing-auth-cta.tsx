import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ProfileMenu } from "@/components/auth/profile-menu";

// Landing-page header auth area. Signed-out visitors get a "Sign in" link;
// signed-in visitors get a prominent "Launch the platform" button into the app
// (plus their profile menu for settings / sign out). Distinct from UserMenu so
// the in-app nav doesn't get a redundant launch button.
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

  return (
    <div className="flex items-center gap-5">
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-depth transition-shadow hover:shadow-depth-hover"
      >
        Launch the platform
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
      <ProfileMenu displayName={displayName} />
    </div>
  );
}
