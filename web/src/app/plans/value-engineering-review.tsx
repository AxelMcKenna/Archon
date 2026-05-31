"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch } from "@/lib/api";
import { isStalled } from "@/lib/job-status";
import { CadOverlayImage } from "@/app/plans/cad-overlay-image";

type CostImpact = "high" | "medium" | "low";
type Confidence = "high" | "medium" | "low";
type Category =
  | "material_substitution"
  | "structural_oversize"
  | "treatment_downgrade"
  | "product_alternative"
  | "detail_simplification"
  | "finish_downgrade";

type Opportunity = {
  page?: number;
  tile?: string;
  area: string;
  category: Category;
  current_spec: string;
  proposed_alternative: string;
  cost_impact: CostImpact;
  confidence: Confidence;
  rationale: string;
  code_considerations?: string;
  // PDF localisation: a single normalised bbox on the cited page.
  bbox?: [number, number, number, number] | null;
  // DXF localisation: handle-grounded per-view boxes + the cited handles
  // (computed geometrically in app.cad.cad_grounding, same as RFI CAD flags).
  image_bboxes?: Record<string, [number, number, number, number]>;
  target_handles?: string[];
};

type VERow = {
  id: string;
  plan_upload_id: string;
  status: "pending" | "analysing" | "analysed" | "failed";
  analyser_version: string | null;
  prompt_version: string | null;
  opportunities: Opportunity[] | null;
  summary: string | null;
  processing_ms: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
};

const IMPACT_RANK: Record<CostImpact, number> = { high: 3, medium: 2, low: 1 };
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

const IMPACT_STYLE: Record<CostImpact, string> = {
  high: "bg-emerald-100 text-emerald-900 border-emerald-200",
  medium: "bg-emerald-50 text-emerald-800 border-emerald-200",
  low: "bg-ink-700/5 text-ink-700 border-ink-700/10",
};
const CONF_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-sky-50 text-sky-700 border-sky-200",
  low: "bg-ink-700/5 text-ink-500 border-ink-700/10",
};

const CATEGORY_LABEL: Record<Category, string> = {
  material_substitution: "Material substitution",
  structural_oversize: "Structural oversize",
  treatment_downgrade: "Treatment downgrade",
  product_alternative: "Product alternative",
  detail_simplification: "Detail simplification",
  finish_downgrade: "Finish downgrade",
};

function score(o: Opportunity): number {
  return IMPACT_RANK[o.cost_impact] * 10 + CONF_RANK[o.confidence];
}

type PageInfo = { page: number; width: number; height: number };

// Emerald bands matching the baked-in PDF overlay (api/app/plans/overlay.py).
const IMPACT_RGB: Record<CostImpact, string> = {
  high: "rgb(5 150 105)",
  medium: "rgb(16 185 129)",
  low: "rgb(52 211 153)",
};
const IMPACT_FILL: Record<CostImpact, string> = {
  high: "rgba(5, 150, 105, 0.14)",
  medium: "rgba(16, 185, 129, 0.14)",
  low: "rgba(52, 211, 153, 0.14)",
};

type NumberedOpportunity = Opportunity & { _n: number };

export type VESourceKind = "pdf" | "dxf";

export function ValueEngineeringReview({
  sourceId,
  sourceKind,
}: {
  sourceId: string;
  sourceKind: VESourceKind;
}) {
  const [row, setRow] = useState<VERow | null | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const endpoint =
    sourceKind === "dxf"
      ? `/cad/${sourceId}/value-engineering`
      : `/plans/${sourceId}/value-engineering`;

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch<VERow | null>(endpoint);
      setRow(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow(null);
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const trigger = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      await apiFetch<unknown>(endpoint, { method: "POST" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [endpoint, refresh]);

  if (row === undefined) {
    return (
      <div className="rounded-sm border border-ink-700/10 p-4 text-sm text-ink-500">
        Loading value engineering…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-sm border border-ink-700/10 p-6 text-center space-y-3">
        <p className="text-sm text-ink-700">
          Find cost-reduction opportunities in this drawing set — over-specified
          materials, premium products with code-compliant alternatives,
          unnecessarily complex details.
        </p>
        <button
          type="button"
          onClick={trigger}
          disabled={running}
          className="rounded-sm bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700 disabled:opacity-50"
        >
          {running ? "Running…" : "Run value engineering"}
        </button>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  const stalled = isStalled(row.status, row.created_at);

  if (row.status === "failed" || stalled) {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
        <p>
          {stalled
            ? "Value engineering stalled — it didn't finish. Retry to run it again."
            : `Value engineering failed. ${row.error ?? ""}`}
        </p>
        <button
          type="button"
          onClick={trigger}
          disabled={running}
          className="rounded-sm bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-700 disabled:opacity-50"
        >
          {running ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (row.status !== "analysed") {
    return (
      <div className="rounded-sm border border-ink-700/10 p-4 text-sm text-ink-500">
        Analysing for cost savings — this usually takes 30–60 seconds.
      </div>
    );
  }

  const numbered: NumberedOpportunity[] = (row.opportunities ?? [])
    .slice()
    .sort((a, b) => score(b) - score(a))
    .map((o, i) => ({ ...o, _n: i + 1 }));

  const groups: Record<CostImpact, NumberedOpportunity[]> = {
    high: numbered.filter((o) => o.cost_impact === "high"),
    medium: numbered.filter((o) => o.cost_impact === "medium"),
    low: numbered.filter((o) => o.cost_impact === "low"),
  };

  const summaryBlock = (
    <div className="rounded-sm border border-ink-700/10 p-4 text-sm">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-xs uppercase tracking-wide text-ink-500">Summary</p>
        <button
          type="button"
          onClick={trigger}
          disabled={running}
          className="text-xs underline text-ink-500 hover:text-ink-900 disabled:opacity-50"
        >
          {running ? "Re-running…" : "Re-run"}
        </button>
      </div>
      {row.summary && <p className="mt-2">{row.summary}</p>}
      <div className="mt-3 flex gap-4 text-xs text-ink-500 flex-wrap">
        <span>Opportunities: {numbered.length}</span>
        {row.processing_ms != null && (
          <span>{(row.processing_ms / 1000).toFixed(1)}s</span>
        )}
        {row.cost_usd != null && <span>${row.cost_usd.toFixed(4)}</span>}
        {row.analyser_version && <span>v{row.analyser_version}</span>}
      </div>
    </div>
  );

  const listBlock = (
    <section className="space-y-4">
      {summaryBlock}
      {numbered.length === 0 && (
        <p className="rounded-sm border border-ink-700/10 p-4 text-sm text-ink-500 italic">
          No clear cost-reduction opportunities surfaced on this set.
        </p>
      )}
      <OpportunityGroup
        title="High savings"
        items={groups.high}
        activeId={activeId}
        onSelect={setActiveId}
      />
      <OpportunityGroup
        title="Medium savings"
        items={groups.medium}
        activeId={activeId}
        onSelect={setActiveId}
      />
      <OpportunityGroup
        title="Low savings"
        items={groups.low}
        activeId={activeId}
        onSelect={setActiveId}
      />
    </section>
  );

  if (sourceKind === "dxf") {
    // DXF opportunities are handle-grounded: collect the views any of them
    // localise onto. With none localised, fall back to the plain list.
    const cadViews = Array.from(
      new Set(
        numbered.flatMap((o) => (o.image_bboxes ? Object.keys(o.image_bboxes) : [])),
      ),
    );
    if (cadViews.length === 0) {
      return listBlock;
    }
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
        <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <ValueEngineeringCadCanvas
            cadId={sourceId}
            views={cadViews}
            opportunities={numbered}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </aside>
        {listBlock}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <ValueEngineeringCanvas
          planId={sourceId}
          opportunities={numbered}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </aside>
      {listBlock}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CAD canvas: DXF view images with handle-grounded opportunity overlays.
// Reuses the shared CadOverlayImage (also used by the RFI CadReview).
// ---------------------------------------------------------------------------

const IMPACT_BORDER: Record<CostImpact, string> = {
  high: "border-emerald-600",
  medium: "border-emerald-500",
  low: "border-emerald-400",
};
const IMPACT_PIN: Record<CostImpact, string> = {
  high: "bg-emerald-600",
  medium: "bg-emerald-500",
  low: "bg-emerald-400",
};

function ValueEngineeringCadCanvas({
  cadId,
  views,
  opportunities,
  activeId,
  onSelect,
}: {
  cadId: string;
  views: string[];
  opportunities: NumberedOpportunity[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  const [activeView, setActiveView] = useState(views[0]);
  const [showOverlays, setShowOverlays] = useState(true);
  const localised = opportunities.filter((o) => o.image_bboxes).length;

  return (
    <div className="rounded-sm border border-ink-700/10 bg-ink-700/5 h-full flex flex-col">
      <div className="px-4 py-2 text-xs uppercase tracking-wide text-ink-500 border-b border-ink-700/10 flex items-center justify-between gap-2">
        <span className="truncate">Value engineering · {localised} located</span>
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <label className="flex items-center gap-1 text-[11px] text-ink-700">
            <input
              type="checkbox"
              checked={showOverlays}
              onChange={(e) => setShowOverlays(e.target.checked)}
            />
            Overlays
          </label>
          {views.length > 1 && (
            <div className="flex gap-1">
              {views.map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveView(v)}
                  className={`px-2 py-0.5 text-[11px] rounded-sm border ${
                    activeView === v
                      ? "bg-ink-900 text-white border-ink-900"
                      : "border-ink-700/10 text-ink-700"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <CadOverlayImage
          cadId={cadId}
          activeView={activeView}
          items={opportunities.map((o) => ({
            n: o._n,
            imageBboxes: o.image_bboxes,
            borderClass: IMPACT_BORDER[o.cost_impact],
            pinClass: IMPACT_PIN[o.cost_impact],
            title: o.area,
          }))}
          activeN={activeId}
          onSelect={onSelect}
          showOverlays={showOverlays}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas: page images with absolutely-positioned opportunity bbox overlays
// ---------------------------------------------------------------------------

function ValueEngineeringCanvas({
  planId,
  opportunities,
  activeId,
  onSelect,
}: {
  planId: string;
  opportunities: NumberedOpportunity[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ pages: PageInfo[] }>(`/plans/${planId}/pages`)
      .then((r) => {
        if (!cancelled) setPages(r.pages);
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const byPage = useMemo(() => {
    const m = new Map<number, NumberedOpportunity[]>();
    for (const o of opportunities) {
      if (!o.bbox) continue;
      const page = o.page ?? 1; // PDF opportunities always carry a page
      const list = m.get(page) ?? [];
      list.push(o);
      m.set(page, list);
    }
    return m;
  }, [opportunities]);

  const localised = opportunities.filter((o) => o.bbox).length;

  return (
    <div className="rounded-sm border border-ink-700/10 bg-ink-700/5 h-full flex flex-col">
      <div className="px-4 py-2 text-xs uppercase tracking-wide text-ink-500 border-b border-ink-700/10 flex items-center justify-between gap-2">
        <span className="truncate">Value engineering · {localised} located</span>
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
            href={`${API_BASE}/plans/${planId}/value-engineering/overlay.pdf`}
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
          <VEPageView
            key={p.page}
            planId={planId}
            info={p}
            items={byPage.get(p.page) ?? []}
            activeId={activeId}
            showOverlays={showOverlays}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function VEPageView({
  planId,
  info,
  items,
  activeId,
  showOverlays,
  onSelect,
}: {
  planId: string;
  info: PageInfo;
  items: NumberedOpportunity[];
  activeId: number | null;
  showOverlays: boolean;
  onSelect: (id: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className="relative w-full bg-surface-raised border border-ink-700/10 rounded-sm shadow-sm"
      style={{ aspectRatio: `${info.width} / ${info.height}` }}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-ink-700/5" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${API_BASE}/plans/${planId}/pages/${info.page}.png`}
        alt={`Plan page ${info.page}`}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Overlays only after the drawing has painted, so the boxes never
          float over a blank/loading page. */}
      {showOverlays && loaded && (
        <div className="absolute inset-0">
          {items.map((o) => (
            <VEBboxOverlay
              key={o._n}
              o={o}
              active={activeId === o._n}
              onSelect={() => onSelect(o._n)}
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

function VEBboxOverlay({
  o,
  active,
  onSelect,
}: {
  o: NumberedOpportunity;
  active: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active]);

  if (!o.bbox) return null;
  const [x0, y0, x1, y1] = o.bbox;
  const colour = IMPACT_RGB[o.cost_impact];
  const fill = IMPACT_FILL[o.cost_impact];

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className="absolute group focus:outline-none"
      style={{
        left: `${x0 * 100}%`,
        top: `${y0 * 100}%`,
        width: `${(x1 - x0) * 100}%`,
        height: `${(y1 - y0) * 100}%`,
      }}
      aria-label={`Opportunity ${o._n}: ${o.area}`}
    >
      <span
        className="absolute -inset-[6px] transition-all pointer-events-none"
        style={{
          backgroundColor: fill,
          border: `${active ? 4 : 2}px solid ${colour}`,
          boxShadow: active ? `0 0 0 4px ${colour}33` : undefined,
        }}
      />
      <span
        className="absolute -top-3 -left-3 flex items-center justify-center rounded-full text-white text-[11px] font-bold shadow-md"
        style={{
          width: 24,
          height: 24,
          backgroundColor: colour,
          border: "2px solid white",
          transform: active ? "scale(1.2)" : undefined,
          transition: "transform 120ms",
        }}
      >
        {o._n}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Opportunity list / cards
// ---------------------------------------------------------------------------

function OpportunityGroup({
  title,
  items,
  activeId,
  onSelect,
}: {
  title: string;
  items: NumberedOpportunity[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title} ({items.length})
      </h3>
      {items.map((o) => (
        <OpportunityCard
          key={o._n}
          o={o}
          active={activeId === o._n}
          onSelect={() => onSelect(o._n)}
        />
      ))}
    </div>
  );
}

function OpportunityCard({
  o,
  active,
  onSelect,
}: {
  o: NumberedOpportunity;
  active: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active]);

  return (
    <article
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`rounded-sm border p-4 cursor-pointer transition-shadow ${IMPACT_STYLE[o.cost_impact]} ${
        active ? "ring-2" : "hover:shadow-sm"
      }`}
      style={active ? { boxShadow: `0 0 0 2px ${IMPACT_RGB[o.cost_impact]}` } : undefined}
    >
      <header className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <p className="font-medium text-sm flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold"
            style={{ width: 18, height: 18, backgroundColor: IMPACT_RGB[o.cost_impact] }}
          >
            {o._n}
          </span>
          {o.page != null ? `Page ${o.page}` : null}
          {o.tile && o.tile !== "full" ? ` · ${o.tile}` : ""}
          {o.page != null ? " · " : ""}
          <span className="text-ink-700/80">{o.area}</span>
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm border ${CONF_STYLE[o.confidence]}`}
          >
            {o.confidence}
          </span>
          <span className="font-mono text-xs">{CATEGORY_LABEL[o.category]}</span>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-2">
        <div className="rounded-sm bg-white/60 p-2 border border-ink-700/10">
          <p className="text-[10px] uppercase tracking-wide text-ink-500 mb-1">
            Currently specified
          </p>
          <p className="italic">&ldquo;{o.current_spec}&rdquo;</p>
        </div>
        <div className="rounded-sm bg-white/60 p-2 border border-emerald-200">
          <p className="text-[10px] uppercase tracking-wide text-ink-500 mb-1">
            Proposed alternative
          </p>
          <p>{o.proposed_alternative}</p>
        </div>
      </div>
      <p className="text-sm">{o.rationale}</p>
      {o.code_considerations && (
        <p className="text-xs text-ink-700/80 mt-2">
          <span className="font-medium">Check before committing:</span>{" "}
          {o.code_considerations}
        </p>
      )}
    </article>
  );
}
