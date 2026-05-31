"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/api";

export type CadOverlayItem = {
  /** 1-based pin number shown on the box. */
  n: number;
  /** Per-view normalised boxes, keyed by view name. */
  imageBboxes?: Record<string, [number, number, number, number]>;
  /** Tailwind border colour class, e.g. "border-red-500". */
  borderClass: string;
  /** Tailwind pin background class, e.g. "bg-red-500". */
  pinClass: string;
  title?: string;
};

/**
 * Shared DXF view image + bbox/pin overlay, used by both the RFI flagger
 * (``CadReview``) and the value-engineering review. Renders one CAD view
 * (``/cad/{id}/views/{view}.png``) with absolutely-positioned overlay boxes
 * from each item's per-view ``imageBboxes``.
 *
 * The container aspect ratio comes from ``aspectRatio`` when known; otherwise
 * it's derived from the loaded image's natural dimensions — so it works even
 * for drawings with no persisted view metadata (e.g. VE-only uploads).
 */
export function CadOverlayImage({
  cadId,
  activeView,
  items,
  activeN,
  onSelect,
  showOverlays = true,
  revisedVersion = 0,
  aspectRatio,
}: {
  cadId: string;
  activeView: string;
  items: CadOverlayItem[];
  activeN: number | null;
  onSelect: (n: number) => void;
  showOverlays?: boolean;
  revisedVersion?: number;
  aspectRatio?: number;
}) {
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const ratio = aspectRatio ?? naturalAspect ?? undefined;
  const src =
    revisedVersion > 0
      ? `${API_BASE}/cad/${cadId}/views/${encodeURIComponent(activeView)}.png?revised=1&v=${revisedVersion}`
      : `${API_BASE}/cad/${cadId}/views/${encodeURIComponent(activeView)}.png`;

  return (
    <div
      className="relative w-full bg-surface-raised border border-ink-700/10 rounded-sm shadow-sm overflow-hidden"
      style={ratio ? { aspectRatio: `${ratio}` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={activeView}
        onLoad={(e) => {
          if (aspectRatio) return;
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setNaturalAspect(img.naturalWidth / img.naturalHeight);
          }
        }}
        className="absolute inset-0 w-full h-full object-contain"
      />
      <div
        className={`absolute inset-0 pointer-events-none ${showOverlays ? "" : "hidden"}`}
      >
        {items.map((it) => {
          const bb = it.imageBboxes?.[activeView];
          if (!bb) return null;
          const [x0, y0, x1, y1] = bb;
          const isActive = activeN === it.n;
          return (
            <button
              type="button"
              key={it.n}
              onClick={() => onSelect(it.n)}
              style={{
                left: `${x0 * 100}%`,
                top: `${y0 * 100}%`,
                width: `${Math.max(0, x1 - x0) * 100}%`,
                height: `${Math.max(0, y1 - y0) * 100}%`,
              }}
              className="absolute pointer-events-auto cursor-pointer focus:outline-none"
              title={it.title}
            >
              {/* Rectangle inflated 6px outward so the box frames the content
                  with breathing room. Click target stays on the data bbox. */}
              <span
                className={`absolute -inset-[6px] ${it.borderClass} ${
                  isActive
                    ? "bg-yellow-300/30 ring-2 ring-yellow-500 border-[3px]"
                    : "bg-transparent border-2"
                } pointer-events-none`}
              />
              <span
                className={`absolute -top-3 -left-3 ${it.pinClass} text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow ring-2 ring-white pointer-events-none`}
              >
                {it.n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
