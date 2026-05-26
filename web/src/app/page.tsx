import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { NeuralSphere } from "@/components/neural-sphere-lazy";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSignedIn = !!user;

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface-canvas text-ink-900">
      {/* Top bar */}
      <header className="relative z-20 flex w-full items-center justify-between px-10 py-6">
        <Link
          href="/"
          className="font-display uppercase font-bold tracking-[0.16em] text-[22px] text-ink-900 transition-colors hover:text-ink-700"
        >
          Atlas
        </Link>
        <Link
          href={isSignedIn ? "/dashboard" : "/login"}
          className="font-display uppercase tracking-[0.14em] text-[14px] text-ink-700 transition-colors hover:text-ink-900"
        >
          {isSignedIn ? "Open app" : "Sign in"}
        </Link>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-[1440px] px-8 pt-12 md:pt-20 pb-24">
        <div className="grid w-full grid-cols-12 gap-x-10 items-center">
          {/* Left column – text */}
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
                {isSignedIn ? "Open app" : "Launch the platform"}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <div className="flex items-center gap-2 text-[11px] text-ink-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Indexing 1,284 consent conditions in real time
              </div>
            </div>
          </div>

          {/* Right column – sphere, centered against text */}
          <div className="relative col-span-12 md:col-span-5 lg:col-span-6 mt-12 md:mt-0 flex items-center justify-center">
            <div className="relative w-full md:-mr-6 lg:-mr-12">
              <NeuralSphere intent="thinking" className="h-[400px] w-full md:h-[500px] lg:h-[580px]" />
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 hidden md:flex flex-col items-center gap-1.5 text-ink-400">
          <span className="font-display uppercase tracking-[0.22em] text-[10px]">
            Discover
          </span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </div>
      </section>

      <main>
        {/* 01 – Project Management */}
        <section className="relative border-t border-ink-100 py-24 md:py-32">
          <div className="mx-auto grid max-w-[1440px] grid-cols-12 items-center gap-x-10 px-8">
            <div className="col-span-12 md:col-span-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-accent">
                01 – Project Management
              </div>
              <h2
                className="mt-5 font-medium leading-[1.02] tracking-[0.01em] text-[40px] md:text-[56px] text-ink-900"
                style={{ fontFamily: "var(--font-dm-sans)" }}
              >
                Every project,
                <br />
                one source of truth.
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-600">
                Track every build from lodgement to sign-off. Addresses, BCA
                references, consent status, and inspections – surfaced in a
                single, queryable workspace.
              </p>
              <ul className="mt-6 space-y-2 text-[13px] text-ink-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Live consent and RFI status per project
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Address autocompletion and BCA linkage
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Timeline view across inspections and milestones
                </li>
              </ul>
            </div>

            <div className="col-span-12 md:col-span-7 mt-12 md:mt-0">
              <div className="rounded-lg bg-surface-elevated shadow-depth">
                <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-500">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                    Active projects
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-ink-400">
                    12 of 47
                  </div>
                </div>
                <div className="divide-y divide-ink-100">
                  {[
                    {
                      name: "Bayswater Townhouses",
                      addr: "14 Bayswater Rd, Mt Eden",
                      pct: 72,
                      status: "Active",
                      tone: "accent",
                    },
                    {
                      name: "Greenlane Mixed-Use",
                      addr: "228 Great South Rd",
                      pct: 41,
                      status: "Review",
                      tone: "amber",
                    },
                    {
                      name: "Onehunga Retail Fitout",
                      addr: "9 Princes St",
                      pct: 88,
                      status: "Active",
                      tone: "accent",
                    },
                    {
                      name: "Henderson Warehouse",
                      addr: "31 Edmonton Rd",
                      pct: 18,
                      status: "Blocked",
                      tone: "red",
                    },
                    {
                      name: "Takapuna Apartments",
                      addr: "5 Lake Rd",
                      pct: 54,
                      status: "Active",
                      tone: "accent",
                    },
                  ].map((row) => (
                    <div
                      key={row.name}
                      className="grid grid-cols-12 items-center gap-4 px-5 py-3.5"
                    >
                      <div className="col-span-5">
                        <div className="text-[13px] font-medium text-ink-900">
                          {row.name}
                        </div>
                        <div className="text-[11px] text-ink-500">{row.addr}</div>
                      </div>
                      <div className="col-span-4 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className={
                              row.tone === "red"
                                ? "h-full bg-red-500"
                                : row.tone === "amber"
                                ? "h-full bg-orange-500"
                                : "h-full bg-accent"
                            }
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-ink-500 w-8 text-right">
                          {row.pct}%
                        </div>
                      </div>
                      <div className="col-span-3 flex justify-end">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] " +
                            (row.tone === "red"
                              ? "bg-red-50 text-red-700"
                              : row.tone === "amber"
                              ? "bg-orange-50 text-orange-700"
                              : "bg-accent-soft text-accent")
                          }
                        >
                          <span
                            className={
                              "inline-block h-1 w-1 rounded-full " +
                              (row.tone === "red"
                                ? "bg-red-500"
                                : row.tone === "amber"
                                ? "bg-orange-500"
                                : "bg-accent")
                            }
                          />
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 02 – Plan Analysis */}
        <section className="relative border-t border-ink-100 bg-surface-sunken py-24 md:py-32">
          <div className="mx-auto max-w-[1440px] px-8">
            <div className="grid grid-cols-12 gap-x-10">
              <div className="col-span-12 md:col-span-7">
                <div className="text-[11px] uppercase tracking-[0.22em] text-accent">
                  02 – Plan Analysis
                </div>
                <h2
                  className="mt-5 font-medium leading-[1.02] tracking-[0.01em] text-[40px] md:text-[56px] text-ink-900"
                  style={{ fontFamily: "var(--font-dm-sans)" }}
                >
                  Catch issues
                  <br />
                  before lodgement.
                </h2>
                <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-600">
                  Drop in your drawing set. Atlas reads every sheet, runs each
                  room against the NZBC, and lands each finding on the exact
                  region of the page – with the clause it breaches.
                </p>
              </div>
              <div className="col-span-12 md:col-span-5 mt-6 md:mt-0 md:pt-20">
                <ul className="space-y-2 text-[13px] text-ink-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                    Multi-sheet ingest with sheet & revision tracking
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                    Severity-graded findings, each tied to a NZBC clause
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                    Findings link to exact bbox regions on the plan
                  </li>
                </ul>
              </div>
            </div>

            {/* Full-width product window */}
            <div className="mt-12 md:mt-16 overflow-hidden rounded-lg bg-surface-elevated shadow-depth">
              {/* Sheet metadata bar */}
              <div className="flex items-center justify-between border-b border-ink-100 bg-surface-canvas px-5 py-2 font-mono tabular-nums text-[11.5px] uppercase tracking-[0.16em] text-ink-500">
                <span>
                  A-101 · Ground floor plan · Rev. C · 26.05.2026
                </span>
                <span>1 : 100 @ A1</span>
              </div>

              {/* Drawing + Findings */}
              <div className="grid grid-cols-12">
                {/* Drawing area */}
                <div className="col-span-12 border-r border-ink-100 lg:col-span-8">
                  <div
                    className="relative aspect-[16/11] w-full bg-surface-canvas"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, rgba(15,17,21,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,17,21,0.04) 1px, transparent 1px)",
                      backgroundSize: "24px 24px",
                    }}
                  >
                    {/* Grid axis labels – top */}
                    {[1, 2, 3, 4, 5].map((n, i) => (
                      <div
                        key={`t-${n}`}
                        className="absolute -translate-x-1/2 font-mono tabular-nums text-[11px] text-ink-400"
                        style={{ left: `${10 + i * 20}%`, top: "2.5%" }}
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-300 bg-surface-elevated">
                          {n}
                        </div>
                      </div>
                    ))}
                    {/* Grid axis labels – left */}
                    {["A", "B", "C", "D", "E"].map((l, i) => (
                      <div
                        key={`l-${l}`}
                        className="absolute -translate-y-1/2 font-mono text-[11px] text-ink-400"
                        style={{ top: `${14 + i * 19}%`, left: "2%" }}
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-300 bg-surface-elevated">
                          {l}
                        </div>
                      </div>
                    ))}

                    {/* Dimension strings – top */}
                    <div
                      className="absolute font-mono tabular-nums text-[10.5px] text-ink-400"
                      style={{ left: "18%", top: "7%" }}
                    >
                      4 200
                    </div>
                    <div
                      className="absolute font-mono tabular-nums text-[10.5px] text-ink-400"
                      style={{ left: "38%", top: "7%" }}
                    >
                      4 200
                    </div>
                    <div
                      className="absolute font-mono tabular-nums text-[10.5px] text-ink-400"
                      style={{ left: "58%", top: "7%" }}
                    >
                      4 200
                    </div>
                    <div
                      className="absolute font-mono tabular-nums text-[10.5px] text-ink-400"
                      style={{ left: "78%", top: "7%" }}
                    >
                      4 200
                    </div>

                    {/* Outer walls */}
                    <div className="absolute border-[2.5px] border-ink-800/85" style={{ left: "8%", right: "8%", top: "12%", bottom: "8%" }} />

                    {/* Inner partitions – proper townhouse layout
                        Open plan (Living/Kitchen/Dining):  x 8–72,  y 12–46
                        Hall corridor:                       x 22–72, y 46–54
                        Stair (in hall band, west end):      x 8–22,  y 46–54
                        Bedroom 1 (master):                  x 8–30,  y 54–92
                        Bath:                                x 30–46, y 54–92
                        Bedroom 2:                           x 46–58, y 54–92
                        Bedroom 3:                           x 58–72, y 54–92
                        Garage (full height, right side):    x 72–92, y 12–92 */}
                    {/* Garage divider (full height) */}
                    <div className="absolute w-[2px] bg-ink-800/75" style={{ left: "72%", top: "12%", bottom: "8%" }} />
                    {/* Hall top wall */}
                    <div className="absolute h-[2px] bg-ink-800/75" style={{ left: "8%", top: "46%", width: "64%" }} />
                    {/* Hall bottom wall (top of bedroom row) */}
                    <div className="absolute h-[2px] bg-ink-800/75" style={{ left: "8%", top: "54%", width: "64%" }} />
                    {/* Stair / Hall divider */}
                    <div className="absolute w-[2px] bg-ink-800/75" style={{ left: "22%", top: "46%", height: "8%" }} />
                    {/* Bedroom row partitions */}
                    <div className="absolute w-[2px] bg-ink-800/75" style={{ left: "30%", top: "54%", bottom: "8%" }} />
                    <div className="absolute w-[2px] bg-ink-800/75" style={{ left: "46%", top: "54%", bottom: "8%" }} />
                    <div className="absolute w-[2px] bg-ink-800/75" style={{ left: "58%", top: "54%", bottom: "8%" }} />

                    {/* Door swing arcs */}
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full text-ink-700/55"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {/* Front door – north exterior wall into Living */}
                      <path d="M 15 12 A 4 4 0 0 1 19 16" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="15" y1="12" x2="19" y2="12.2" stroke="currentColor" strokeWidth="0.35" />
                      {/* Open plan → Hall (north wall of hall, into living area above) */}
                      <path d="M 38 46 A 4 4 0 0 0 42 42" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="38" y1="46" x2="42" y2="46.2" stroke="currentColor" strokeWidth="0.35" />
                      {/* Stair → Hall (east wall of Stair) */}
                      <path d="M 22 49 A 4 4 0 0 1 26 53" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="22" y1="49" x2="22.2" y2="53" stroke="currentColor" strokeWidth="0.35" />
                      {/* Garage ↔ Hall (vertical wall x=72) */}
                      <path d="M 72 49 A 4 4 0 0 0 68 53" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="72" y1="49" x2="71.8" y2="53" stroke="currentColor" strokeWidth="0.35" />
                      {/* Bedroom 1 (Master) door */}
                      <path d="M 16 54 A 4 4 0 0 1 20 58" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="16" y1="54" x2="20" y2="54.2" stroke="currentColor" strokeWidth="0.35" />
                      {/* Bath door */}
                      <path d="M 34 54 A 4 4 0 0 1 38 58" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="34" y1="54" x2="38" y2="54.2" stroke="currentColor" strokeWidth="0.35" />
                      {/* Bedroom 2 door */}
                      <path d="M 48 54 A 4 4 0 0 1 52 58" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="48" y1="54" x2="52" y2="54.2" stroke="currentColor" strokeWidth="0.35" />
                      {/* Bedroom 3 door */}
                      <path d="M 62 54 A 4 4 0 0 1 66 58" stroke="currentColor" strokeWidth="0.22" fill="none" />
                      <line x1="62" y1="54" x2="66" y2="54.2" stroke="currentColor" strokeWidth="0.35" />
                    </svg>

                    {/* Stair treads + up-arrow (Stair box x=8-22, y=46-54) */}
                    <div
                      className="pointer-events-none absolute"
                      style={{ left: "10%", top: "47%", width: "11.5%", height: "6.5%" }}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div
                          key={`tread-${i}`}
                          className="absolute h-px bg-ink-700/45"
                          style={{ left: 0, right: 0, top: `${i * 14}%` }}
                        />
                      ))}
                      <svg
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                        width="10"
                        height="14"
                        viewBox="0 0 10 14"
                      >
                        <path
                          d="M5 1 L9 6 L6 6 L6 13 L4 13 L4 6 L1 6 Z"
                          fill="rgba(15,17,21,0.32)"
                        />
                      </svg>
                    </div>

                    {/* Kitchen counter + fixtures (right half of open plan) */}
                    {/* Counter strip along north wall of kitchen */}
                    <div
                      className="absolute border-b border-ink-700/45 bg-ink-100/40"
                      style={{ left: "44.5%", top: "13.5%", width: "27%", height: "3.2%" }}
                    />
                    {/* Sink */}
                    <div
                      className="absolute rounded-sm border border-ink-700/55 bg-ink-100/50"
                      style={{ left: "48%", top: "14%", width: "5%", height: "2.2%" }}
                    >
                      <div className="absolute inset-[1.5px] rounded-sm border border-ink-700/35" />
                    </div>
                    {/* Hob – 2x2 burners */}
                    {[
                      [0, 0],
                      [1, 0],
                      [0, 1],
                      [1, 1],
                    ].map(([cx, cy], i) => (
                      <div
                        key={`hob-${i}`}
                        className="absolute rounded-full border border-ink-700/65"
                        style={{
                          left: `${62 + cx * 1.6}%`,
                          top: `${14 + cy * 1.5}%`,
                          width: "1.3%",
                          height: "1.3%",
                        }}
                      />
                    ))}
                    {/* Island in dining area */}
                    <div
                      className="absolute rounded-sm border border-ink-700/45 bg-ink-100/35"
                      style={{ left: "50%", top: "28%", width: "20%", height: "5%" }}
                    />

                    {/* Exterior windows – top wall (Living + Kitchen) */}
                    {[
                      { x: 22, w: 6 },
                      { x: 32, w: 5 },
                      { x: 50, w: 5 },
                      { x: 58, w: 5 },
                    ].map(({ x, w }) => (
                      <div
                        key={`win-t-${x}`}
                        className="pointer-events-none absolute"
                        style={{ left: `${x}%`, top: "11.4%", width: `${w}%`, height: "1.2%" }}
                      >
                        <div className="absolute inset-0 bg-surface-canvas" />
                        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-px bg-ink-700/85" />
                        <div className="absolute left-0 top-0 h-full w-px bg-ink-700/85" />
                        <div className="absolute right-0 top-0 h-full w-px bg-ink-700/85" />
                      </div>
                    ))}

                    {/* Exterior windows – bottom wall (each bedroom + bath highlight) */}
                    {[
                      { x: 13, w: 8 },
                      { x: 34, w: 6 },
                      { x: 48, w: 6 },
                      { x: 60, w: 6 },
                    ].map(({ x, w }) => (
                      <div
                        key={`win-b-${x}`}
                        className="pointer-events-none absolute"
                        style={{ left: `${x}%`, top: "91.4%", width: `${w}%`, height: "1.2%" }}
                      >
                        <div className="absolute inset-0 bg-surface-canvas" />
                        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-px bg-ink-700/85" />
                        <div className="absolute left-0 top-0 h-full w-px bg-ink-700/85" />
                        <div className="absolute right-0 top-0 h-full w-px bg-ink-700/85" />
                      </div>
                    ))}

                    {/* Exterior windows – west wall (Living + Bedroom 1) */}
                    {[
                      { y: 18, h: 5 },
                      { y: 70, h: 6 },
                    ].map(({ y, h }) => (
                      <div
                        key={`win-l-${y}`}
                        className="pointer-events-none absolute"
                        style={{ left: "7.4%", top: `${y}%`, width: "1.2%", height: `${h}%` }}
                      >
                        <div className="absolute inset-0 bg-surface-canvas" />
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-ink-700/85" />
                        <div className="absolute top-0 left-0 h-px w-full bg-ink-700/85" />
                        <div className="absolute bottom-0 left-0 h-px w-full bg-ink-700/85" />
                      </div>
                    ))}

                    {/* Garage roller-door – south wall of Garage */}
                    <div
                      className="pointer-events-none absolute"
                      style={{ left: "76%", top: "91%", width: "14%", height: "2%" }}
                    >
                      <div className="absolute inset-0 bg-surface-canvas" />
                      <div className="absolute inset-x-0 top-0 h-px bg-ink-700/85" />
                      <div className="absolute inset-x-0 bottom-0 h-px bg-ink-700/85" />
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={`gd-${i}`}
                          className="absolute top-0 h-full w-px bg-ink-700/50"
                          style={{ left: `${(i + 1) * 14}%` }}
                        />
                      ))}
                    </div>

                    {/* Room labels */}
                    {[
                      { name: "Living", area: "24.6 m²", x: 18, y: 28 },
                      { name: "Kitchen / Dining", area: "23.4 m²", x: 50, y: 38 },
                      { name: "Stair", area: "4.6 m²", x: 12, y: 49.5, inline: true },
                      { name: "Hall", area: "–", x: 42, y: 49.5, inline: true },
                      { name: "Bedroom 1", area: "14.6 m² · master", x: 11, y: 72 },
                      { name: "Bath", area: "7.8 m²", x: 33, y: 72 },
                      { name: "Bedroom 2", area: "10.1 m²", x: 47.5, y: 72 },
                      { name: "Bedroom 3", area: "10.8 m²", x: 60, y: 72 },
                      { name: "Garage", area: "22.0 m²", x: 78, y: 50 },
                    ].map((r) => (
                      <div
                        key={r.name}
                        className="absolute font-display uppercase tracking-[0.16em] text-ink-700"
                        style={{ left: `${r.x}%`, top: `${r.y}%` }}
                      >
                        {r.inline ? (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11.5px] font-medium">{r.name}</span>
                            <span className="font-mono tabular-nums text-[11px] text-ink-500 normal-case tracking-normal">
                              {r.area}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="text-[11.5px] font-medium">{r.name}</div>
                            <div className="font-mono tabular-nums text-[11px] text-ink-500 normal-case tracking-normal">
                              {r.area}
                            </div>
                          </>
                        )}
                      </div>
                    ))}

                    {/* Flag overlays – encompass room title with vertical clearance for chip header */}
                    {[
                      // Critical: stair handrail – covers the small Stair room
                      { code: "RFI-014", room: "Stair", x: 9, y: 46.5, w: 13, h: 7, tone: "red" },
                      // Critical: bath mechanical extract – Bath title at (33, 72)
                      { code: "RFI-018", room: "Bath", x: 30.5, y: 68, w: 15, h: 12, tone: "red" },
                      // Warn: kitchen hob extract – Kitchen title at (50, 38), bbox covers title + hob area below
                      { code: "RFI-022", room: "Kitchen", x: 48, y: 33, w: 22, h: 13, tone: "amber" },
                      // Warn: garage slab thickening – Garage title at (78, 50)
                      { code: "RFI-026", room: "Garage", x: 73, y: 44, w: 18, h: 14, tone: "amber" },
                      // Warn: bedroom 2 egress sill – BR2 title at (47.5, 72)
                      { code: "RFI-031", room: "Bedroom 2", x: 46.5, y: 68, w: 11, h: 16, tone: "amber" },
                      // Pass: living conditions met – Living title at (18, 28)
                      { code: "LR-01", room: "Living", x: 14, y: 24, w: 16, h: 10, tone: "accent" },
                    ].map((f) => (
                      <div
                        key={f.code}
                        className={
                          "absolute rounded-[2px] " +
                          (f.tone === "red"
                            ? "border-[1.5px] border-red-500/85 bg-red-500/15"
                            : f.tone === "amber"
                            ? "border-[1.5px] border-orange-500/85 bg-orange-500/15"
                            : "border-[1.5px] border-accent/70 bg-accent/10")
                        }
                        style={{
                          left: `${f.x}%`,
                          top: `${f.y}%`,
                          width: `${f.w}%`,
                          height: `${f.h}%`,
                        }}
                      >
                        <span
                          className={
                            "absolute top-0.5 left-0.5 inline-flex items-center gap-1 rounded-[2px] px-1 py-px text-[9.5px] font-medium leading-none text-white " +
                            (f.tone === "red"
                              ? "bg-red-500"
                              : f.tone === "amber"
                              ? "bg-orange-500"
                              : "bg-accent")
                          }
                        >
                          <span className="font-mono tabular-nums">{f.code}</span>
                          <span className="opacity-90 uppercase tracking-[0.08em]">
                            {f.room}
                          </span>
                        </span>
                      </div>
                    ))}

                    {/* Scale bar (bottom-left) */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-sm bg-surface-elevated/90 px-2 py-1 shadow-card">
                      <div className="flex items-center gap-px">
                        <div className="h-1.5 w-3 bg-ink-800/80" />
                        <div className="h-1.5 w-3 bg-ink-200" />
                        <div className="h-1.5 w-3 bg-ink-800/80" />
                        <div className="h-1.5 w-3 bg-ink-200" />
                      </div>
                      <span className="font-mono tabular-nums text-[10.5px] text-ink-500">
                        0 – 2 m
                      </span>
                    </div>

                    {/* Title block (bottom-right) */}
                    <div className="absolute bottom-3 right-3 flex items-stretch overflow-hidden rounded-sm border border-ink-300 bg-surface-elevated shadow-card">
                      <div className="px-2.5 py-1.5">
                        <div className="font-display uppercase tracking-[0.16em] text-[9px] text-ink-500">
                          Sheet
                        </div>
                        <div className="font-mono tabular-nums text-[11.5px] text-ink-800">
                          A-101
                        </div>
                      </div>
                      <div className="border-l border-ink-200 px-2.5 py-1.5">
                        <div className="font-display uppercase tracking-[0.16em] text-[9px] text-ink-500">
                          Scale
                        </div>
                        <div className="font-mono tabular-nums text-[11.5px] text-ink-800">
                          1:100
                        </div>
                      </div>
                      <div className="border-l border-ink-200 px-2.5 py-1.5">
                        <div className="font-display uppercase tracking-[0.16em] text-[9px] text-ink-500">
                          Rev
                        </div>
                        <div className="font-mono tabular-nums text-[11.5px] text-ink-800">
                          C
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-center border-l border-ink-200 px-2 py-1.5 text-ink-700">
                        <svg width="12" height="14" viewBox="0 0 12 14">
                          <path d="M6 1 L9 9 L6 7.5 L3 9 Z" fill="currentColor" />
                        </svg>
                        <span className="font-mono text-[9px] text-ink-500 leading-none">
                          N
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Findings panel */}
                <div className="col-span-12 lg:col-span-4">
                  <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
                    <div className="font-display uppercase tracking-[0.16em] text-[11.5px] text-ink-500">
                      Findings
                    </div>
                    <div className="inline-flex items-center gap-1 font-mono tabular-nums text-[11.5px] text-ink-500">
                      <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-ink-700">
                        7
                      </span>
                      on this sheet
                    </div>
                  </div>
                  <div className="divide-y divide-ink-100">
                    {[
                      {
                        code: "RFI-014",
                        room: "Stair",
                        sev: "Crit",
                        tone: "red",
                        text: "Handrail height not specified at landing.",
                        ref: "D1/AS1 · cl. 6.1",
                      },
                      {
                        code: "RFI-018",
                        room: "Bath",
                        sev: "Crit",
                        tone: "red",
                        text: "Mechanical extract rate omitted.",
                        ref: "G4/AS1 · cl. 2.3",
                      },
                      {
                        code: "RFI-022",
                        room: "Kitchen",
                        sev: "Warn",
                        tone: "amber",
                        text: "Extract duct route unclear over hob.",
                        ref: "G4/AS1 · cl. 2.4",
                      },
                      {
                        code: "RFI-026",
                        room: "Garage",
                        sev: "Warn",
                        tone: "amber",
                        text: "Slab thickening detail not on drawing.",
                        ref: "B1/AS1 · NZS 3604",
                      },
                      {
                        code: "RFI-031",
                        room: "Bedroom 2",
                        sev: "Warn",
                        tone: "amber",
                        text: "Egress sill height exceeds 1100 mm.",
                        ref: "C/AS1 · cl. 4.3.4",
                      },
                      {
                        code: "RFI-035",
                        room: "Wall R-3",
                        sev: "Warn",
                        tone: "amber",
                        text: "Insulation R-value below schedule.",
                        ref: "H1/AS1 · NZS 4218",
                      },
                      {
                        code: "LR-01",
                        room: "Living",
                        sev: "Pass",
                        tone: "accent",
                        text: "All conditions met. 13 of 13 checks passed.",
                        ref: "–",
                      },
                    ].map((f) => (
                      <div key={f.code} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums text-[11.5px] text-ink-700">
                              {f.code}
                            </span>
                            <span className="text-[11.5px] text-ink-400">·</span>
                            <span className="font-display uppercase tracking-[0.16em] text-[11.5px] text-ink-500">
                              {f.room}
                            </span>
                          </div>
                          <span
                            className={
                              "inline-flex items-center rounded-[2px] px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-wide text-white " +
                              (f.tone === "red"
                                ? "bg-red-500"
                                : f.tone === "amber"
                                ? "bg-orange-500"
                                : "bg-accent")
                            }
                          >
                            {f.sev}
                          </span>
                        </div>
                        <div className="mt-1.5 text-[12.5px] leading-snug text-ink-800">
                          {f.text}
                        </div>
                        {f.ref !== "–" && (
                          <div className="mt-1 font-mono tabular-nums text-[11.5px] text-ink-500">
                            {f.ref}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 03 – RFI Auto-response */}
        <section className="relative border-t border-ink-100 py-24 md:py-32">
          <div className="mx-auto grid max-w-[1440px] grid-cols-12 items-center gap-x-10 px-8">
            <div className="order-2 col-span-12 md:order-2 md:col-span-7 mt-12 md:mt-0">
              <div className="rounded-lg bg-surface-elevated shadow-depth">
                <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="font-mono tabular-nums text-[11px] text-ink-500">
                      RFI-104
                    </div>
                    <div className="text-[12px] text-ink-700">
                      Council response – Bayswater Townhouses
                    </div>
                  </div>
                  <div className="text-[11.5px] uppercase tracking-[0.16em] text-ink-400">
                    Received 2d ago
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent-soft/40 px-3 py-2.5 text-[12px] text-accent">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                      <span className="font-medium">Parsed</span>
                      <span className="text-ink-600">
                        · 3 asks identified · 3 drafted
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[11.5px] text-ink-500">
                      14.6 s
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {[
                      {
                        ref: "Clause 3.4(a)",
                        topic: "Stair · NZS 4121",
                        text: "Provide updated stair calc with riser/going dimensions and handrail height.",
                        source: "A-201 · S-102",
                      },
                      {
                        ref: "Clause 4.1(c)",
                        topic: "Bracing · upper level",
                        text: "Confirm bracing schedule and demand for the upper level.",
                        source: "S-201 · spec §4",
                      },
                      {
                        ref: "Clause 6.2",
                        topic: "Use · basement",
                        text: "Clarify intended use of basement Room 02 and occupancy load.",
                        source: "Consent · §3.1",
                      },
                    ].map((c) => (
                      <div
                        key={c.ref}
                        className="rounded-md border border-ink-200 bg-surface-sunken px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono tabular-nums text-[11.5px] uppercase tracking-[0.16em] text-ink-900">
                                {c.ref}
                              </span>
                              <span className="text-[11.5px] text-ink-600">·</span>
                              <span className="font-display uppercase tracking-[0.16em] text-[11.5px] text-ink-900">
                                {c.topic}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[12.5px] text-ink-900">
                              {c.text}
                            </div>
                          </div>
                          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] uppercase tracking-[0.16em] text-accent">
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 8 8"
                              className="text-accent"
                            >
                              <path
                                d="M1.5 4.2 L3.2 5.9 L6.5 2.3"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            Drafted
                          </span>
                        </div>
                        <div className="mt-1.5 inline-flex items-center gap-1 font-mono tabular-nums text-[11.5px] text-ink-900">
                          <span className="inline-block h-1 w-1 rounded-full bg-ink-500" />
                          Sourced from {c.source}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Drafted response preview */}
                  <div className="mt-4 rounded-md border border-ink-200 bg-surface-sunken">
                    <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2 font-display uppercase tracking-[0.16em] text-[11.5px] text-ink-900">
                      <span>Drafted response</span>
                      <span className="font-mono tabular-nums normal-case tracking-normal text-[11.5px] text-ink-700">
                        Letter draft v3
                      </span>
                    </div>
                    <div className="px-3 py-3 text-[12.5px] leading-relaxed text-ink-900">
                      <p>
                        We acknowledge receipt of council RFI-104 dated 24 May
                        2026. In response to{" "}
                        <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1 py-px font-mono tabular-nums text-[11.5px] text-accent">
                          cl. 3.4(a)
                        </span>{" "}
                        please find the updated stair calculation on{" "}
                        <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-1 py-px font-mono tabular-nums text-[11.5px] text-ink-700">
                          A-201
                        </span>
                        , showing riser 180 mm, going 250 mm and a 1 000 mm
                        handrail …
                      </p>
                    </div>
                    <div className="flex items-center justify-between border-t border-ink-200 px-3 py-2">
                      <div className="text-[11px] text-ink-900">
                        <span className="font-mono tabular-nums">4</span>{" "}
                        paragraphs ·{" "}
                        <span className="font-mono tabular-nums">6</span>{" "}
                        citations
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[11.5px] font-medium text-white shadow-depth"
                      >
                        Use draft
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 col-span-12 md:order-1 md:col-span-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-accent">
                03 – RFI Auto-response
              </div>
              <h2
                className="mt-5 font-medium leading-[1.02] tracking-[0.01em] text-[40px] md:text-[56px] text-ink-900"
                style={{ fontFamily: "var(--font-dm-sans)" }}
              >
                Read the letter.
                <br />
                Draft the reply.
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-600">
                Drop in any council RFI. Atlas reads it like a senior
                consultant – interprets each ask, locates the answer across
                your drawings, specs, and consent, and writes a council-ready
                response.
              </p>
              <ul className="mt-6 space-y-2 text-[13px] text-ink-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Interprets each council ask in plain English
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Cross-references your drawings, specs, and consent
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Drafts a council-ready reply with full citations
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 04 – AI co-pilot (CAD overlay + agent + drafting) */}
        <section className="relative border-t border-ink-100 bg-surface-sunken py-24 md:py-32">
          <div className="mx-auto grid max-w-[1440px] grid-cols-12 items-center gap-x-10 px-8">
            <div className="order-2 col-span-12 md:order-1 md:col-span-7 mt-12 md:mt-0">
              <div className="rounded-lg bg-surface-elevated shadow-depth">
                <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-ink-500">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                    Atlas agent · Bayswater Townhouses
                  </div>
                  <div className="font-mono tabular-nums text-[10px] text-ink-400">
                    session 4f2a
                  </div>
                </div>

                <div className="space-y-4 px-5 py-5">
                  {/* user bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-lg rounded-br-sm bg-ink-900 px-3.5 py-2.5 text-[13px] text-white">
                      Why is RFI-104 flagged as a blocker?
                    </div>
                  </div>

                  {/* assistant bubble */}
                  <div className="flex">
                    <div className="max-w-[88%] rounded-lg rounded-bl-sm border border-ink-100 bg-surface-canvas px-3.5 py-3 text-[13px] leading-relaxed text-ink-900">
                      Council flagged{" "}
                      <span className="font-medium">Clause 3.4(a)</span>: the
                      stair on Sheet{" "}
                      <span className="font-mono tabular-nums">A-201</span> is
                      below the D1/AS1 minimum width. I&apos;ve grounded
                      the citation to the drawing region.
                      <div className="mt-3 flex w-fit items-center gap-3 rounded-md border border-ink-150 bg-surface-elevated px-2.5 py-2">
                        <div
                          className="relative h-10 w-14 shrink-0 rounded-sm border border-ink-200 bg-surface-canvas"
                          style={{
                            backgroundImage:
                              "linear-gradient(to right, rgba(15,17,21,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,17,21,0.08) 1px, transparent 1px)",
                            backgroundSize: "8px 8px",
                          }}
                        >
                          <div className="absolute left-1.5 top-1.5 h-3.5 w-5 rounded-sm border border-red-500/85 bg-red-500/15" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="font-mono tabular-nums text-[10px] uppercase tracking-[0.14em] leading-none text-ink-500">
                            A-201 · Region C1
                          </div>
                          <div className="text-[12px] leading-none text-ink-800">
                            Stair width · 820 mm
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-ink-100 pt-4">
                    <div className="text-[11px] text-ink-500">
                      Atlas drafted a response citing D1/AS1 §5.1.
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-depth"
                    >
                      Draft response
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 col-span-12 md:order-2 md:col-span-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-accent">
                04 – AI co-pilot
              </div>
              <h2
                className="mt-5 font-medium leading-[1.02] tracking-[0.01em] text-[40px] md:text-[56px] text-ink-900"
                style={{ fontFamily: "var(--font-dm-sans)" }}
              >
                Ask the drawing.
                <br />
                Draft the reply.
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-600">
                A conversational agent that knows your project, grounds every
                answer to the exact CAD region, and drafts council-ready
                responses you can ship in minutes.
              </p>
              <ul className="mt-6 space-y-2 text-[13px] text-ink-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Visual bbox grounding on drawings
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  Project-aware chat with full citations
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block h-1 w-1 rounded-full bg-accent" />
                  One-click drafted RFI responses
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative border-t border-ink-100 py-24 md:py-32">
          <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-x-10 px-8">
            <div className="col-span-12 md:col-span-8">
              <div className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
                Built for the people who actually build
              </div>
              <h2
                className="mt-5 font-medium leading-[1.02] tracking-[0.01em] text-[40px] md:text-[60px] lg:text-[72px] text-ink-900"
                style={{ fontFamily: "var(--font-dm-sans)" }}
              >
                Build with{" "}
                <span className="text-accent">intelligence</span>.
              </h2>
            </div>

            <div className="col-span-12 mt-10 md:col-span-4 md:col-start-9 md:mt-0 md:self-end md:pb-6">
              <p className="max-w-sm text-[15px] leading-relaxed text-ink-600">
                Bring your projects, your drawings, and your RFIs. Atlas turns
                them into a coordinated, queryable workspace – so your crew
                can build.
              </p>
              <div className="mt-8 flex items-center gap-5">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-5 py-2.5 text-[13px] font-medium text-white shadow-depth hover:shadow-depth-hover transition-shadow"
                >
                  {isSignedIn ? "Open app" : "Launch the platform"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                {!isSignedIn && (
                  <Link
                    href="/login"
                    className="font-display uppercase tracking-[0.14em] text-[12px] text-ink-700 hover:text-ink-900"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
