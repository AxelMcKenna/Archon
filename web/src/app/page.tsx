import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NeuralSphere } from "@/components/neural-sphere";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-canvas text-ink-900">
      {/* Top bar */}
      <header className="relative z-20 flex w-full items-center px-10 py-6">
        <Link
          href="/"
          className="font-display uppercase font-bold tracking-[0.16em] text-[22px] text-ink-900 transition-colors hover:text-ink-700"
        >
          Atlas
        </Link>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-[1280px] px-8 pt-12 md:pt-20 pb-24">
        <div className="grid w-full grid-cols-12 gap-x-10 items-center">
          {/* Left column — text */}
          <div className="col-span-12 md:col-span-7 lg:col-span-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
              Atlas - Construction Management
            </div>
            <h1
              className="mt-5 uppercase font-medium leading-[0.95] tracking-[0.02em] text-[44px] sm:text-[60px] lg:text-[76px] text-ink-900"
              style={{ fontFamily: "var(--font-dm-sans)" }}
            >
              Construction,
              <br />
              <span className="text-accent">accelerated</span>
              <br />
              by AI.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-600">
              The intelligence behind modern builds. Fluent in every consent,
              every clause, every condition. Alert to every RFI, every
              inspection, every blocker – so your crew can build.
            </p>
            <div className="mt-7 flex items-center gap-5">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-5 py-2.5 text-[13px] font-medium text-white shadow-depth hover:shadow-depth-hover transition-shadow"
              >
                Launch the platform
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <div className="flex items-center gap-2 text-[11px] text-ink-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Indexing 1,284 consent conditions in real time
              </div>
            </div>
          </div>

          {/* Right column — sphere, centered against text */}
          <div className="relative col-span-12 md:col-span-5 lg:col-span-6 mt-12 md:mt-0 flex items-center justify-center">
            <div className="relative w-full md:-mr-6 lg:-mr-12">
              <NeuralSphere className="h-[400px] w-full md:h-[500px] lg:h-[580px]" />
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
