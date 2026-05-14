"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiUpload } from "@/lib/api";
import { AiThinking } from "@/components/ai-thinking";
import type { Attachment, Item, ReconLog, Response } from "./types";
import { CoveringLetterModal } from "./_components/covering-letter-modal";
import { ItemCard } from "./_components/item-card";

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
                    className="rounded-sm border border-ink-700/20 bg-surface-raised text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
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
                    className="rounded-sm border border-ink-700/20 bg-surface-raised text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
                  >
                    {classifying ? (
                      <AiThinking label="Classifying" variant="button" />
                    ) : classified ? (
                      "Re-classify"
                    ) : (
                      "Classify"
                    )}
                  </button>
                  {missingDrafts > 0 && (
                    <button
                      onClick={generateAllMissing}
                      disabled={draftingAll || classified === 0}
                      className="rounded-sm border border-ink-700/20 bg-surface-raised text-ink-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-ink-700/5"
                      title={
                        classified === 0
                          ? "Classify the letter first"
                          : `${missingDrafts} item${missingDrafts === 1 ? "" : "s"} need a draft`
                      }
                    >
                      {draftingAll ? (
                        <AiThinking label="Drafting all" variant="button" />
                      ) : (
                        `Generate all drafts (${missingDrafts})`
                      )}
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
        {(classifying || draftingAll) && (
          <AiThinking
            label={classifying ? "Classifying RFI items" : "Drafting responses"}
            hint={
              classifying
                ? "Splitting the letter into items and tagging each by category."
                : `Generating ${missingDrafts} draft${missingDrafts === 1 ? "" : "s"} grounded in matched plan flags.`
            }
            variant="block"
          />
        )}
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

