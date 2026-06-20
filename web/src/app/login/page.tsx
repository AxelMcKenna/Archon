"use client";

import { Suspense, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    // Keep the button in its loading state through the navigation + refresh —
    // resetting here would flash an idle "Sign in" while the next page loads.
    router.replace(next as Route);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-canvas px-4 text-ink-900">
      {/* Atmosphere — soft accent glow + faint grain, matching the landing page */}
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
              Welcome back
              <span className="h-px w-6 bg-accent/50" />
            </div>
          </div>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.18em] text-ink-500">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-2 block w-full rounded-md border border-ink-200 bg-surface-canvas px-3 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.18em] text-ink-500">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-2 block w-full rounded-md border border-ink-200 bg-surface-canvas px-3 py-2.5 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-depth transition-shadow hover:shadow-depth-hover disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "Signing in…" : "Sign in"}
            {!busy && <ArrowUpRight className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
