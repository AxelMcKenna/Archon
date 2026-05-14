"use client";

import { useEffect, useState } from "react";
import { AiBadge, AiThinking } from "@/components/ai-thinking";
import type { Response } from "../types";

export function DraftBlock({
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
        <h4 className="text-sm font-semibold inline-flex items-center gap-2">
          Response draft
          <AiBadge label="AI draft" />
        </h4>
        <div className="flex gap-2">
          <button
            onClick={generate}
            disabled={busy}
            className="text-xs rounded-sm border border-ink-700/20 px-2 py-1 hover:bg-ink-700/5 disabled:opacity-50"
          >
            {busy ? (
              <AiThinking label="Drafting" variant="button" />
            ) : response ? (
              "Regenerate"
            ) : (
              "Generate draft"
            )}
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
            className="w-full rounded-sm border border-ink-700/10 px-3 py-2 text-sm leading-relaxed"
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
