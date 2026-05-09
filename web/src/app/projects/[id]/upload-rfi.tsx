"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiUpload } from "@/lib/api";

type ExtractResponse = {
  letter_id: string;
  storage_path: string;
  extractor: "pdfplumber" | "claude-vision";
  items_count: number;
  processing_ms: number;
  cost_usd: number;
};

export function UploadRfi({ projectId, bca }: { projectId: string; bca: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      fd.append("bca", bca);
      const res = await apiUpload<ExtractResponse>("/extract", fd);
      router.push(`/projects/${projectId}/rfi/${res.letter_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-dashed border-ink-700/20 p-5">
      <p className="font-medium mb-2">Upload an RFI letter</p>
      <p className="text-sm text-ink-500 mb-4">PDF, JPG, or PNG. Max 25MB.</p>
      <input
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block mb-4 text-sm"
      />
      <button
        disabled={!file || busy}
        className="rounded-lg bg-ink-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Extracting…" : "Extract"}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}
