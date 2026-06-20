"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { taxonomy } from "@arro/shared";
import { AiThinking } from "@/components/ai-thinking";

type Project = { id: string; address: string; bca: string; project_type: string };

type IngestResponse = {
  spec_id: string;
  flags_count: number;
  processing_ms: number;
  status: string;
  analysed: boolean;
};

export function UploadSpecInline({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !project) return;
    setBusy(true);
    setError(null);
    try {
      const contentType = file.type || "application/pdf";

      // Direct-to-storage upload via a backend-issued signed URL (sidesteps the
      // Vercel proxy body limit); only the small JSON calls cross the proxy.
      const signed = await apiFetch<{
        spec_id: string;
        bucket: string;
        path: string;
        token: string;
      }>("/specs/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          filename: file.name,
          content_type: contentType,
        }),
      });

      const supabase = getSupabaseBrowser();
      const { error: uploadError } = await supabase.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // The spec flagger is deterministic and fast, so a single blocking call
      // is enough — no progress stream needed.
      const res = await apiFetch<IngestResponse>("/specs/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          spec_id: signed.spec_id,
          storage_path: signed.path,
          filename: file.name,
          content_type: contentType,
          analyse: true,
        }),
      });

      router.push(`/projects/${project.id}/drawings?spec=${res.spec_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spec analysis failed");
    } finally {
      setBusy(false);
    }
  }

  if (!projects.length) {
    return (
      <div className="rounded-sm border border-ink-700/10 p-5 text-sm">
        <p className="mb-2">Create a project first.</p>
        <Link
          href="/projects/new"
          className="rounded-sm bg-ink-900 text-white px-4 py-2 text-xs font-medium inline-block"
        >
          Create a project
        </Link>
      </div>
    );
  }

  const showProjectPicker = projects.length > 1;

  return (
    <form
      onSubmit={submit}
      className={`rounded-sm border border-dashed border-ink-700/20 p-5 grid grid-cols-1 gap-3 items-end ${
        showProjectPicker ? "sm:grid-cols-[1fr_2fr_auto]" : "sm:grid-cols-[1fr_auto]"
      }`}
    >
      {showProjectPicker && (
        <label className="block text-sm">
          <span className="text-ink-500 block mb-1">Project</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-sm border border-ink-700/10 px-2 py-2"
          >
            {projects.map((p) => {
              const bca = taxonomy.bcas.find((b) => b.id === p.bca)?.name ?? p.bca;
              return (
                <option key={p.id} value={p.id}>
                  {p.address} ({bca})
                </option>
              );
            })}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="text-ink-500 block mb-1">
          Specification or product document (PDF, ≤50MB)
        </span>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </label>
      <button
        disabled={!file || busy}
        className="rounded-sm bg-ink-900 text-white px-4 py-2 text-sm font-medium shadow-depth disabled:opacity-50 sm:self-end cursor-pointer hover:bg-ink-700 transition-colors"
      >
        {busy ? (
          <AiThinking label="Analysing" variant="button" />
        ) : (
          "Analyse spec"
        )}
      </button>
      {busy && (
        <div className="sm:col-span-full">
          <AiThinking
            label="Reading the specification"
            hint="Checking product assurance, placeholder language, specified systems, and standards currency."
            variant="block"
          />
        </div>
      )}
      {error && <p className="sm:col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
