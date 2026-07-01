"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      // The API always responds ok regardless of whether the account exists -
      // that's intentional, so this message never confirms or denies an email
      // is registered.
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-canvas px-4 text-ink-900">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="glow-drift absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.08] blur-[130px]" />
      </div>
      <div aria-hidden className="grain pointer-events-none fixed inset-0 -z-10" />

      <div className="w-full max-w-sm">
        <div className="space-y-5 rounded-lg bg-surface-elevated p-8 shadow-depth">
          <div className="flex flex-col items-center text-center">
            <Link
              href="/"
              className="font-display uppercase font-bold tracking-[0.16em] text-[22px] text-ink-900 transition-colors hover:text-ink-700"
            >
              Arro
            </Link>
            <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-ink-500">
              <span className="h-px w-6 bg-accent/50" />
              Forgot password
              <span className="h-px w-6 bg-accent/50" />
            </div>
          </div>

          {sent ? (
            <p className="text-center text-[13px] leading-relaxed text-ink-600">
              If an account exists for <span className="text-ink-800">{email}</span>, we've
              sent a link to reset your password. It'll expire shortly.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <p className="text-center text-[13px] leading-relaxed text-ink-500">
                Enter your email and we'll send you a link to reset your password.
              </p>

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
                {busy ? "Sending…" : "Send reset link"}
                {!busy && <ArrowUpRight className="h-3.5 w-3.5" />}
              </button>
            </form>
          )}

          <p className="text-center text-[12.5px] text-ink-500">
            <Link href="/login" className="text-ink-700 underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
