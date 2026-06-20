"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { AiThinking } from "@/components/ai-thinking";
import { RfiEngineLog } from "@/components/rfi-engine-log";
import { streamIngest, type IngestStep } from "@/lib/ingest-stream";

type Project = { id: string; address: string; bca: string };

type Kind = "drawing" | "spec" | "material";

const BOXES: { kind: Kind; title: string; hint: string; accept: string }[] = [
  {
    kind: "drawing",
    title: "Drawings",
    hint: "PDF / JPG / PNG / DXF",
    accept: "application/pdf,image/png,image/jpeg,.dxf",
  },
  {
    kind: "spec",
    title: "Specifications",
    hint: "Written spec PDFs",
    accept: "application/pdf",
  },
  {
    kind: "material",
    title: "Material / product sheets",
    hint: "BRANZ, CodeMark, datasheets",
    accept: "application/pdf",
  },
];

function isDxf(name: string): boolean {
  return name.toLowerCase().endsWith(".dxf");
}

export function BatchUploadPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [staged, setStaged] = useState<Record<Kind, File[]>>({
    drawing: [],
    spec: [],
    material: [],
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(
    null,
  );
  // Live engine log for the drawing currently streaming (specs/materials are
  // deterministic and don't stream).
  const [steps, setSteps] = useState<IngestStep[]>([]);
  const [logDone, setLogDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = staged.drawing.length + staged.spec.length + staged.material.length;

  function addFiles(kind: Kind, files: FileList | null) {
    if (!files?.length) return;
    setStaged((s) => ({ ...s, [kind]: [...s[kind], ...Array.from(files)] }));
  }
  function removeFile(kind: Kind, idx: number) {
    setStaged((s) => ({ ...s, [kind]: s[kind].filter((_, i) => i !== idx) }));
  }

  // Upload one file straight to storage via a signed URL, then analyse it.
  async function processOne(kind: Kind, file: File): Promise<void> {
    const dxf = kind === "drawing" && isDxf(file.name);
    const contentType =
      file.type || (dxf ? "application/dxf" : "application/octet-stream");

    const urlEndpoint =
      kind === "drawing"
        ? dxf
          ? "/cad/upload-url"
          : "/plans/upload-url"
        : "/specs/upload-url";

    const signed = await apiFetch<{
      plan_id?: string;
      cad_id?: string;
      spec_id?: string;
      bucket: string;
      path: string;
      token: string;
    }>(urlEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        filename: file.name,
        ...(dxf ? {} : { content_type: contentType }),
      }),
    });

    const supabase = getSupabaseBrowser();
    const { error: upErr } = await supabase.storage
      .from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, file, { contentType });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const idField = dxf ? "cad_id" : kind === "drawing" ? "plan_id" : "spec_id";
    const idValue = dxf ? signed.cad_id : kind === "drawing" ? signed.plan_id : signed.spec_id;
    const ingestBody = {
      project_id: projectId,
      [idField]: idValue,
      storage_path: signed.path,
      filename: file.name,
      ...(dxf ? {} : { content_type: contentType }),
      analyse: true,
      ...(kind === "material" ? { doc_kind: "material" } : {}),
      ...(kind === "spec" ? { doc_kind: "spec" } : {}),
    };

    // Specs / materials are deterministic and fast - one blocking call, no log.
    if (kind !== "drawing") {
      setSteps([]);
      await apiFetch("/specs/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ingestBody),
      });
      return;
    }

    // Drawings: stream the engine's per-sheet progress as a live log. Fall back
    // to the blocking endpoint only if the stream never opens (a mid-analysis
    // error frame is a real failure, not a reason to silently re-run the work).
    setSteps([]);
    setLogDone(false);
    const streamEndpoint = dxf ? "/cad/ingest-stream" : "/plans/ingest-stream";
    const byId = new Map<number, IngestStep>();
    const order: number[] = [];
    let sawEvent = false;
    try {
      for await (const ev of streamIngest(streamEndpoint, ingestBody)) {
        sawEvent = true;
        if (ev.type === "step") {
          if (!byId.has(ev.id)) order.push(ev.id);
          byId.set(ev.id, {
            id: ev.id,
            label: ev.label,
            status: ev.status,
            detail: ev.detail,
          });
          setSteps(order.map((sid) => byId.get(sid)!));
        } else if (ev.type === "result") {
          setLogDone(true);
        } else if (ev.type === "error") {
          throw new Error(ev.error || "RFI analysis failed");
        }
      }
    } catch (streamErr) {
      if (sawEvent) throw streamErr;
      await apiFetch(dxf ? "/cad/ingest" : "/plans/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ingestBody),
      });
    }
  }

  async function runAll() {
    if (!total) return;
    setBusy(true);
    setError(null);
    setSteps([]);
    setLogDone(false);
    const queue: { kind: Kind; file: File }[] = [
      ...staged.drawing.map((file) => ({ kind: "drawing" as const, file })),
      ...staged.spec.map((file) => ({ kind: "spec" as const, file })),
      ...staged.material.map((file) => ({ kind: "material" as const, file })),
    ];
    try {
      for (let i = 0; i < queue.length; i++) {
        setProgress({ done: i, total: queue.length, current: queue[i].file.name });
        await processOne(queue[i].kind, queue[i].file);
      }
      setProgress({ done: queue.length, total: queue.length, current: "" });
      setStaged({ drawing: [], spec: [], material: [] });
      // Land on a clean project view so the freshly-built summary is front and centre.
      router.push(`/projects/${projectId}/drawings`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Upload &amp; analyse
        </h2>
        <p className="text-xs text-ink-500">
          Drop files into each box, then run them together.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {BOXES.map((box) => (
          <div
            key={box.kind}
            className="rounded-sm border border-dashed border-ink-700/20 p-4 space-y-3"
          >
            <div>
              <p className="text-sm font-medium text-ink-900">{box.title}</p>
              <p className="text-xs text-ink-500">{box.hint}</p>
            </div>
            <input
              type="file"
              multiple
              accept={box.accept}
              disabled={busy}
              onChange={(e) => {
                addFiles(box.kind, e.target.files);
                e.target.value = "";
              }}
              className="block w-full text-xs"
            />
            {staged[box.kind].length > 0 && (
              <ul className="space-y-1">
                {staged[box.kind].map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 text-xs bg-ink-50 rounded-sm px-2 py-1"
                  >
                    <span className="truncate">{f.name}</span>
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => removeFile(box.kind, i)}
                        className="text-ink-400 hover:text-red-600 shrink-0"
                        aria-label={`Remove ${f.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={runAll}
          disabled={!total || busy}
          className="rounded-sm bg-ink-900 text-white px-5 py-2.5 text-sm font-medium shadow-depth disabled:opacity-50 cursor-pointer hover:bg-ink-700 transition-colors"
        >
          {busy ? (
            <AiThinking label="Analysing" variant="button" />
          ) : (
            `Run all (${total} file${total === 1 ? "" : "s"})`
          )}
        </button>
        {busy && progress && (
          <span className="text-sm text-ink-600">
            {progress.done} of {progress.total} done
            {progress.current ? ` · analysing ${progress.current}` : ""}
          </span>
        )}
        {!total && !busy && (
          <span className="text-sm text-ink-400">No files staged yet.</span>
        )}
      </div>

      {busy &&
        (steps.length > 0 ? (
          <RfiEngineLog
            steps={steps}
            title={
              progress?.current
                ? `RFI engine · ${progress.current}`
                : "RFI engine"
            }
            hint="Reading the drawing sheet by sheet against the NZ Building Code corpus."
            done={logDone}
          />
        ) : (
          <AiThinking
            label="Running the RFI engine"
            hint="Specs and material sheets are checked, then cross-referenced. Drawings stream their per-sheet progress as they run."
            variant="block"
          />
        ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!total && !busy && (
        <p className="text-xs text-ink-400">
          Tip: you can stage several files in each box and run the whole set in
          one go. Need a project first?{" "}
          <Link href="/projects/new" className="underline">
            Create one
          </Link>
          .
        </p>
      )}
    </section>
  );
}
