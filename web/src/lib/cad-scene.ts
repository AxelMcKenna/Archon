// Client mirror of the server scene/op contract (api/data/cad_scene.schema.json,
// api/data/cad_ops.schema.json). The engine is authoritative; this is the thin
// interaction layer — render, hit-test, snap, commit on mouse-up.

import { API_BASE } from "@/lib/api";

export type SnapKind = "endpoint" | "midpoint" | "center" | "intersection";

export type SceneSnap = {
  x: number;
  y: number;
  kind: SnapKind;
  handle: string | null;
};

export type SceneEntity = {
  handle: string;
  type: string;
  layer: string;
  bbox: [number, number, number, number] | null;
  // geometry (present per type)
  start?: [number, number];
  end?: [number, number];
  points?: [number, number][];
  closed?: boolean;
  center?: [number, number];
  radius?: number;
  start_angle?: number;
  end_angle?: number;
  text?: string;
  insert?: [number, number] | null;
  height?: number;
  block?: string;
  scale?: [number, number];
  rotation?: number;
};

export type Scene = {
  version: string;
  units: string;
  extents: [number, number, number, number];
  entities: SceneEntity[];
  snaps: SceneSnap[];
  head_revision_id: string | null;
};

export type OpDelta = { added: string[]; removed: string[]; changed: string[] };

export type CommitResult = {
  revision_id: string;
  seq: number;
  delta: OpDelta;
  url: string;
  recheck_status: string;
};

// Op shapes (subset used by Tier 1 UX). Server re-validates everything.
export type Op =
  | {
      op: "place_symbol";
      symbol: string;
      anchor_handle?: string;
      snap?: SnapKind;
      offset_mm?: number;
      x?: number;
      y?: number;
      label?: string;
    }
  | { op: "delete_entity"; handle: string }
  | { op: "set_attribute"; handle: string; key: "layer" | "text" | "height" | "color"; value: string | number }
  | { op: "change_layer"; handle: string; layer: string }
  | { op: "move_entity"; handle: string; dx: number; dy: number };

export async function fetchScene(cadId: string, rev?: string): Promise<Scene> {
  const q = rev ? `?rev=${encodeURIComponent(rev)}` : "";
  const res = await fetch(`${API_BASE}/cad/${cadId}/scene${q}`);
  if (!res.ok) throw new Error(`scene fetch failed (${res.status})`);
  return res.json() as Promise<Scene>;
}

export async function commitOps(
  cadId: string,
  baseRevisionId: string | null,
  ops: Op[],
): Promise<CommitResult> {
  const res = await fetch(`${API_BASE}/cad/${cadId}/ops`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ base_revision_id: baseRevisionId, ops }),
  });
  if (res.status === 409) {
    throw new StaleBaseError("The drawing changed since you loaded it — reload to continue.");
  }
  if (!res.ok) throw new Error(`commit failed (${res.status})`);
  return res.json() as Promise<CommitResult>;
}

export class StaleBaseError extends Error {}

/** Undo/redo: append a revision whose geometry equals `toRevisionId` (null =
 * the original upload). Returns the new head revision id. */
export async function revertTo(
  cadId: string,
  toRevisionId: string | null,
): Promise<{ revision_id: string; seq: number; url: string }> {
  const res = await fetch(`${API_BASE}/cad/${cadId}/revert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to_revision_id: toRevisionId }),
  });
  if (!res.ok) throw new Error(`revert failed (${res.status})`);
  return res.json();
}

/** Nearest snap target to a model-space point, within `tol` model units.
 * Linear scan — fine for small scenes; use SnapIndex for large ones. */
export function nearestSnap(
  snaps: SceneSnap[],
  mx: number,
  my: number,
  tol: number,
): SceneSnap | null {
  let best: SceneSnap | null = null;
  let bestD = tol * tol;
  for (const s of snaps) {
    const dx = s.x - mx;
    const dy = s.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/**
 * Uniform-grid spatial index over snap points — O(1) average nearest-snap per
 * frame regardless of scene size, so dragging stays at 60fps on busy plans.
 * (Same role as an rbush index; a grid is a better fit for nearest-point than
 * rbush's bbox search, and adds no dependency.) Cell size is the snap
 * tolerance, so a query only ever touches the 3×3 neighbourhood of cells.
 */
export class SnapIndex {
  private cell: number;
  private buckets = new Map<string, SceneSnap[]>();

  constructor(snaps: SceneSnap[], cell: number) {
    this.cell = Math.max(cell, 1e-6);
    for (const s of snaps) {
      const key = this.key(s.x, s.y);
      const b = this.buckets.get(key);
      if (b) b.push(s);
      else this.buckets.set(key, [s]);
    }
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }

  /** Nearest snap within `tol` model units, or null. */
  nearest(mx: number, my: number, tol: number): SceneSnap | null {
    const cx = Math.floor(mx / this.cell);
    const cy = Math.floor(my / this.cell);
    let best: SceneSnap | null = null;
    let bestD = tol * tol;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const b = this.buckets.get(`${gx},${gy}`);
        if (!b) continue;
        for (const s of b) {
          const dx = s.x - mx;
          const dy = s.y - my;
          const d = dx * dx + dy * dy;
          if (d <= bestD) {
            bestD = d;
            best = s;
          }
        }
      }
    }
    return best;
  }
}
