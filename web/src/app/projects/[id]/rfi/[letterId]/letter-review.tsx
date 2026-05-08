"use client";

import { useEffect, useState } from "react";
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
};

const STATE_STYLE: Record<ReconLog["state"], string> = {
  agree: "bg-emerald-100 text-emerald-800",
  ai_extends_rules: "bg-sky-100 text-sky-800",
  disagree: "bg-amber-100 text-amber-800",
  rules_override: "bg-violet-100 text-violet-800",
};

export function LetterReview({
  letterId,
  items: initial,
}: {
  letterId: string;
  items: Item[];
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="rounded-lg border border-ink-700/10 bg-ink-700/5 h-full flex flex-col">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-ink-500 border-b border-ink-700/10">
            Original document
          </div>
          {signedUrl ? (
            <iframe src={signedUrl} className="flex-1 w-full" title="Original RFI" />
          ) : (
            <div className="p-6 text-sm text-ink-500">Loading…</div>
          )}
        </div>
      </aside>
      <section className="space-y-4">
        <div className="rounded-lg border border-ink-700/10 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-medium">{items.length}</span> items ·{" "}
              <span className="text-ink-500">
                {classified} classified · {drafted} drafted
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={classify}
                disabled={classifying}
                className="rounded-lg bg-ink-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {classifying ? "Classifying…" : classified ? "Re-classify" : "Classify"}
              </button>
              <button
                onClick={exportBundle}
                disabled={!canExport || exporting}
                className="rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                title={!canExport ? "Draft every item before exporting" : ""}
              >
                {exporting ? "Building bundle…" : "Export bundle"}
              </button>
            </div>
          </div>
          {exportResult && (
            <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm flex flex-wrap items-center gap-3">
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
            onSave={(t) => saveItem(item.id, t)}
            onResolve={(c) => item.reconciliation && resolve(item.reconciliation.id, c)}
            onGenerateDraft={() => generateDraft(item.id)}
            onSaveDraft={(t) => saveDraftEdit(item.id, t)}
            onAttach={(f) => uploadAttachment(item.id, f)}
            onDeleteAttachment={(aid) => deleteAttachment(item.id, aid)}
          />
        ))}
      </section>
    </div>
  );
}

function ItemCard({
  item,
  onSave,
  onResolve,
  onGenerateDraft,
  onSaveDraft,
  onAttach,
  onDeleteAttachment,
}: {
  item: Item;
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
    <article className="rounded-lg border border-ink-700/10 p-4">
      <header className="flex items-baseline justify-between mb-3 gap-3">
        <h3 className="font-semibold">
          Item {item.raw_number ?? item.ordering + 1}
          {item.page ? <span className="ml-2 text-xs text-ink-500">p.{item.page}</span> : null}
        </h3>
        {dirty ? (
          <button
            onClick={save}
            disabled={busy}
            className="text-xs rounded bg-ink-900 text-white px-2.5 py-1 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        ) : null}
      </header>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(3, Math.min(10, text.split("\n").length + 1))}
        className="w-full rounded border border-ink-700/15 px-3 py-2 text-sm font-mono leading-relaxed"
      />
      <Facets entities={item.extracted} />
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
      <Attachments
        attachments={item.attachments}
        onAttach={onAttach}
        onDelete={onDeleteAttachment}
      />
    </article>
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
        <span className={`inline-block rounded px-2 py-0.5 text-xs ${STATE_STYLE[recon.state]}`}>
          {recon.state}
        </span>
        <span className="font-mono text-xs">{recon.final_category}</span>
        <span className="text-ink-500 text-xs">· {cat?.label}</span>
        <span className="ml-auto text-xs text-ink-500">{recon.final_severity}</span>
      </div>
      <p className="text-xs text-ink-500 italic">{recon.ai_output.reasoning}</p>
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
    <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
      <p className="mb-2 font-medium">Pick the right category:</p>
      <div className="flex gap-2 flex-wrap">
        {rules && (
          <button
            disabled={busy}
            onClick={() => pick(rules)}
            className="rounded border border-ink-700/20 bg-white px-2 py-1 hover:bg-ink-700/5"
          >
            rules: <span className="font-mono">{rules}</span>
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => pick(ai)}
          className="rounded border border-ink-700/20 bg-white px-2 py-1 hover:bg-ink-700/5"
        >
          ai: <span className="font-mono">{ai}</span>
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
            className="text-xs rounded border border-ink-700/20 px-2 py-1 hover:bg-ink-700/5 disabled:opacity-50"
          >
            {busy ? "Working…" : response ? "Regenerate" : "Generate draft"}
          </button>
          {response && dirty && (
            <button
              onClick={save}
              disabled={busy}
              className="text-xs rounded bg-ink-900 text-white px-2.5 py-1 disabled:opacity-50"
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
            className="w-full rounded border border-ink-700/15 px-3 py-2 text-sm leading-relaxed"
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
        <label className="text-xs rounded border border-ink-700/20 px-2 py-1 cursor-pointer hover:bg-ink-700/5">
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
            <li key={a.id} className="flex items-center justify-between rounded bg-ink-700/5 px-2 py-1">
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
    ["docs", entities.document_references],
    ["standards", entities.standards_references],
    ["profs", entities.professional_references],
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
