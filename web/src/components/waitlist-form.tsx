"use client";

import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function WaitlistForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [joined, setJoined] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const value = email.trim();
    if (!value) {
      toast.error("Please enter your email address.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source: "landing-cta" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        alreadyJoined?: boolean;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setJoined(true);
      setEmail("");
      toast.success(
        data.alreadyJoined
          ? "You're already on the list — we'll be in touch."
          : "You're on the list. We'll be in touch soon.",
      );
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (joined) {
    return (
      <div className="flex w-full items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-[14px] font-medium text-emerald-900">
        <Check className="h-4 w-4 shrink-0" />
        You&apos;re on the waitlist.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col items-stretch gap-3 sm:flex-row"
    >
      <label htmlFor="waitlist-email" className="sr-only">
        Email address
      </label>
      <input
        id="waitlist-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
        placeholder="you@company.com"
        className="min-w-0 flex-1 rounded-md border border-ink-150 bg-surface-canvas px-4 py-3 text-[14px] text-ink-900 placeholder:text-ink-400 shadow-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-ink-900 px-6 py-3 text-[14px] font-medium text-white shadow-depth transition-shadow hover:shadow-depth-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join waitlist"}
        {!pending && <ArrowUpRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
