"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch } from "@/lib/api";
import { taxonomy } from "@consentiq/shared";

type Confidence = "high" | "medium" | "low";

type Flag = {
  page: number;
  tile?: string;
  area: string;
  category: string;
  severity: "must_resolve" | "nice_to_have";
  confidence?: Confidence;
  verbatim_quote?: string;
  reason: string;
  recommended_action: string;
  bbox?: [number, number, number, number] | null;
  bbox_source?: "model" | "tile_fallback" | "text_layer" | "ocr";
  bbox_match_ratio?: number;
};

type Plan = {
  id: string;
  filename: string;
  status: string;
  analyser_version: string | null;
  analysis_version?: string | null;
  prompt_version: string | null;
  processing_ms: number | null;
  cost_usd: number | null;
  analysis: {
    flags?: Flag[];
    summary?: string;
    pages_analysed?: number;
    taxonomy_version?: string;
    truncated?: boolean;
    verification?: "verified" | "skipped";
  } | null;
};

type PageInfo = { page: number; width: number; height: number };

const SEV_STYLE: Record<Flag["severity"], string> = {
  must_resolve: "bg-red-100 text-red-800 border-red-200",
  nice_to_have: "bg-amber-100 text-amber-800 border-amber-200",
};

const CONF_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-ink-700/5 text-ink-500 border-ink-700/10",
};

const SEV_RANK: Record<Flag["severity"], number> = {
  must_resolve: 2,
  nice_to_have: 1,
};
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

const DEFAULT_VISIBLE = 15;

function priorityScore(flag: Flag): number {
  const sev = SEV_RANK[flag.severity] ?? 0;
  const conf = CONF_RANK[flag.confidence ?? "medium"] ?? 0;
  return sev * 10 + conf;
}

export function PlanReview({ plan }: { plan: Plan }) {
  const [showAll, setShowAll] = useState(false);
  const [showLowConfidence, setShowLowConfidence] = useState(false);
  const [activeFlagId, setActiveFlagId] = useState<number | null>(null);

  const flags = plan.analysis?.flags ?? [];
  // Stable global numbering so the pin number on the canvas matches the
  // number in the side list.
  const numberedFlags = useMemo(
    () => flags.map((f, i) => ({ ...f, _n: i + 1 })),
    [flags],
  );

  const { highMedium, lowConfidence } = useMemo(() => {
    const high: (Flag & { _n: number })[] = [];
    const low: (Flag & { _n: number })[] = [];
    for (const f of numberedFlags) {
      if ((f.confidence ?? "medium") === "low") low.push(f);
      else high.push(f);
    }
    high.sort((a, b) => priorityScore(b) - priorityScore(a));
    low.sort((a, b) => priorityScore(b) - priorityScore(a));
    return { highMedium: high, lowConfidence: low };
  }, [numberedFlags]);

  const visible = showAll ? highMedium : highMedium.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = Math.max(0, highMedium.length - visible.length);

  const must = visible.filter((f) => f.severity === "must_resolve");
  const nice = visible.filter((f) => f.severity === "nice_to_have");

  const truncated = plan.analysis?.truncated;
  const verificationStatus = plan.analysis?.verification ?? "verified";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <PlanCanvas
          plan={plan}
          flags={numberedFlags}
          activeFlagId={activeFlagId}
          onSelectFlag={setActiveFlagId}
        />
      </aside>

      <section className="space-y-4">
        {plan.status === "failed" && (
          <p className="rounded-sm bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Analysis failed. Try re-uploading.
          </p>
        )}
        {truncated && (
          <p className="rounded-sm bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            This plan exceeded the per-analysis image budget; later pages were
            not analysed. Consider splitting the upload.
          </p>
        )}
        {verificationStatus === "skipped" && (
          <p className="rounded-sm bg-sky-50 border border-sky-200 p-3 text-sm text-sky-800">
            Flag verification could not run on this analysis. Treat all flags
            as &quot;may want to check&quot;.
          </p>
        )}

        {plan.analysis?.summary && (
          <div className="rounded-sm border border-ink-700/10 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-ink-500 mb-2">Summary</p>
            <p>{plan.analysis.summary}</p>
            <div className="mt-3 flex gap-4 text-xs text-ink-500 flex-wrap">
              <span>Pages: {plan.analysis.pages_analysed ?? "?"}</span>
              <span>Flags: {flags.length}</span>
              {plan.processing_ms != null && (
                <span>{(plan.processing_ms / 1000).toFixed(1)}s</span>
              )}
              {plan.cost_usd != null && <span>${plan.cost_usd.toFixed(4)}</span>}
              {plan.analysis_version && <span>v{plan.analysis_version}</span>}
            </div>
          </div>
        )}

        <FlagList
          title={`Must resolve (${must.length})`}
          flags={must}
          activeFlagId={activeFlagId}
          onSelectFlag={setActiveFlagId}
        />
        <FlagList
          title={`Nice to have (${nice.length})`}
          flags={nice}
          activeFlagId={activeFlagId}
          onSelectFlag={setActiveFlagId}
        />

        {hiddenCount > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-sm underline text-ink-700"
          >
            Show {hiddenCount} more flag{hiddenCount === 1 ? "" : "s"}
          </button>
        )}

        {lowConfidence.length > 0 && (
          <div className="rounded-sm border border-ink-700/10">
            <button
              type="button"
              onClick={() => setShowLowConfidence((v) => !v)}
              className="w-full px-4 py-2 text-left text-sm flex justify-between items-center"
            >
              <span>
                May want to check ({lowConfidence.length} low-confidence)
              </span>
              <span className="text-xs text-ink-500">
                {showLowConfidence ? "Hide" : "Show"}
              </span>
            </button>
            {showLowConfidence && (
              <div className="border-t border-ink-700/10 p-3 space-y-2">
                {lowConfidence.map((f) => (
                  <FlagCard
                    key={`lc-${f._n}`}
                    flag={f}
                    active={activeFlagId === f._n}
                    onSelect={() => setActiveFlagId(f._n)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan canvas: page images with absolutely-positioned bbox overlays
// ---------------------------------------------------------------------------

function PlanCanvas({
  plan,
  flags,
  activeFlagId,
  onSelectFlag,
}: {
  plan: Plan;
  flags: (Flag & { _n: number })[];
  activeFlagId: number | null;
  onSelectFlag: (id: number) => void;
}) {
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ pages: PageInfo[] }>(`/plans/${plan.id}/pages`)
      .then((r) => {
        if (!cancelled) setPages(r.pages);
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [plan.id]);

  const flagsByPage = useMemo(() => {
    const m = new Map<number, (Flag & { _n: number })[]>();
    for (const f of flags) {
      if (!f.bbox) continue;
      const list = m.get(f.page) ?? [];
      list.push(f);
      m.set(f.page, list);
    }
    return m;
  }, [flags]);

  return (
    <div className="rounded-sm border border-ink-700/10 bg-ink-700/5 h-full flex flex-col">
      <div className="px-4 py-2 text-xs uppercase tracking-wide text-ink-500 border-b border-ink-700/10 flex items-center justify-between gap-2">
        <span className="truncate">Plan — {plan.filename}</span>
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <label className="flex items-center gap-1 text-[11px] text-ink-700">
            <input
              type="checkbox"
              checked={showOverlays}
              onChange={(e) => setShowOverlays(e.target.checked)}
            />
            Overlays
          </label>
          <a
            href={`${API_BASE}/plans/${plan.id}/overlay.pdf`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] underline text-ink-700"
          >
            Download PDF
          </a>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {pages === null && (
          <div className="p-6 text-sm text-ink-500">Loading…</div>
        )}
        {pages?.length === 0 && (
          <div className="p-6 text-sm text-red-700">
            Couldn&apos;t load page images.
          </div>
        )}
        {pages?.map((p) => (
          <PageView
            key={p.page}
            planId={plan.id}
            info={p}
            flags={flagsByPage.get(p.page) ?? []}
            activeFlagId={activeFlagId}
            showOverlays={showOverlays}
            onSelectFlag={onSelectFlag}
          />
        ))}
      </div>
    </div>
  );
}

function PageView({
  planId,
  info,
  flags,
  activeFlagId,
  showOverlays,
  onSelectFlag,
}: {
  planId: string;
  info: PageInfo;
  flags: (Flag & { _n: number })[];
  activeFlagId: number | null;
  showOverlays: boolean;
  onSelectFlag: (id: number) => void;
}) {
  return (
    <div
      className="relative w-full bg-surface-raised border border-ink-700/10 rounded-sm shadow-sm"
      style={{ aspectRatio: `${info.width} / ${info.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${API_BASE}/plans/${planId}/pages/${info.page}.png`}
        alt={`Plan page ${info.page}`}
        className="absolute inset-0 w-full h-full object-contain"
      />
      {showOverlays && (
        <div className="absolute inset-0">
          {flags.map((f) => (
            <BboxOverlay
              key={f._n}
              flag={f}
              active={activeFlagId === f._n}
              onSelect={() => onSelectFlag(f._n)}
            />
          ))}
        </div>
      )}
      <div className="absolute bottom-1 right-2 text-[10px] text-ink-500 bg-white/70 px-1 rounded-sm">
        Page {info.page}
      </div>
    </div>
  );
}

function BboxOverlay({
  flag,
  active,
  onSelect,
}: {
  flag: Flag & { _n: number };
  active: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active]);

  if (!flag.bbox) return null;
  const [x0, y0, x1, y1] = flag.bbox;
  const left = `${x0 * 100}%`;
  const top = `${y0 * 100}%`;
  const width = `${(x1 - x0) * 100}%`;
  const height = `${(y1 - y0) * 100}%`;

  // Solid line for model-grounded or text-layer-snapped (both are tight);
  // dashed for tile_fallback (coarse — quadrant-only).
  const isFallback = flag.bbox_source === "tile_fallback";
  const sevColour =
    flag.severity === "must_resolve"
      ? "rgb(220 38 38)"
      : "rgb(217 119 6)";
  const fillColour =
    flag.severity === "must_resolve"
      ? "rgba(220, 38, 38, 0.12)"
      : "rgba(217, 119, 6, 0.12)";

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className="absolute group focus:outline-none"
      style={{ left, top, width, height }}
      aria-label={`Flag ${flag._n}: ${flag.area}`}
    >
      {/* Visual rectangle is inflated 6px outward so text inside the
          tight data bbox doesn't touch the border. Click target stays
          on the data bbox itself. */}
      <span
        className="absolute -inset-[6px] transition-all pointer-events-none"
        style={{
          backgroundColor: fillColour,
          border: `${active ? 4 : 2}px ${isFallback ? "dashed" : "solid"} ${sevColour}`,
          boxShadow: active ? `0 0 0 4px ${sevColour}33` : undefined,
        }}
      />
      <span
        className="absolute -top-3 -left-3 flex items-center justify-center rounded-full text-white text-[11px] font-bold shadow-md"
        style={{
          width: 24,
          height: 24,
          backgroundColor: sevColour,
          border: "2px solid white",
          transform: active ? "scale(1.2)" : undefined,
          transition: "transform 120ms",
        }}
      >
        {flag._n}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Flag list / cards
// ---------------------------------------------------------------------------

function FlagList({
  title,
  flags,
  activeFlagId,
  onSelectFlag,
}: {
  title: string;
  flags: (Flag & { _n: number })[];
  activeFlagId: number | null;
  onSelectFlag: (id: number) => void;
}) {
  if (!flags.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {flags.map((f) => (
        <FlagCard
          key={f._n}
          flag={f}
          active={activeFlagId === f._n}
          onSelect={() => onSelectFlag(f._n)}
        />
      ))}
    </div>
  );
}

function FlagCard({
  flag: f,
  active,
  onSelect,
}: {
  flag: Flag & { _n: number };
  active: boolean;
  onSelect: () => void;
}) {
  const cat = taxonomy.categories.find((c) => c.id === f.category);
  const conf = f.confidence ?? "medium";
  const ref = useRef<HTMLElement>(null);
  const sevColour =
    f.severity === "must_resolve" ? "rgb(220 38 38)" : "rgb(217 119 6)";

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active]);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect();
      }
    },
    [onSelect],
  );

  return (
    <article
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKey}
      className={`rounded-sm border p-4 cursor-pointer transition-shadow ${SEV_STYLE[f.severity]} ${
        active ? "ring-2" : "hover:shadow-sm"
      }`}
      style={active ? { boxShadow: `0 0 0 2px ${sevColour}` } : undefined}
    >
      <header className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <p className="font-medium text-sm flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold"
            style={{
              width: 18,
              height: 18,
              backgroundColor: sevColour,
            }}
          >
            {f._n}
          </span>
          Page {f.page}
          {f.tile && f.tile !== "full" ? ` · ${f.tile}` : ""} ·{" "}
          <span className="text-ink-700/80">{f.area}</span>
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm border ${CONF_STYLE[conf]}`}
          >
            {conf}
          </span>
          <span className="font-mono text-xs">{f.category}</span>
        </div>
      </header>
      {cat && <p className="text-xs text-ink-500 mb-2">{cat.label}</p>}
      {f.verbatim_quote && (
        <blockquote className="border-l-2 border-current/40 pl-2 mb-2 text-xs italic">
          &ldquo;{f.verbatim_quote}&rdquo;
        </blockquote>
      )}
      <p className="text-sm">{f.reason}</p>
      <p className="text-sm mt-2">
        <span className="font-medium">Recommended action:</span>{" "}
        {f.recommended_action}
      </p>
    </article>
  );
}
