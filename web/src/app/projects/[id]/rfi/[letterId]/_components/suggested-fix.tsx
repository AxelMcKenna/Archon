"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { PlanEvidence, ProposedChange } from "../types";

function formatProposedChange(op: ProposedChange | null | undefined): string | null {
  if (!op) return null;
  const anchor = op.anchor_handle;
  switch (op.op) {
    case "place_symbol": {
      const sym = (op.symbol ?? "symbol").replace(/_/g, " ");
      return anchor
        ? `Place a ${sym} symbol on the DXF, anchored to entity ${anchor}.`
        : `Place a ${sym} symbol on the DXF at the location indicated.`;
    }
    case "add_text_note":
      return anchor
        ? `Add the note "${op.text ?? "(note)"}" near entity ${anchor}.`
        : `Add the note "${op.text ?? "(note)"}" at the location indicated.`;
    case "move_entity":
      return `Move entity ${anchor ?? "?"} per the analyser detail.`;
    case "offset_polyline":
      return `Offset the polyline at entity ${anchor ?? "?"} per the analyser detail.`;
    case "add_dimension":
      return `Add a dimension at entity ${anchor ?? "?"}.`;
    case "resize_block":
      return `Resize block at entity ${anchor ?? "?"} per the analyser detail.`;
    default:
      return op.op
        ? `Apply the analyser's \`${op.op}\` change at entity ${anchor ?? "?"}.`
        : null;
  }
}

export function SuggestedFix({ evidence }: { evidence: PlanEvidence }) {
  const ev = evidence.evidence;
  const matched = evidence.source === "flag";
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ url: string } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  if (!matched) {
    return (
      <div className="mt-4 rounded-sm border border-amber-200 bg-amber-50/50 p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide font-semibold text-amber-800">
          No plan match — your call
        </p>
        <p className="text-sm text-ink-700">
          We could not locate this on the linked plan. It is likely a
          document-wide concern (units, code references, file format) rather
          than a single location. You will need to address it directly.
        </p>
      </div>
    );
  }

  const rule = ev.rule_cited ?? "(no clause)";
  const handles = ev.target_handles?.length ? ev.target_handles.join(", ") : null;
  const page = ev.page;
  const quote = ev.verbatim_quote;
  const opFix = formatProposedChange(ev.proposed_change);
  const rationaleFix = ev.rationale
    ? `Update the plan to ${ev.rationale.charAt(0).toLowerCase()}${ev.rationale.slice(1).replace(/\.$/, "")}.`
    : null;
  const fixText = opFix ?? rationaleFix;

  const canApply =
    !!evidence.cad_upload_id &&
    typeof evidence.flag_index === "number" &&
    !!ev.proposed_change?.op;

  async function applyFix() {
    if (!canApply || !evidence.cad_upload_id) return;
    setApplying(true);
    setApplyError(null);
    try {
      const r = await apiFetch<{ revision_id: string; url: string }>(
        `/cad/${evidence.cad_upload_id}/revisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved_flag_indices: [evidence.flag_index] }),
        },
      );
      setApplied({ url: r.url });
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-4 rounded-sm border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="inline-block rounded-sm bg-emerald-100 text-emerald-800 px-2 py-0.5 font-semibold">
          Matched flag
        </span>
        <span className="font-mono text-ink-700">{rule}</span>
        {typeof evidence.confidence === "number" && (
          <span className="text-ink-500">
            · {(evidence.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-500">Located on plan</dt>
        <dd className="text-ink-900">
          {handles && <span className="font-mono">DXF entity {handles}</span>}
          {handles && (page || quote) && <span className="text-ink-500"> · </span>}
          {page && <span>page {page}</span>}
          {quote && (
            <span className="text-ink-500">
              {(handles || page) && " · "}plan text{" "}
              <span className="font-mono">&quot;{quote}&quot;</span>
            </span>
          )}
        </dd>

        {fixText && (
          <>
            <dt className="text-ink-500">Suggested fix</dt>
            <dd className="text-ink-900 font-medium">{fixText}</dd>
          </>
        )}
      </dl>

      {canApply && (
        <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between gap-3 flex-wrap">
          {applied ? (
            <a
              href={applied.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium underline text-emerald-800"
            >
              Download revised DXF →
            </a>
          ) : (
            <span className="text-xs text-ink-500">
              We can apply this directly to the linked DXF.
            </span>
          )}
          <button
            onClick={applyFix}
            disabled={applying}
            className="rounded-sm bg-ink-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700 transition-colors"
          >
            {applying ? "Applying…" : applied ? "Re-apply" : "Apply fix to DXF"}
          </button>
        </div>
      )}
      {applyError && <p className="text-xs text-red-600">{applyError}</p>}
    </div>
  );
}

