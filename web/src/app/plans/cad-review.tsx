"use client";

import { useState } from "react";
import { API_BASE, apiFetch } from "@/lib/api";

type ProposedChange =
  | { op: "move_entity"; handle: string; dx: number; dy: number }
  | { op: "offset_polyline"; handle: string; distance: number; side?: "left" | "right" }
  | { op: "resize_block"; handle: string; scale_x?: number; scale_y?: number }
  | { op: "add_dimension"; from_handle: string; to_handle: string; offset?: number }
  | { op: "add_text_note"; anchor_handle: string; text: string; dx?: number; dy?: number }
  | { op: "change_layer"; handle: string; layer: string }
  | {
      op: "place_symbol";
      symbol:
        | "smoke_alarm"
        | "heat_detector"
        | "sprinkler"
        | "fire_extinguisher"
        | "emergency_light"
        | "exit_sign"
        | "gpo"
        | "gpo_double"
        | "light_fitting"
        | "light_switch"
        | "data_outlet"
        | "tv_outlet"
        | "toilet"
        | "basin"
        | "shower"
        | "bath"
        | "kitchen_sink"
        | "hot_water_cylinder"
        | "mechanical_extract"
        | "thermostat"
        | "accessible";
      anchor_handle?: string;
      x?: number;
      y?: number;
      label?: string;
    };

type Flag = {
  rule_cited: string;
  rationale: string;
  severity: "must_resolve" | "nice_to_have";
  target_handles: string[];
  verbatim_quote?: string;
  proposed_change?: ProposedChange | null;
  image_bboxes?: Record<string, [number, number, number, number]>;
};

type ViewInfo = { name: string; width: number; height: number };

type Cad = {
  id: string;
  filename: string;
  status: string;
  analysis: {
    flags?: Flag[];
    views?: ViewInfo[];
    entity_count?: number;
  } | null;
};

function describeOp(op: ProposedChange): string {
  switch (op.op) {
    case "move_entity":
      return `Move ${op.handle} by (${op.dx}, ${op.dy})`;
    case "offset_polyline":
      return `Offset ${op.handle} by ${op.distance} (${op.side ?? "right"})`;
    case "resize_block":
      return `Resize ${op.handle} (${op.scale_x ?? 1} × ${op.scale_y ?? 1})`;
    case "add_dimension":
      return `Add dimension ${op.from_handle} → ${op.to_handle}`;
    case "add_text_note":
      return `Add text "${op.text}" near ${op.anchor_handle}`;
    case "change_layer":
      return `Move ${op.handle} to layer "${op.layer}"`;
    case "place_symbol": {
      const where = op.anchor_handle
        ? `near ${op.anchor_handle}`
        : `at (${op.x ?? "?"}, ${op.y ?? "?"})`;
      const labelPart = op.label ? ` labelled "${op.label}"` : "";
      return `Draw ${op.symbol.replace("_", " ")} symbol ${where}${labelPart}`;
    }
  }
}

const SEV_BORDER: Record<Flag["severity"], string> = {
  must_resolve: "border-red-500",
  nice_to_have: "border-amber-500",
};

const SEV_PIN: Record<Flag["severity"], string> = {
  must_resolve: "bg-red-500",
  nice_to_have: "bg-amber-500",
};

export function CadReview({ cad }: { cad: Cad }) {
  const flags = cad.analysis?.flags ?? [];
  const views = cad.analysis?.views ?? [];
  const [activeView, setActiveView] = useState(views[0]?.name ?? "Model");
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [activeFlag, setActiveFlag] = useState<number | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revUrl, setRevUrl] = useState<string | null>(null);
  // Bumped after each Apply so the browser refetches the revised render
  // (the response is `Cache-Control: no-store` but a query param is
  // belt-and-braces against any intermediary cache).
  const [revVersion, setRevVersion] = useState(0);

  const allNumbered = flags.map((f, i) => ({ ...f, _n: i + 1, _i: i }));
  const numbered = allNumbered.filter((f) => !resolved.has(f._i));
  const resolvedFlags = allNumbered.filter((f) => resolved.has(f._i));

  function toggle(i: number) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function applyApproved() {
    if (approved.size === 0) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ url: string; applied_count: number }>(
        `/cad/${cad.id}/revisions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            approved_flag_indices: Array.from(approved).sort((a, b) => a - b),
          }),
        },
      );
      setRevUrl(res.url);
      setResolved((prev) => new Set([...prev, ...approved]));
      setApproved(new Set());
      setActiveFlag(null);
      setRevVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }

  const activeViewInfo = views.find((v) => v.name === activeView) ?? views[0];

  return (
    <section className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 mt-6">
      <div className="rounded-sm border border-ink-700/10 bg-ink-700/5 flex flex-col">
        <div className="px-4 py-2 text-xs uppercase tracking-wide text-ink-500 border-b border-ink-700/10 flex items-center justify-between gap-2">
          <span className="truncate">Drawing — {cad.filename}</span>
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
                    key={v.name}
                    onClick={() => setActiveView(v.name)}
                    className={`px-2 py-0.5 text-[11px] rounded-sm border ${
                      activeView === v.name
                        ? "bg-ink-900 text-white border-ink-900"
                        : "border-ink-700/15 text-ink-700"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}
            <a
              href={`${API_BASE}/cad/${cad.id}/signed-url`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] underline text-ink-700"
            >
              Original DXF
            </a>
          </div>
        </div>
        <div className="flex-1 p-4">
          <div
            className="relative w-full bg-surface-raised border border-ink-700/10 rounded-sm shadow-sm overflow-hidden"
            style={
              activeViewInfo
                ? { aspectRatio: `${activeViewInfo.width} / ${activeViewInfo.height}` }
                : undefined
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                revVersion > 0
                  ? `${API_BASE}/cad/${cad.id}/views/${encodeURIComponent(activeView)}.png?revised=1&v=${revVersion}`
                  : `${API_BASE}/cad/${cad.id}/views/${encodeURIComponent(activeView)}.png`
              }
              alt={activeView}
              className="absolute inset-0 w-full h-full object-contain"
            />
            <div
              className={`absolute inset-0 pointer-events-none ${
                showOverlays ? "" : "hidden"
              }`}
            >
              {numbered.map((f) => {
                const bb = f.image_bboxes?.[activeView];
                if (!bb) return null;
                const [x0, y0, x1, y1] = bb;
                const left = `${x0 * 100}%`;
                const top = `${y0 * 100}%`;
                const width = `${Math.max(0, x1 - x0) * 100}%`;
                const height = `${Math.max(0, y1 - y0) * 100}%`;
                const isActive = activeFlag === f._n;
                return (
                  <button
                    type="button"
                    key={f._n}
                    onClick={() => setActiveFlag(f._n)}
                    style={{ left, top, width, height }}
                    className="absolute pointer-events-auto cursor-pointer focus:outline-none"
                    title={f.rule_cited}
                  >
                    {/* Visual rectangle inflated 6px outward so the bbox
                        frames the content with breathing room instead of
                        clipping it. Click target stays on the data bbox. */}
                    <span
                      className={`absolute -inset-[6px] ${SEV_BORDER[f.severity]} ${
                        isActive
                          ? "bg-yellow-300/30 ring-2 ring-yellow-500 border-[3px]"
                          : "bg-transparent border-2"
                      } pointer-events-none`}
                    />
                    <span
                      className={`absolute -top-3 -left-3 ${
                        SEV_PIN[f.severity]
                      } text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow ring-2 ring-white pointer-events-none`}
                    >
                      {f._n}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <aside className="flex flex-col min-h-0 overflow-hidden self-stretch">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="font-semibold">
            Flags ({numbered.length}
            {resolved.size > 0 ? ` · ${resolved.size} resolved` : ""})
          </h3>
          <button
            onClick={applyApproved}
            disabled={busy || approved.size === 0}
            className="px-3 py-1 text-sm bg-ink-900 text-white rounded-sm disabled:opacity-50"
          >
            {busy ? "Applying…" : `Apply ${approved.size}`}
          </button>
        </div>
        {revUrl && (
          <a
            href={revUrl}
            className="block text-sm text-blue-700 underline shrink-0 mt-3"
            target="_blank"
            rel="noreferrer"
          >
            Download revised DXF
          </a>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1 -mr-1 space-y-3">
        <ul className="space-y-2">
          {numbered.map((f) => {
            const sev =
              f.severity === "must_resolve" ? "border-red-400" : "border-amber-400";
            const isActive = activeFlag === f._n;
            return (
              <li
                key={f._i}
                onClick={() => setActiveFlag(f._n)}
                className={`border-l-4 ${sev} bg-surface-raised border rounded-sm p-3 text-sm space-y-1 cursor-pointer ${
                  isActive ? "ring-2 ring-yellow-500" : ""
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`${SEV_PIN[f.severity]} text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold`}
                  >
                    {f._n}
                  </span>
                  {(() => {
                    const m = f.rule_cited.match(/^\s*([^—\-]+?)\s*[—\-]\s*(.+)$/);
                    const code = m ? m[1] : null;
                    const title = m ? m[2] : f.rule_cited;
                    return (
                      <>
                        <span className="font-medium">{title}</span>
                        {code && (
                          <span className="rounded-sm bg-ink-900 text-white text-[10px] font-mono px-1.5 py-0.5 tracking-wide">
                            {code}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="text-ink-700">{f.rationale}</div>
                {f.verbatim_quote && (
                  <div className="text-xs text-ink-500 italic">
                    &ldquo;{f.verbatim_quote}&rdquo;
                  </div>
                )}
                {f.proposed_change ? (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <div className="text-xs">
                      <div className="font-medium">Proposed:</div>
                      <div>{describeOp(f.proposed_change)}</div>
                    </div>
                    <label
                      className="flex items-center gap-1 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={approved.has(f._i)}
                        onChange={() => toggle(f._i)}
                      />
                      Approve
                    </label>
                  </div>
                ) : (
                  <div className="text-xs text-ink-400 italic mt-1">
                    No automated fix available
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {resolvedFlags.length > 0 && (
          <div className="pt-4 border-t border-ink-700/15">
            <h4 className="text-[11px] uppercase tracking-wide text-ink-500 mb-2">
              Resolved ({resolvedFlags.length})
            </h4>
            <ul className="space-y-2">
              {resolvedFlags.map((f) => (
                <li
                  key={f._i}
                  className="border-l-4 border-ink-700/20 bg-ink-700/5 border rounded-sm p-3 text-xs space-y-1 opacity-60"
                  title="Applied to revised DXF"
                >
                  <div className="flex items-center gap-2">
                    <span className="bg-ink-700/40 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold line-through">
                      {f._n}
                    </span>
                    <span className="font-medium line-through text-ink-700">
                      {f.rule_cited}
                    </span>
                    <span className="ml-auto text-[10px] text-emerald-700 font-medium not-italic">
                      ✓ applied
                    </span>
                  </div>
                  <div className="text-ink-500 line-through">{f.rationale}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </aside>
    </section>
  );
}
