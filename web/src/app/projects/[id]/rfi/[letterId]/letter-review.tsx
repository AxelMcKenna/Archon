"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiUpload } from "@/lib/api";
import { taxonomy } from "@consentiq/shared";
import type { ExtractedEntities } from "@consentiq/shared";

type ReconLog = {
  id: string;
  state: "agree" | "ai_extends_rules" | "disagree" | "rules_override";
  rules_output: { primary_category: string | null; hits: { rule_id: string }[] };
  ai_output: {
    primary_category: string;
    secondary_category?: string | null;
    severity: "must_resolve" | "nice_to_have";
    confidence: "low" | "medium" | "high";
    reasoning: string;
  };
  final_category: string;
  final_severity: "must_resolve" | "nice_to_have";
  user_resolved_choice: string | null;
};

type Response = {
  id: string;
  rfi_item_id: string;
  draft_text: string;
  edited_text: string | null;
  edit_distance: number | null;
};

type Attachment = {
  id: string;
  rfi_item_id: string;
  filename: string;
  size_bytes: number;
};

export type ProposedChange = {
  op?: string;
  anchor_handle?: string | null;
  symbol?: string | null;
  text?: string | null;
};

export type PlanEvidence = {
  source: "flag" | "vision" | "none";
  confidence: number | null;
  rationale: string | null;
  flag_index: number | null;
  plan_upload_id: string | null;
  cad_upload_id: string | null;
  evidence: {
    rule_cited?: string | null;
    rationale?: string | null;
    target_handles?: string[];
    page?: number | null;
    verbatim_quote?: string | null;
    matched_clauses?: string[];
    proposed_change?: ProposedChange | null;
  };
};

type Item = {
  id: string;
  item_id: string;
  raw_number: string | null;
  raw_text: string;
  page: number | null;
  bbox: number[] | null;
  extracted: ExtractedEntities;
  ordering: number;
  reconciliation: ReconLog | null;
  response: Response | null;
  attachments: Attachment[];
  plan_evidence: PlanEvidence | null;
};

const STATE_STYLE: Record<ReconLog["state"], string> = {
  agree: "bg-emerald-100 text-emerald-800",
  ai_extends_rules: "bg-sky-100 text-sky-800",
  disagree: "bg-amber-100 text-amber-800",
  rules_override: "bg-violet-100 text-violet-800",
};

const STATE_LABEL: Record<ReconLog["state"], string> = {
  agree: "AI agrees with rules",
  ai_extends_rules: "AI added detail",
  disagree: "Disagreement — pick one",
  rules_override: "Rules override",
};

const SEV_DOT: Record<"must_resolve" | "nice_to_have", string> = {
  must_resolve: "bg-red-500",
  nice_to_have: "bg-amber-500",
};

export function LetterReview({
  letterId,
  items: initial,
  pipelineFailed = false,
}: {
  letterId: string;
  items: Item[];
  pipelineFailed?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    url: string;
    filename: string;
    lodgement_url: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draftingAll, setDraftingAll] = useState(false);
  const [showPipelineNotice, setShowPipelineNotice] = useState(pipelineFailed);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverText, setCoverText] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverCopied, setCoverCopied] = useState(false);
  const [regrounding, setRegrounding] = useState(false);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeItem = useMemo(
    () => items.find((i) => i.id === activeItemId) ?? null,
    [items, activeItemId],
  );
  const activePage = activeItem?.page ?? null;

  function focusItem(id: string) {
    setActiveItemId(id);
    const el = itemRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    apiFetch<{ url: string }>(`/letters/${letterId}/signed-url`)
      .then((r) => setSignedUrl(r.url))
      .catch(() => setSignedUrl(null));
  }, [letterId]);

  function patchItem(itemId: string, patch: Partial<Item>) {
    setItems((curr) => curr.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
  }

  async function saveItem(itemId: string, raw_text: string) {
    const updated = await apiFetch<Item>(`/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text }),
    });
    patchItem(itemId, updated);
  }

  async function classify() {
    setClassifying(true);
    setError(null);
    try {
      await apiFetch(`/classify/${letterId}`, { method: "POST" });
      const data = await apiFetch<{ reconciliation_log: (ReconLog & { rfi_item_id: string })[] }>(
        `/classify/${letterId}`,
      );
      const byItem = new Map(data.reconciliation_log.map((l) => [l.rfi_item_id, l]));
      setItems((curr) =>
        curr.map((i) => ({ ...i, reconciliation: byItem.get(i.id) ?? null })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classify failed");
    } finally {
      setClassifying(false);
    }
  }

  async function resolve(logId: string, user_choice: string) {
    const updated = await apiFetch<ReconLog & { rfi_item_id: string }>(
      `/reconciliation/${logId}/resolve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_choice }),
      },
    );
    patchItem(updated.rfi_item_id, { reconciliation: updated });
  }

  async function generateDraft(itemId: string) {
    const r = await apiFetch<Response>(`/draft/${itemId}`, { method: "POST" });
    patchItem(itemId, { response: r });
  }

  async function generateAllMissing() {
    const missing = items.filter((i) => i.reconciliation && !i.response);
    if (!missing.length) return;
    setDraftingAll(true);
    setError(null);
    try {
      for (const it of missing) {
        try {
          const r = await apiFetch<Response>(`/draft/${it.id}`, { method: "POST" });
          patchItem(it.id, { response: r });
        } catch (e) {
          console.warn(`draft failed for item ${it.id}`, e);
        }
      }
    } finally {
      setDraftingAll(false);
    }
  }

  async function saveDraftEdit(itemId: string, edited_text: string) {
    const r = await apiFetch<Response>(`/draft/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edited_text }),
    });
    patchItem(itemId, { response: r });
  }

  async function uploadAttachment(itemId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const a = await apiUpload<Attachment>(`/attachments/items/${itemId}`, fd);
    setItems((curr) =>
      curr.map((i) => (i.id === itemId ? { ...i, attachments: [...i.attachments, a] } : i)),
    );
  }

  async function deleteAttachment(itemId: string, attachmentId: string) {
    await apiFetch(`/attachments/${attachmentId}`, { method: "DELETE" });
    setItems((curr) =>
      curr.map((i) =>
        i.id === itemId
          ? { ...i, attachments: i.attachments.filter((a) => a.id !== attachmentId) }
          : i,
      ),
    );
  }

  async function reground() {
    setRegrounding(true);
    setError(null);
    try {
      await apiFetch(`/classify/${letterId}/ground`, { method: "POST" });
      setCoverText(null); // invalidate cached letter
      window.location.reload(); // simplest way to refresh server-loaded evidence
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-ground failed");
      setRegrounding(false);
    }
  }

  async function openCoveringLetter() {
    setCoverOpen(true);
    if (coverText) return;
    setCoverLoading(true);
    try {
      const r = await apiFetch<{ covering_letter: string }>(
        `/classify/${letterId}/render`,
      );
      setCoverText(r.covering_letter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't render covering letter");
      setCoverOpen(false);
    } finally {
      setCoverLoading(false);
    }
  }

  async function copyCoveringLetter() {
    if (!coverText) return;
    try {
      await navigator.clipboard.writeText(coverText);
      setCoverCopied(true);
      setTimeout(() => setCoverCopied(false), 1500);
    } catch {
      // Some browsers block clipboard from non-secure contexts; ignore.
    }
  }

  async function exportBundle() {
    setExporting(true);
    setError(null);
    try {
      const r = await apiFetch<{ url: string; filename: string; lodgement_url: string | null }>(
        `/export/${letterId}`,
        { method: "POST" },
      );
      setExportResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const classified = items.filter((i) => i.reconciliation).length;
  const drafted = items.filter((i) => i.response).length;
  const canExport = classified > 0 && drafted === items.length;

  const missingDrafts = items.filter((i) => i.reconciliation && !i.response).length;
  const grounded = items.some((i) => i.plan_evidence !== null);
  const matched = items.filter((i) => i.plan_evidence?.source === "flag").length;
  const unmatched = items.filter(
    (i) => i.plan_evidence && i.plan_evidence.source !== "flag",
  ).length;
  const iframeSrc =
    signedUrl && activePage
      ? `${signedUrl}#page=${activePage}&zoom=page-width`
      : signedUrl ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="rounded-sm border border-ink-700/10 bg-ink-700/5 h-full flex flex-col">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-ink-500 border-b border-ink-700/10 flex items-center justify-between gap-2">
            <span>Original document</span>
            {activePage && (
              <span className="normal-case tracking-normal text-[11px] text-ink-700">
                Showing page {activePage}
              </span>
            )}
          </div>
          {iframeSrc ? (
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              className="flex-1 w-full"
              title="Original RFI"
            />
          ) : (
            <div className="p-6 text-sm text-ink-500">Loading…</div>
          )}
        </div>
      </aside>
      <section className="space-y-4">
        {showPipelineNotice && (
          <div className="rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 text-sm flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">
                Auto-matching didn&rsquo;t finish.
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Some items may not yet be matched against the linked plan.
              </p>
            </div>
            <button
              onClick={() => setShowPipelineNotice(false)}
              className="text-amber-700 hover:text-amber-900 cursor-pointer text-xs"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="rounded-sm border border-ink-700/10 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-medium">{items.length}</span> items ·{" "}
              <span className="text-ink-500">
                {grounded ? (
                  <>
                    {matched} matched · {unmatched} no match
                  </>
                ) : (
                  <>
                    {classified} classified · {drafted} drafted
                  </>
                )}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {grounded ? (
                <>
                  <button
                    onClick={reground}
                    disabled={regrounding}
                    className="rounded-sm border border-ink-700/20 bg-white text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
                    title="Re-run plan matching against the linked plan"
                  >
                    {regrounding ? "Re-matching…" : "Re-match"}
                  </button>
                  <button
                    onClick={openCoveringLetter}
                    className="rounded-sm bg-ink-900 text-white px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-ink-700 transition-colors"
                  >
                    View covering letter
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={classify}
                    disabled={classifying}
                    className="rounded-sm border border-ink-700/20 bg-white text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
                  >
                    {classifying ? "Classifying…" : classified ? "Re-classify" : "Classify"}
                  </button>
                  {missingDrafts > 0 && (
                    <button
                      onClick={generateAllMissing}
                      disabled={draftingAll || classified === 0}
                      className="rounded-sm border border-ink-700/20 bg-white text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
                      title={
                        classified === 0
                          ? "Classify the letter first"
                          : `${missingDrafts} item${missingDrafts === 1 ? "" : "s"} need a draft`
                      }
                    >
                      {draftingAll ? "Drafting…" : `Generate all drafts (${missingDrafts})`}
                    </button>
                  )}
                  <button
                    onClick={exportBundle}
                    disabled={!canExport || exporting}
                    className="rounded-sm bg-ink-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700 transition-colors"
                  >
                    {exporting
                      ? "Building bundle…"
                      : canExport
                        ? "Export bundle"
                        : `Export bundle (${drafted}/${items.length})`}
                  </button>
                </>
              )}
            </div>
          </div>
          {exportResult && (
            <div className="rounded-sm bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm flex flex-wrap items-center gap-3">
              <a href={exportResult.url} className="font-medium underline" target="_blank" rel="noreferrer">
                Download {exportResult.filename}
              </a>
              {exportResult.lodgement_url && (
                <a
                  href={exportResult.lodgement_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-500 hover:text-ink-900"
                >
                  Open lodgement portal →
                </a>
              )}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isActive={item.id === activeItemId}
            registerRef={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            onFocus={() => setActiveItemId(item.id)}
            onSave={(t) => saveItem(item.id, t)}
            onResolve={async (c) => {
              if (item.reconciliation) await resolve(item.reconciliation.id, c);
            }}
            onGenerateDraft={() => generateDraft(item.id)}
            onSaveDraft={(t) => saveDraftEdit(item.id, t)}
            onAttach={(f) => uploadAttachment(item.id, f)}
            onDeleteAttachment={(aid) => deleteAttachment(item.id, aid)}
          />
        ))}
      </section>
      {coverOpen && (
        <CoveringLetterModal
          loading={coverLoading}
          text={coverText}
          copied={coverCopied}
          onCopy={copyCoveringLetter}
          onClose={() => setCoverOpen(false)}
        />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Tiny renderer for the covering letter's markdown subset only:
// ### headings, **bold**, > quote, blank-line paragraphs.
function renderCoveringLetterHtml(md: string): string {
  const blocks = md.split(/\n{2,}/);
  const html = blocks
    .map((blk) => {
      const t = blk.trim();
      if (!t) return "";
      if (t.startsWith("### ")) {
        return `<h3>${escapeHtml(t.slice(4))}</h3>`;
      }
      if (t.startsWith("> ")) {
        return `<blockquote>${escapeHtml(t.slice(2))}</blockquote>`;
      }
      const inline = escapeHtml(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/  \n/g, "<br>")
        .replace(/\n/g, "<br>");
      return `<p>${inline}</p>`;
    })
    .filter(Boolean)
    .join("\n");
  return html;
}

function openPrintWindow(markdown: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!w) return;
  const body = renderCoveringLetterHtml(markdown);
  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Covering letter</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  body {
    font: 11pt/1.55 "Helvetica Neue", Arial, sans-serif;
    color: #1d2730; max-width: 760px; margin: 0 auto; padding: 24px;
  }
  h3 {
    font-size: 11.5pt; margin: 18px 0 6px 0;
    color: #00595f; letter-spacing: 0.2px;
    border-bottom: 1px solid #e2e7ea; padding-bottom: 4px;
  }
  p { margin: 6px 0; }
  blockquote {
    margin: 8px 0; padding: 6px 12px;
    background: #fff8e1; border-left: 3px solid #f1c14b;
    font-size: 10pt; color: #5a4a10;
  }
  strong { color: #1d2730; }
  code {
    font: 10pt/1.4 "SF Mono", Menlo, monospace;
    background: #f6f8f9; padding: 1px 4px; border-radius: 2px;
  }
  .hint { font-size: 10pt; color: #5a6770; margin-top: 18px; }
  @media print { .hint { display: none; } }
</style></head>
<body>
${body}
<p class="hint">Use your browser's <em>Print → Save as PDF</em> to save this letter.</p>
<script>setTimeout(() => window.print(), 200);</script>
</body></html>`);
  w.document.close();
}

function CoveringLetterModal({
  loading,
  text,
  copied,
  onCopy,
  onClose,
}: {
  loading: boolean;
  text: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-sm shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-700/10">
          <div>
            <h3 className="font-semibold">Covering letter</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Generated from matched plan evidence. Edit before sending.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCopy}
              disabled={!text}
              className="rounded-sm border border-ink-700/20 bg-white text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
            >
              {copied ? "Copied" : "Copy markdown"}
            </button>
            <button
              onClick={() => text && openPrintWindow(text)}
              disabled={!text}
              className="rounded-sm border border-ink-700/20 bg-white text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
            >
              Print → PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-sm border border-ink-700/20 bg-white text-ink-900 px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-ink-700/5"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading || !text ? (
            <p className="text-sm text-ink-500">Rendering…</p>
          ) : (
            <div
              className="prose prose-sm max-w-none [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-emerald-900 [&_p]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-400 [&_blockquote]:bg-amber-50 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:my-2 [&_blockquote]:text-sm [&_code]:bg-ink-700/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded-sm [&_code]:text-xs"
              dangerouslySetInnerHTML={{ __html: renderCoveringLetterHtml(text) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  isActive,
  registerRef,
  onFocus,
  onSave,
  onResolve,
  onGenerateDraft,
  onSaveDraft,
  onAttach,
  onDeleteAttachment,
}: {
  item: Item;
  isActive: boolean;
  registerRef: (el: HTMLElement | null) => void;
  onFocus: () => void;
  onSave: (raw_text: string) => Promise<void>;
  onResolve: (user_choice: string) => Promise<void>;
  onGenerateDraft: () => Promise<void>;
  onSaveDraft: (edited_text: string) => Promise<void>;
  onAttach: (file: File) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
}) {
  const [text, setText] = useState(item.raw_text);
  const [busy, setBusy] = useState(false);
  const dirty = text !== item.raw_text;

  async function save() {
    setBusy(true);
    try {
      await onSave(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      ref={registerRef}
      onMouseDown={onFocus}
      onFocusCapture={onFocus}
      className={`rounded-sm border p-4 transition-shadow scroll-mt-4 ${
        isActive
          ? "border-ink-900 ring-2 ring-ink-900/10"
          : "border-ink-700/10"
      }`}
    >
      <header className="flex items-baseline justify-between mb-3 gap-3">
        <h3 className="font-semibold">
          Item {item.raw_number ?? item.ordering + 1}
          {item.page ? (
            <span className="ml-2 text-xs text-ink-500">p.{item.page}</span>
          ) : null}
        </h3>
        {dirty ? (
          <button
            onClick={save}
            disabled={busy}
            className="text-xs rounded-sm bg-ink-900 text-white px-2.5 py-1 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        ) : null}
      </header>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(3, Math.min(10, text.split("\n").length + 1))}
        className="w-full rounded-sm border border-ink-700/15 px-3 py-2 text-sm leading-relaxed"
      />
      <Facets entities={item.extracted} />
      {item.plan_evidence ? (
        <SuggestedFix evidence={item.plan_evidence} />
      ) : (
        <>
          {item.reconciliation && (
            <Classification recon={item.reconciliation} onResolve={onResolve} />
          )}
          {item.reconciliation && (
            <DraftBlock
              response={item.response}
              onGenerate={onGenerateDraft}
              onSave={onSaveDraft}
            />
          )}
        </>
      )}
      <Attachments
        attachments={item.attachments}
        onAttach={onAttach}
        onDelete={onDeleteAttachment}
      />
    </article>
  );
}

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

function SuggestedFix({ evidence }: { evidence: PlanEvidence }) {
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
  // Prefer the structured op; fall back to the analyser's rationale (PDF
  // flags don't carry an op, but they do carry a sensible "what's wrong"
  // sentence we can pivot into a "what to do" line).
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

function EvidenceChip({ evidence }: { evidence: PlanEvidence }) {
  const { source, confidence, evidence: ev } = evidence;
  if (source === "flag") {
    const handles = ev.target_handles?.length
      ? ` · handle ${ev.target_handles.join(", ")}`
      : "";
    const page = ev.page ? ` · p.${ev.page}` : "";
    const fix = ev.proposed_change?.op ? ` · fix: ${ev.proposed_change.op}` : "";
    const conf =
      typeof confidence === "number" ? ` · ${(confidence * 100).toFixed(0)}%` : "";
    return (
      <div className="mt-3 flex items-center gap-2 text-xs flex-wrap">
        <span className="inline-block rounded-sm bg-emerald-100 text-emerald-800 px-2 py-0.5 font-medium">
          Matched flag
        </span>
        <span className="text-ink-500 font-mono">
          {ev.rule_cited ?? "(no clause)"}{handles}{page}{fix}{conf}
        </span>
      </div>
    );
  }
  if (source === "vision") {
    return (
      <div className="mt-3 text-xs">
        <span className="inline-block rounded-sm bg-sky-100 text-sky-800 px-2 py-0.5 font-medium">
          Vision-located
        </span>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2 text-xs flex-wrap">
      <span className="inline-block rounded-sm bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">
        No plan match
      </span>
      <span className="text-ink-500">needs your input</span>
    </div>
  );
}

function Classification({
  recon,
  onResolve,
}: {
  recon: ReconLog;
  onResolve: (user_choice: string) => Promise<void>;
}) {
  const cat = taxonomy.categories.find((c) => c.id === recon.final_category);
  return (
    <div className="mt-4 border-t border-ink-700/10 pt-3 space-y-2">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className={`inline-block rounded-sm px-2 py-0.5 text-xs ${STATE_STYLE[recon.state]}`}>
          {STATE_LABEL[recon.state]}
        </span>
        <span className="text-xs text-ink-700">{cat?.label ?? recon.final_category}</span>
        <span
          className={`ml-auto inline-flex items-center gap-1 text-xs ${
            recon.final_severity === "must_resolve" ? "text-red-700" : "text-amber-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[recon.final_severity]}`}
          />
          {recon.final_severity === "must_resolve" ? "Must resolve" : "Nice to have"}
        </span>
      </div>
      <details className="text-xs" open={recon.state !== "agree"}>
        <summary className="cursor-pointer text-ink-500 hover:text-ink-900">
          Why this category?
        </summary>
        <p className="mt-1 text-ink-700 italic">{recon.ai_output.reasoning}</p>
      </details>
      {recon.state === "disagree" && !recon.user_resolved_choice && (
        <Resolver recon={recon} onResolve={onResolve} />
      )}
      {recon.user_resolved_choice && (
        <p className="text-xs text-ink-500">
          You resolved this as <span className="font-mono">{recon.user_resolved_choice}</span>.
        </p>
      )}
    </div>
  );
}

function Resolver({
  recon,
  onResolve,
}: {
  recon: ReconLog;
  onResolve: (user_choice: string) => Promise<void>;
}) {
  const rules = recon.rules_output.primary_category;
  const ai = recon.ai_output.primary_category;
  const rulesLabel = taxonomy.categories.find((c) => c.id === rules)?.label;
  const aiLabel = taxonomy.categories.find((c) => c.id === ai)?.label;
  const [busy, setBusy] = useState(false);
  async function pick(choice: string) {
    setBusy(true);
    try {
      await onResolve(choice);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-sm bg-amber-50 border border-amber-200 px-3 py-2 text-xs space-y-2">
      <p className="font-medium">Pick the right category:</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {rules && (
          <button
            disabled={busy}
            onClick={() => pick(rules)}
            className="text-left rounded-sm border border-ink-700/20 bg-white px-2.5 py-2 hover:bg-ink-700/5 cursor-pointer disabled:opacity-50"
          >
            <div className="text-[10px] uppercase tracking-wide text-ink-500">
              Rules engine
            </div>
            <div className="font-medium">{rulesLabel ?? rules}</div>
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => pick(ai)}
          className="text-left rounded-sm border border-ink-700/20 bg-white px-2.5 py-2 hover:bg-ink-700/5 cursor-pointer disabled:opacity-50"
        >
          <div className="text-[10px] uppercase tracking-wide text-ink-500">AI</div>
          <div className="font-medium">{aiLabel ?? ai}</div>
        </button>
      </div>
    </div>
  );
}

function DraftBlock({
  response,
  onGenerate,
  onSave,
}: {
  response: Response | null;
  onGenerate: () => Promise<void>;
  onSave: (edited_text: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(response?.edited_text ?? response?.draft_text ?? "");
  const initial = response?.edited_text ?? response?.draft_text ?? "";
  const dirty = text !== initial;

  // Sync local state when a regenerate happens externally.
  useEffect(() => {
    setText(response?.edited_text ?? response?.draft_text ?? "");
  }, [response?.draft_text, response?.edited_text]);

  async function generate() {
    setBusy(true);
    try {
      await onGenerate();
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await onSave(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-ink-700/10 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Response draft</h4>
        <div className="flex gap-2">
          <button
            onClick={generate}
            disabled={busy}
            className="text-xs rounded-sm border border-ink-700/20 px-2 py-1 hover:bg-ink-700/5 disabled:opacity-50"
          >
            {busy ? "Working…" : response ? "Regenerate" : "Generate draft"}
          </button>
          {response && dirty && (
            <button
              onClick={save}
              disabled={busy}
              className="text-xs rounded-sm bg-ink-900 text-white px-2.5 py-1 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save edits"}
            </button>
          )}
        </div>
      </div>
      {response ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.max(6, Math.min(20, text.split("\n").length + 1))}
            className="w-full rounded-sm border border-ink-700/15 px-3 py-2 text-sm leading-relaxed"
          />
          {response.edit_distance !== null && response.edited_text && (
            <p className="text-xs text-ink-500">
              Edit distance from original: {response.edit_distance}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-ink-500">No draft yet.</p>
      )}
    </div>
  );
}

function Attachments({
  attachments,
  onAttach,
  onDelete,
}: {
  attachments: Attachment[];
  onAttach: (file: File) => Promise<void>;
  onDelete: (attachmentId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function handleFile(f: File) {
    setBusy(true);
    try {
      await onAttach(f);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 border-t border-ink-700/10 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Attachments</h4>
        <label className="text-xs rounded-sm border border-ink-700/20 px-2 py-1 cursor-pointer hover:bg-ink-700/5">
          {busy ? "Uploading…" : "Add file"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {attachments.length ? (
        <ul className="space-y-1 text-xs">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-sm bg-ink-700/5 px-2 py-1">
              <span className="truncate">{a.filename}</span>
              <button
                onClick={() => onDelete(a.id)}
                className="text-ink-500 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-500">No attachments yet.</p>
      )}
    </div>
  );
}

function Facets({ entities }: { entities: ExtractedEntities }) {
  const rows: Array<[string, string[]]> = [
    ["clauses", entities.clause_references],
    ["documents", entities.document_references],
    ["standards", entities.standards_references],
    ["professionals", entities.professional_references],
  ];
  const dims = entities.dimensions.map((d) => `${d.value}${d.unit}`);
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-ink-500 w-20">{k}</dt>
          <dd className="font-mono">{v.length ? v.join(", ") : <span className="text-ink-500">—</span>}</dd>
        </div>
      ))}
      <div className="flex gap-2 col-span-2">
        <dt className="text-ink-500 w-20">dimensions</dt>
        <dd className="font-mono">{dims.length ? dims.join(", ") : <span className="text-ink-500">—</span>}</dd>
      </div>
    </dl>
  );
}
