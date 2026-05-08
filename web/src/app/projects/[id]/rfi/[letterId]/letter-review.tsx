"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ url: string }>(`/letters/${letterId}/signed-url`)
      .then((r) => setSignedUrl(r.url))
      .catch(() => setSignedUrl(null));
  }, [letterId]);

  async function saveItem(itemId: string, raw_text: string) {
    const updated = await apiFetch<Item>(`/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text }),
    });
    setItems((curr) => curr.map((i) => (i.id === itemId ? { ...i, ...updated } : i)));
  }

  async function classify() {
    setClassifying(true);
    setError(null);
    try {
      await apiFetch(`/classify/${letterId}`, { method: "POST" });
      // Re-pull recon log via API (route returns recon_log).
      const data = await apiFetch<{ reconciliation_log: ReconLog[] }>(
        `/classify/${letterId}`,
      );
      const byItem = new Map(data.reconciliation_log.map((l) => [(l as ReconLog & { rfi_item_id?: string }).rfi_item_id ?? "", l]));
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
    setItems((curr) =>
      curr.map((i) =>
        i.id === updated.rfi_item_id ? { ...i, reconciliation: updated } : i,
      ),
    );
  }

  const classified = items.filter((i) => i.reconciliation).length;

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
        <div className="flex items-center justify-between rounded-lg border border-ink-700/10 px-4 py-3">
          <div className="text-sm">
            <span className="font-medium">{items.length}</span> items ·{" "}
            <span className="text-ink-500">{classified} classified</span>
          </div>
          <button
            onClick={classify}
            disabled={classifying}
            className="rounded-lg bg-ink-900 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {classifying ? "Classifying…" : classified ? "Re-classify" : "Classify"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onSave={(t) => saveItem(item.id, t)}
            onResolve={(c) => item.reconciliation && resolve(item.reconciliation.id, c)}
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
}: {
  item: Item;
  onSave: (raw_text: string) => Promise<void>;
  onResolve: (user_choice: string) => Promise<void>;
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
