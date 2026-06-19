"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  commitOps,
  fetchScene,
  revertTo,
  SnapIndex,
  StaleBaseError,
  type Op,
  type Scene,
  type SceneEntity,
  type SceneSnap,
} from "@/lib/cad-scene";

// A small, common subset of the 22 server-side symbols (the engine validates
// the full set). Label is what gets stamped next to the fixture.
const PALETTE: { symbol: string; label: string }[] = [
  { symbol: "smoke_alarm", label: "Smoke alarm" },
  { symbol: "heat_detector", label: "Heat detector" },
  { symbol: "gpo", label: "GPO" },
  { symbol: "light_fitting", label: "Light" },
  { symbol: "light_switch", label: "Switch" },
  { symbol: "mechanical_extract", label: "Extract fan" },
];

// Snap tolerance as a fraction of the drawing's larger dimension.
const SNAP_FRAC = 0.015;

// An RFI flag positioned on the drawing. `imageBbox` is the normalised
// Model-view bbox from the analysis (image space: y=0 is the top), converted
// to model coords for on-canvas pins.
export type EditorFlag = {
  n: number;
  imageBbox: [number, number, number, number] | null;
  severity: "must_resolve" | "nice_to_have";
  title?: string;
  detail?: string;
};

const SEV_FILL: Record<EditorFlag["severity"], string> = {
  must_resolve: "#ef4444",
  nice_to_have: "#f59e0b",
};

type Mode = { kind: "select" } | { kind: "place"; symbol: string; label: string };
type DragState = {
  handle: string;
  start: { x: number; y: number };
  dx: number;
  dy: number;
  moved: boolean;
};

export function CadEditor({
  cadId,
  flags = [],
}: {
  cadId: string;
  flags?: EditorFlag[];
}) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "select" });
  const [hoverSnap, setHoverSnap] = useState<SceneSnap | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showFlags, setShowFlags] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [activeFlag, setActiveFlag] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Undo/redo over the append-only revision log. Each entry is a revision id
  // (or null = original) whose geometry we can revert to.
  const undoStack = useRef<(string | null)[]>([]);
  const redoStack = useRef<(string | null)[]>([]);
  const [, forceHist] = useState(0);
  const bumpHist = () => forceHist((v) => v + 1);
  const gRef = useRef<SVGGElement | null>(null);

  const load = useCallback(
    async (rev?: string) => {
      setError(null);
      try {
        setScene(await fetchScene(cadId, rev));
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load scene");
      }
    },
    [cadId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Spatial snap index — rebuilt once per scene, O(1) nearest per frame.
  const snapIndex = useMemo(() => {
    if (!scene) return null;
    const [x0, y0, x1, y1] = scene.extents;
    const tol = Math.max(Math.max(x1 - x0, y1 - y0) * SNAP_FRAC, 1e-6);
    return new SnapIndex(scene.snaps, tol);
  }, [scene]);

  if (error && !scene) {
    return <div className="p-4 text-sm text-red-600">Scene error: {error}</div>;
  }
  if (!scene) {
    return <div className="p-4 text-sm text-ink-500">Loading drawing…</div>;
  }

  const [x0, y0, x1, y1] = scene.extents;
  const w = Math.max(x1 - x0, 1);
  const h = Math.max(y1 - y0, 1);
  const snapTol = Math.max(Math.max(w, h) * SNAP_FRAC, 1e-6);
  // y-flip: CAD y grows up, SVG y grows down. Flip the whole content group.
  const flip = `matrix(1 0 0 -1 0 ${y0 + y1})`;

  // Pointer (clientX/Y) → model coords, undoing the group transform.
  function toModel(evt: React.MouseEvent): { x: number; y: number } | null {
    const g = gRef.current;
    if (!g) return null;
    const ctm = g.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function grab(handle: string, evt: React.MouseEvent) {
    if (mode.kind !== "select" || busy) return;
    evt.stopPropagation();
    const m = toModel(evt);
    if (!m) return;
    setDrag({ handle, start: m, dx: 0, dy: 0, moved: false });
  }

  function onMove(evt: React.MouseEvent) {
    const m = toModel(evt);
    if (!m) return;
    if (drag) {
      // Snap the cursor to the nearest feature; move by the snapped delta.
      const snap = snapIndex?.nearest(m.x, m.y, snapTol) ?? null;
      const tx = snap ? snap.x : m.x;
      const ty = snap ? snap.y : m.y;
      setHoverSnap(snap);
      const dx = tx - drag.start.x;
      const dy = ty - drag.start.y;
      const moved = drag.moved || Math.hypot(dx, dy) > snapTol * 0.1;
      setDrag({ ...drag, dx, dy, moved });
      return;
    }
    if (mode.kind === "place") {
      setHoverSnap(snapIndex?.nearest(m.x, m.y, snapTol) ?? null);
    } else if (hoverSnap) {
      setHoverSnap(null);
    }
  }

  async function onUp(evt: React.MouseEvent) {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    setHoverSnap(null);
    if (d.moved && (d.dx !== 0 || d.dy !== 0)) {
      await runOps([{ op: "move_entity", handle: d.handle, dx: d.dx, dy: d.dy }]);
    } else {
      setSelected((s) => (s === d.handle ? null : d.handle));
    }
    evt.stopPropagation();
  }

  function onLeave() {
    // Cancel an in-flight drag (discard the optimistic offset).
    if (drag) {
      setDrag(null);
      setHoverSnap(null);
    }
  }

  async function onClick(evt: React.MouseEvent) {
    if (mode.kind !== "place" || busy) return;
    const m = toModel(evt);
    if (!m) return;
    // Place at the exact snapped coordinate (what the snap ring shows). The
    // anchor handle rides along for provenance, but positioning uses x/y so
    // the icon lands precisely — snap *kind* alone is ambiguous (a line has
    // two endpoints) and would let the server pick the wrong end.
    const snap = snapIndex?.nearest(m.x, m.y, snapTol) ?? null;
    const tx = snap ? snap.x : m.x;
    const ty = snap ? snap.y : m.y;
    const op: Op = {
      op: "place_symbol",
      symbol: mode.symbol,
      x: tx,
      y: ty,
      ...(snap?.handle ? { anchor_handle: snap.handle } : {}),
      label: mode.label,
    };
    await runOps([op]);
  }

  async function runOps(ops: Op[]) {
    setBusy(true);
    setError(null);
    const base = scene!.head_revision_id;
    try {
      await commitOps(cadId, base, ops);
      undoStack.current.push(base); // undo target = geometry before this edit
      redoStack.current = [];
      bumpHist();
      await load();
    } catch (e) {
      if (e instanceof StaleBaseError) {
        setError(e.message);
        await load();
      } else {
        setError(e instanceof Error ? e.message : "commit failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!undoStack.current.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const target = undoStack.current.pop()!;
      redoStack.current.push(scene!.head_revision_id);
      await revertTo(cadId, target);
      bumpHist();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "undo failed");
    } finally {
      setBusy(false);
    }
  }

  async function redo() {
    if (!redoStack.current.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const target = redoStack.current.pop()!;
      undoStack.current.push(scene!.head_revision_id);
      await revertTo(cadId, target);
      bumpHist();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "redo failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    await runOps([{ op: "delete_entity", handle: selected }]);
    setSelected(null);
  }

  const cursor =
    mode.kind === "place" ? "crosshair" : drag ? "grabbing" : "default";

  const pinR = Math.max(w, h) * 0.006;
  // Convert a normalised Model-view bbox (image space, y=0 at top) to a
  // model-space pin centre.
  function flagCenter(b: [number, number, number, number]): [number, number] {
    const [xn0, yn0, xn1, yn1] = b;
    const mx = x0 + ((xn0 + xn1) / 2) * w;
    const my = y1 - ((yn0 + yn1) / 2) * h; // y flips between image and model
    return [mx, my];
  }
  const activeFlagObj = flags.find((f) => f.n === activeFlag) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode({ kind: "select" })}
          className={`px-3 py-1.5 text-xs rounded-sm border ${
            mode.kind === "select"
              ? "bg-ink-900 text-white border-ink-900"
              : "bg-white text-ink-700 border-ink-300"
          }`}
        >
          Select / move
        </button>
        {PALETTE.map((p) => (
          <button
            key={p.symbol}
            type="button"
            onClick={() => setMode({ kind: "place", symbol: p.symbol, label: p.label })}
            className={`px-3 py-1.5 text-xs rounded-sm border ${
              mode.kind === "place" && mode.symbol === p.symbol
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-ink-700 border-ink-300"
            }`}
          >
            + {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-ink-700 mr-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />
            Labels
          </label>
          {flags.length > 0 && (
            <label className="flex items-center gap-1 text-xs text-ink-700 mr-1">
              <input
                type="checkbox"
                checked={showFlags}
                onChange={(e) => setShowFlags(e.target.checked)}
              />
              RFIs ({flags.length})
            </label>
          )}
          <button
            type="button"
            onClick={undo}
            disabled={!undoStack.current.length || busy}
            className="px-2 py-1.5 text-xs rounded-sm border border-ink-300 text-ink-700 disabled:opacity-40"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!redoStack.current.length || busy}
            className="px-2 py-1.5 text-xs rounded-sm border border-ink-300 text-ink-700 disabled:opacity-40"
          >
            ↷ Redo
          </button>
          {selected && (
            <button
              type="button"
              onClick={deleteSelected}
              className="px-3 py-1.5 text-xs rounded-sm border border-red-300 text-red-600"
            >
              Delete selected
            </button>
          )}
          <span className="text-xs text-ink-500">
            {scene.units} · rev {scene.head_revision_id?.slice(0, 8) ?? "original"}
            {busy ? " · saving…" : ""}
          </span>
        </div>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="relative w-full bg-white border border-ink-200 rounded-sm overflow-hidden">
        <svg
          viewBox={`${x0} ${y0} ${w} ${h}`}
          className="w-full h-auto"
          style={{ maxHeight: "82vh", minHeight: "60vh", cursor }}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onLeave}
          onClick={onClick}
        >
          <g ref={gRef} transform={flip}>
            {scene.entities.map((e) => (
              <EntityShape
                key={e.handle}
                e={e}
                extent={Math.max(w, h)}
                showLabels={showLabels}
                selected={selected === e.handle}
                dragOffset={drag?.handle === e.handle ? { dx: drag.dx, dy: drag.dy } : null}
                onGrab={mode.kind === "select" ? (evt) => grab(e.handle, evt) : undefined}
              />
            ))}
            {hoverSnap && (
              <circle
                cx={hoverSnap.x}
                cy={hoverSnap.y}
                r={snapTol * 0.25}
                className="fill-none stroke-teal-500"
                style={{ strokeWidth: 2, vectorEffect: "non-scaling-stroke" }}
              />
            )}
            {showFlags &&
              flags.map((f) => {
                if (!f.imageBbox) return null;
                const [cx, cy] = flagCenter(f.imageBbox);
                const isActive = activeFlag === f.n;
                const r = isActive ? pinR * 1.25 : pinR;
                return (
                  <g
                    key={f.n}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      setActiveFlag((a) => (a === f.n ? null : f.n));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={SEV_FILL[f.severity]}
                      stroke="#ffffff"
                      style={{ strokeWidth: 2, vectorEffect: "non-scaling-stroke" }}
                      opacity={isActive ? 1 : 0.9}
                    />
                    <text
                      transform={`translate(${cx} ${cy}) scale(1 -1)`}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={r * 1.1}
                      fontWeight={700}
                      fill="#ffffff"
                    >
                      {f.n}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>

        {activeFlagObj && (
          <div className="absolute top-3 right-3 w-72 max-w-[80%] rounded-sm border border-ink-200 bg-white/95 shadow-lg p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-white shrink-0"
                style={{ background: SEV_FILL[activeFlagObj.severity] }}
              >
                {activeFlagObj.n}
              </span>
              <button
                type="button"
                onClick={() => setActiveFlag(null)}
                className="text-ink-400 hover:text-ink-700 text-xs"
              >
                ✕
              </button>
            </div>
            {activeFlagObj.title && (
              <p className="font-medium text-ink-900 mt-1">{activeFlagObj.title}</p>
            )}
            {activeFlagObj.detail && (
              <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                {activeFlagObj.detail}
              </p>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-ink-500">
        Select / move: drag any entity — it snaps to nearby endpoints, midpoints
        and centres; release to commit. Place a fixture from the palette; click
        to drop it (snapped, feature-relative). Every change re-checks compliance.
      </p>
    </div>
  );
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const sx = cx + r * Math.cos(rad(a0));
  const sy = cy + r * Math.sin(rad(a0));
  const ex = cx + r * Math.cos(rad(a1));
  const ey = cy + r * Math.sin(rad(a1));
  const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function EntityShape({
  e,
  extent,
  showLabels,
  selected,
  dragOffset,
  onGrab,
}: {
  e: SceneEntity;
  extent: number;
  showLabels: boolean;
  selected: boolean;
  dragOffset: { dx: number; dy: number } | null;
  onGrab?: (evt: React.MouseEvent) => void;
}) {
  const stroke = selected ? "#0d9488" : "#1f2937";
  const sw = { strokeWidth: selected ? 2.5 : 1, vectorEffect: "non-scaling-stroke" as const };
  const handlers = onGrab
    ? { onMouseDown: onGrab, style: { ...sw, cursor: "move" } }
    : { style: sw };

  let inner: React.ReactNode = null;
  switch (e.type) {
    case "LINE":
      if (e.start && e.end)
        inner = (
          <line x1={e.start[0]} y1={e.start[1]} x2={e.end[0]} y2={e.end[1]} stroke={stroke} {...handlers} />
        );
      break;
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (e.points && e.points.length >= 2) {
        const pts = e.points.map((p) => `${p[0]},${p[1]}`).join(" ");
        inner = e.closed ? (
          <polygon points={pts} fill="none" stroke={stroke} {...handlers} />
        ) : (
          <polyline points={pts} fill="none" stroke={stroke} {...handlers} />
        );
      }
      break;
    }
    case "CIRCLE":
      if (e.center && e.radius != null)
        inner = (
          <circle cx={e.center[0]} cy={e.center[1]} r={e.radius} fill="none" stroke={stroke} {...handlers} />
        );
      break;
    case "ARC":
      if (e.center && e.radius != null && e.start_angle != null && e.end_angle != null)
        inner = (
          <path
            d={arcPath(e.center[0], e.center[1], e.radius, e.start_angle, e.end_angle)}
            fill="none"
            stroke={stroke}
            {...handlers}
          />
        );
      break;
    case "TEXT":
    case "MTEXT":
      if (e.insert && e.text && showLabels) {
        // Use the entity's real height, but fall back to a small fraction of
        // the drawing (not a hardcoded 100, which dwarfs small plans) and
        // clamp oversized text so a stray label can't dominate the canvas.
        const raw = e.height && e.height > 0 ? e.height : extent * 0.012;
        const size = Math.min(raw, extent * 0.04);
        // Recessive grey, and non-interactive so dense annotation never
        // intercepts a fixture-placement click or a drag on the geometry.
        inner = (
          <text
            transform={`translate(${e.insert[0]} ${e.insert[1]}) scale(1 -1)`}
            fontSize={size}
            fill="#94a3b8"
            style={{ pointerEvents: "none" }}
          >
            {e.text}
          </text>
        );
      }
      break;
    case "INSERT":
      if (e.insert)
        inner = (
          <circle
            cx={e.insert[0]}
            cy={e.insert[1]}
            r={(e.scale?.[0] ?? 1) * 30}
            className="fill-ink-200"
            stroke={stroke}
            {...handlers}
          />
        );
      break;
    default:
      return null;
  }

  if (!inner) return null;
  return dragOffset ? (
    <g transform={`translate(${dragOffset.dx} ${dragOffset.dy})`} opacity={0.7}>
      {inner}
    </g>
  ) : (
    <>{inner}</>
  );
}
