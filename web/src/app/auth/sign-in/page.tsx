"use client";

import { Suspense, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInPageSkeleton />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = (params.get("next") ?? "/projects") as Route;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold mb-6">
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </h1>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.co.nz"
          className="w-full rounded border border-ink-700/20 px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="w-full rounded border border-ink-700/20 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-lg bg-ink-900 text-white py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        className="mt-4 text-sm text-ink-500 hover:text-ink-900"
      >
        {mode === "sign-in" ? "Need an account?" : "Already have one?"}
      </button>
    </div>
  );
}

function SignInPageSkeleton() {
  return <div className="max-w-sm mx-auto px-6 py-16" />;
}
