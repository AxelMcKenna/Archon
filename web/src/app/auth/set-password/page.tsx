"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The /auth/confirm route should have established a session before sending us
  // here. If there isn't one, the link was used already or opened directly -
  // bounce to login rather than show a form that can't submit.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?error=invite_expired" as Route);
        return;
      }
      setEmail(data.user.email ?? null);
      setChecking(false);
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/projects" as Route);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-canvas px-4 text-ink-900">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="glow-drift absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.08] blur-[130px]" />
      </div>
      <div aria-hidden className="grain pointer-events-none fixed inset-0 -z-10" />

      <div className="w-full max-w-sm">
        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-lg bg-surface-elevated p-8 shadow-depth"
        >
          <div className="flex flex-col items-center text-center">
            <Link
              href="/"
              className="font-display uppercase font-bold tracking-[0.16em] text-[22px] text-ink-900 transition-colors hover:text-ink-700"
            >
              Arro
            </Link>
            <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-ink-500">
              <span className="h-px w-6 bg-accent/50" />
              Create your account
              <span className="h-px w-6 bg-accent/50" />
            </div>
            {email && (
              <p className="mt-3 text-[12.5px] text-ink-500">
                Setting a password for <span className="text-ink-800">{email}</span>
              </p>
            )}
          </div>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.18em] text-ink-500">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={checking}
              className="mt-2 block w-full rounded-md border border-ink-200 bg-surface-canvas px-3 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.18em] text-ink-500">
              Confirm password
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              disabled={checking}
              className="mt-2 block w-full rounded-md border border-ink-200 bg-surface-canvas px-3 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || checking}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-depth transition-shadow hover:shadow-depth-hover disabled:opacity-50"
          >
            {busy ? "Creating account…" : checking ? "Verifying invite…" : "Create account"}
            {!busy && !checking && <ArrowUpRight className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
