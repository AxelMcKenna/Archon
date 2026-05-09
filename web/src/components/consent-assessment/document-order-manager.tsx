"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConsentDocument } from "./model";
import { isManualDocument } from "./model";

interface DocumentOrderManagerProps {
  documents: ConsentDocument[];
  onCancel: () => void;
  onConfirm: (documentOrder: string[]) => void;
}

export function DocumentOrderManager({
  documents,
  onCancel,
  onConfirm,
}: DocumentOrderManagerProps) {
  const [draftOrder, setDraftOrder] = useState<string[]>([]);

  useEffect(() => {
    setDraftOrder(documents.map((document) => document.id));
  }, [documents]);

  const reorderedDocuments = useMemo(
    () =>
      draftOrder
        .map((id) => documents.find((document) => document.id === id))
        .filter((document): document is ConsentDocument => Boolean(document)),
    [documents, draftOrder],
  );

  function moveDraftDocument(documentId: string, direction: "up" | "down") {
    setDraftOrder((current) => {
      const index = current.indexOf(documentId);
      if (index === -1) {
        return current;
      }

      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function handleConfirmOrder() {
    onConfirm(draftOrder);
  }

  return (
    <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-900">Reorder Documents</h3>
          <p className="mt-1 text-sm text-ink-500">
            Adjust the checklist order, then confirm to save it for this project.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleConfirmOrder}
            className="inline-flex items-center rounded-xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-ink-700"
          >
            Confirm Order
          </button>
          <button
            onClick={onCancel}
            className="inline-flex items-center rounded-xl border border-ink-700/10 bg-white px-4 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Cancel
          </button>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {reorderedDocuments.map((document, index) => (
          <div
            key={document.id}
            className="flex items-center justify-between rounded-xl border border-ink-700/10 bg-ink-50 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink-900">
                  {index + 1}. {document.title}
                </span>
                {isManualDocument(document) && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Manual
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-ink-500">{document.whyRequired}</p>
            </div>
            <div className="ml-4 flex gap-2">
              <button
                onClick={() => moveDraftDocument(document.id, "up")}
                disabled={index === 0}
                className="rounded-lg border border-ink-700/10 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400"
              >
                Up
              </button>
              <button
                onClick={() => moveDraftDocument(document.id, "down")}
                disabled={index === reorderedDocuments.length - 1}
                className="rounded-lg border border-ink-700/10 bg-white px-3 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400"
              >
                Down
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
