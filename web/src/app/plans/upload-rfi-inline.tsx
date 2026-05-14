"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiUpload } from "@/lib/api";
import { taxonomy } from "@atlas/shared";
import { AiThinking } from "@/components/ai-thinking";

type Project = { id: string; address: string; bca: string; project_type: string };

type PlanOption = {
  id: string;
  format: "pdf" | "dxf";
  project_id: string;
  filename: string;
  status: string;
  created_at: string;
};

type ExtractResponse = {
  letter_id: string;
  items_count: number;
};

type AnalyseResponse = {
  plan_id?: string;
  cad_id?: string;
};

function isDxf(name: string): boolean {
  return name.toLowerCase().endsWith(".dxf");
}

export function UploadRfiInline({
  projects,
  plans,
}: {
  projects: Project[];
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [planMode, setPlanMode] = useState<"existing" | "upload">("existing");
  const [planId, setPlanId] = useState<string>("");
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [rfiFile, setRfiFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const projectPlans = useMemo(
    () => plans.filter((p) => p.project_id === projectId),
    [plans, projectId],
  );

  const effectivePlanMode =
    projectPlans.length === 0 ? "upload" : planMode;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !rfiFile) return;
    if (effectivePlanMode === "upload" && !planFile) {
      setError("Attach the submitted plan or pick an existing one.");
      return;
    }
    if (effectivePlanMode === "existing" && !planId && projectPlans.length) {
      setError("Pick which plan the RFI relates to.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (effectivePlanMode === "upload" && planFile) {
        setStage("Analysing submitted plan…");
        const fd = new FormData();
        fd.append("file", planFile);
        fd.append("project_id", project.id);
        const endpoint = isDxf(planFile.name) ? "/cad" : "/plans";
        await apiUpload<AnalyseResponse>(endpoint, fd);
      }

      setStage("Extracting RFI letter…");
      const fd = new FormData();
      fd.append("file", rfiFile);
      fd.append("project_id", project.id);
      fd.append("bca", project.bca);
      if (effectivePlanMode === "existing" && planId) {
        const picked = projectPlans.find((p) => p.id === planId);
        if (picked?.format === "dxf") {
          fd.append("cad_upload_id", planId);
        } else if (picked?.format === "pdf") {
          fd.append("plan_upload_id", planId);
        }
      }
      const res = await apiUpload<ExtractResponse>("/extract", fd);

      let pipelineFailed = false;
      if (res.items_count > 0) {
        setStage(`Matching ${res.items_count} items to plan…`);
        try {
          await apiFetch(`/classify/${res.letter_id}/ground`, { method: "POST" });
        } catch (e) {
          console.warn("grounding pipeline failed", e);
          pipelineFailed = true;
        }
      }

      const qs = pipelineFailed ? "&pipeline=failed" : "";
      router.push(`/projects/${project.id}/rfis?letter=${res.letter_id}${qs}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "RFI processing failed");
      setBusy(false);
      setStage("");
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

  return (
    <form
      onSubmit={submit}
      className="rounded-sm border border-dashed border-ink-700/20 p-5 space-y-4 bg-ink-700/[0.015]"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-500 block mb-1">Project</span>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPlanId("");
            }}
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
        <label className="block text-sm">
          <span className="text-ink-500 block mb-1">RFI letter (PDF / JPG / PNG, ≤25MB)</span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => setRfiFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-ink-500 text-sm">Submitted plan</span>
        {projectPlans.length > 0 && (
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="planMode"
                checked={planMode === "existing"}
                onChange={() => setPlanMode("existing")}
              />
              <span>Use an analysed plan ({projectPlans.length})</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="planMode"
                checked={planMode === "upload"}
                onChange={() => setPlanMode("upload")}
              />
              <span>Upload a new plan</span>
            </label>
          </div>
        )}

        {effectivePlanMode === "existing" && projectPlans.length > 0 ? (
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="w-full rounded-sm border border-ink-700/10 px-2 py-2 text-sm"
          >
            <option value="">— pick the plan this RFI is about —</option>
            {projectPlans.map((p) => (
              <option key={`${p.format}-${p.id}`} value={p.id}>
                [{p.format.toUpperCase()}] {p.filename} ·{" "}
                {new Date(p.created_at).toLocaleDateString()} · {p.status}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,.dxf"
            onChange={(e) => setPlanFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-ink-500">
          We&rsquo;ll match each RFI item to the relevant plan location and draft a
          suggested response you can edit.
        </p>
        <button
          disabled={!rfiFile || busy}
          className="rounded-sm bg-ink-900 text-white px-4 py-2 text-sm font-medium shadow-depth disabled:opacity-50 cursor-pointer hover:bg-ink-700 transition-colors"
        >
          {busy ? (
            <AiThinking label={stage || "Processing"} variant="button" />
          ) : (
            "Process RFI"
          )}
        </button>
      </div>

      {busy && (
        <AiThinking
          label={stage || "Working through the RFI pipeline"}
          hint="Each step uses AI: classify items, match to plan flags, then draft responses."
          variant="block"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
