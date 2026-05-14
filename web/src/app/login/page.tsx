"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
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
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(next as Route);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-ink-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Sign in to ATLAS</h1>
          <p className="mt-1 text-sm text-ink-600">Use your account email and password.</p>
        </div>

        <label className="block text-sm">
          <span className="text-ink-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-500 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-ink-700">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-500 focus:outline-none"
          />
        </label>

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-ink-900 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
