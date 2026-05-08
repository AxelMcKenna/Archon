"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ExtractedEntities } from "@consentiq/shared";

type Item = {
  id: string;
  item_id: string;
  raw_number: string | null;
  raw_text: string;
  page: number | null;
  bbox: number[] | null;
  extracted: ExtractedEntities;
  ordering: number;
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
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onSave={(t) => saveItem(item.id, t)} />
        ))}
      </section>
    </div>
  );
}

function ItemCard({
  item,
  onSave,
}: {
  item: Item;
  onSave: (raw_text: string) => Promise<void>;
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
      <header className="flex items-baseline justify-between mb-3">
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
    </article>
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
