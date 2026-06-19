"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { taxonomy } from "@arro/shared";
import { AiThinking } from "@/components/ai-thinking";

type Project = { id: string; address: string; bca: string; project_type: string };

type AnalyseResponse = {
  plan_id?: string;
  cad_id?: string;
  flags_count: number;
  processing_ms: number;
  cost_usd?: number;
};

function isDxf(name: string): boolean {
  return name.toLowerCase().endsWith(".dxf");
}

export function UploadPlanInline({
  projects,
  onUploaded,
  analyseRfi = true,
}: {
  projects: Project[];
  // When provided, called with the new drawing instead of redirecting to the
  // RFI drawings page — lets the value-engineering page keep the user in place
  // and select the just-uploaded drawing.
  onUploaded?: (id: string, kind: "pdf" | "dxf") => void;
  // When false, the file is stored but the RFI flagger is NOT run — used by
  // the value-engineering page so VE uploads don't trigger an RFI analysis.
  analyseRfi?: boolean;
}) {
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
      // Direct-to-storage upload: the file goes straight to Supabase Storage
      // over HTTPS via a backend-issued signed URL, sidestepping the Vercel
      // proxy's ~4.5MB serverless body limit. Only small JSON calls
      // (upload-url, ingest) traverse the proxy.
      const dxf = isDxf(file.name);
      const contentType = file.type || (dxf ? "application/dxf" : "application/octet-stream");

      const urlEndpoint = dxf ? "/cad/upload-url" : "/plans/upload-url";
      const signed = await apiFetch<{
        plan_id?: string;
        cad_id?: string;
        bucket: string;
        path: string;
        token: string;
      }>(urlEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          filename: file.name,
          ...(dxf ? {} : { content_type: contentType }),
        }),
      });

      const supabase = getSupabaseBrowser();
      const { error: uploadError } = await supabase.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const uploadedId = dxf ? signed.cad_id : signed.plan_id;
      const ingestEndpoint = dxf ? "/cad/ingest" : "/plans/ingest";
      const res = await apiFetch<AnalyseResponse>(ingestEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          [dxf ? "cad_id" : "plan_id"]: uploadedId,
          storage_path: signed.path,
          filename: file.name,
          ...(dxf ? {} : { content_type: contentType }),
          analyse: analyseRfi,
        }),
      });
      const id = dxf ? res.cad_id : res.plan_id;
      if (onUploaded && id) {
        onUploaded(id, dxf ? "dxf" : "pdf");
        router.refresh();
      } else {
        router.push(
          `/projects/${project.id}/drawings?${dxf ? "cad" : "plan"}=${id}`,
        );
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan analysis failed");
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

  // Project scope is set at the main page (you pick a project before entering
  // its drawings), so the upload form only offers a project picker in the
  // legacy multi-project case — when scoped to one project it's omitted.
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
        <span className="text-ink-500 block mb-1">Building plan (PDF / JPG / PNG / DXF, ≤50MB)</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,.dxf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </label>
      <button
        disabled={!file || busy}
        className="rounded-sm bg-ink-900 text-white px-4 py-2 text-sm font-medium shadow-depth disabled:opacity-50 sm:self-end cursor-pointer hover:bg-ink-700 transition-colors"
      >
        {busy ? (
          <AiThinking label={analyseRfi ? "Analysing" : "Uploading"} variant="button" />
        ) : analyseRfi ? (
          "Analyse plan"
        ) : (
          "Upload drawing"
        )}
      </button>
      {busy && (
        <div className="sm:col-span-full">
          <AiThinking
            label={
              !analyseRfi
                ? "Uploading drawing"
                : file && isDxf(file.name)
                  ? "Analysing CAD geometry"
                  : "Analysing drawing"
            }
            hint={
              analyseRfi
                ? "Detecting flags and proposed redlines against the document rules corpus."
                : "Storing your drawing for value engineering."
            }
            variant="block"
          />
        </div>
      )}
      {error && <p className="sm:col-span-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
