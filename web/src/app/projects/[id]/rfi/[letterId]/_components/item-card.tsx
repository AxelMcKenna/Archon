"use client";

import { useState } from "react";
import type { Item } from "../types";
import { Attachments } from "./attachments";
import { Classification } from "./classification";
import { DraftBlock } from "./draft-block";
import { Facets } from "./facets";
import { SuggestedFix } from "./suggested-fix";

export function ItemCard({
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
        className="w-full rounded-sm border border-ink-700/10 px-3 py-2 text-sm leading-relaxed"
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
