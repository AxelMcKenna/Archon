"use client";

import { useState } from "react";
import { CompletionCheckbox } from "./completion-checkbox";

interface ManualDocumentFormState {
  title: string;
  whyRequired: string;
  referenceUrl: string;
  completed: boolean;
}

interface ManualDocumentFormProps {
  onCancel: () => void;
  onSubmit: (values: ManualDocumentFormState, file: File | null) => void;
}

const INITIAL_FORM: ManualDocumentFormState = {
  title: "",
  whyRequired: "",
  referenceUrl: "",
  completed: false,
};

export function ManualDocumentForm({ onCancel, onSubmit }: ManualDocumentFormProps) {
  const [formState, setFormState] = useState(INITIAL_FORM);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function updateField<K extends keyof ManualDocumentFormState>(
    key: K,
    value: ManualDocumentFormState[K],
  ) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit() {
    if (!formState.title.trim()) {
      setFormError("Document name is required.");
      return;
    }

    onSubmit(formState, formFile);
    setFormState(INITIAL_FORM);
    setFormFile(null);
    setFormError(null);
  }

  function handleCancel() {
    setFormState(INITIAL_FORM);
    setFormFile(null);
    setFormError(null);
    onCancel();
  }

  return (
    <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-900">Document Name</label>
            <input
              value={formState.title}
              onChange={(event) => updateField("title", event.currentTarget.value)}
              placeholder="Arboricultural Assessment"
              className="mt-2 w-full rounded-xl border border-ink-700/10 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-900">Why It Is Required</label>
            <textarea
              value={formState.whyRequired}
              onChange={(event) => updateField("whyRequired", event.currentTarget.value)}
              rows={5}
              placeholder="Explain why council may require this document and what it supports."
              className="mt-2 w-full rounded-xl border border-ink-700/10 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-900">
              Open Guidance / Template Link
            </label>
            <input
              type="url"
              value={formState.referenceUrl}
              onChange={(event) => updateField("referenceUrl", event.currentTarget.value)}
              placeholder="https://..."
              className="mt-2 w-full rounded-xl border border-ink-700/10 px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </div>
        </div>

        <div className="space-y-4">
          <CompletionCheckbox
            checked={formState.completed}
            onChange={(checked) => updateField("completed", checked)}
            label={formState.completed ? "Complete" : "Mark as complete"}
            muted
          />
          <div className="rounded-xl border border-ink-700/10 bg-ink-50 p-4">
            <label className="text-sm font-medium text-ink-900">Upload Document / File</label>
            <input
              type="file"
              onChange={(event) => setFormFile(event.currentTarget.files?.[0] ?? null)}
              className="mt-3 block w-full text-sm text-ink-600 file:mr-4 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-ink-700"
            />
            <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-ink-500">
              {formFile ? formFile.name : "No file selected"}
            </div>
            {formFile && (
              <button
                onClick={() => setFormFile(null)}
                className="mt-3 inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Remove Selected File
              </button>
            )}
          </div>
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {formError}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSubmit}
              className="inline-flex items-center rounded-xl bg-ink-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-ink-700"
            >
              Add Document
            </button>
            <button
              onClick={handleCancel}
              className="inline-flex items-center rounded-xl border border-ink-700/10 bg-white px-4 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
