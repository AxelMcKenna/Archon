import Link from "next/link";
import { notFound } from "next/navigation";
import { taxonomy } from "@consentiq/shared";
import { getSupabaseServer } from "@/lib/supabase/server";
import { UploadPlanInline } from "@/app/plans/upload-plan-inline";
import { PlanReview } from "@/app/plans/plan-review";
import { CadReview } from "@/app/plans/cad-review";
import { DeleteRowButton } from "@/app/plans/delete-row-button";

export const dynamic = "force-dynamic";

type PdfRow = {
  format: "pdf";
  id: string;
  project_id: string;
  filename: string;
  status: string;
  analyser_version: string | null;
  analysis_version: string | null;
  prompt_version: string | null;
  processing_ms: number | null;
  cost_usd: number | null;
  analysis: {
    flags?: { severity: string }[];
    summary?: string;
    pages_analysed?: number;
    taxonomy_version?: string;
  } | null;
  created_at: string;
  projects: { address: string; bca: string; project_type: string } | null;
};

type CadRow = {
  format: "dxf";
  id: string;
  project_id: string;
  filename: string;
  status: string;
  processing_ms: number | null;
  analysis: {
    flags?: { severity: string; proposed_change?: unknown }[];
    views?: { name: string; width: number; height: number }[];
    entity_count?: number;
  } | null;
  created_at: string;
  projects: { address: string; bca: string; project_type: string } | null;
};

type Row = PdfRow | CadRow;

export default async function ProjectDrawings({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string; cad?: string }>;
}) {
  const { id: projectId } = await params;
  const { plan: planId, cad: cadId } = await searchParams;
  const supabase = await getSupabaseServer();

  const { data: project } = await supabase
    .from("projects")
    .select("id, address, bca, project_type")
    .eq("id", projectId)
    .single();
  if (!project) notFound();

  const [{ data: plansRaw }, { data: cadsRaw }] = await Promise.all([
    supabase
      .from("plan_uploads")
      .select(
        "id, project_id, filename, status, analyser_version, analysis_version, prompt_version, " +
          "processing_ms, cost_usd, analysis, created_at, " +
          "projects(address, bca, project_type)",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("cad_uploads")
      .select(
        "id, project_id, filename, status, processing_ms, analysis, created_at, " +
          "projects(address, bca, project_type)",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);

  const pdfRows: PdfRow[] = ((plansRaw ?? []) as unknown as object[]).map(
    (r) => ({ format: "pdf", ...r }) as unknown as PdfRow,
  );
  const cadRows: CadRow[] = ((cadsRaw ?? []) as unknown as object[]).map(
    (r) => ({ format: "dxf", ...r }) as unknown as CadRow,
  );
  const rows: Row[] = [...pdfRows, ...cadRows].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  const selected: Row | null = cadId
    ? cadRows.find((c) => c.id === cadId) ?? null
    : planId
      ? pdfRows.find((p) => p.id === planId) ?? null
      : null;

  // Single-project mode for the upload form: pre-locked to this project.
  const projectsForUpload = [
    {
      id: project.id,
      address: project.address,
      bca: project.bca,
      project_type: project.project_type,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Drawings</h1>
        <p className="text-sm text-ink-500 mt-1">
          Pre-flight a building plan or CAD drawing against likely council RFIs
          before lodgement. Upload a PDF for flagged redlines, or a DXF for
          flagged redlines + one-click geometry fixes.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Analyse a drawing
        </h2>
        <UploadPlanInline projects={projectsForUpload} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Drawings ({rows.length})
        </h2>
        <RowsList rows={rows} active={selected?.id} projectId={projectId} />
      </section>

      {selected && (
        <section className="space-y-3 pt-6 border-t border-ink-700/10">
          <SelectedHeader row={selected} projectId={projectId} />
          {selected.format === "pdf" ? (
            <PlanReview
              plan={selected as unknown as Parameters<typeof PlanReview>[0]["plan"]}
            />
          ) : (
            <CadReview
              cad={selected as unknown as Parameters<typeof CadReview>[0]["cad"]}
            />
          )}
        </section>
      )}
    </div>
  );
}

function RowsList({
  rows,
  active,
  projectId,
}: {
  rows: Row[];
  active?: string;
  projectId: string;
}) {
  if (!rows.length) {
    return (
      <p className="text-sm text-ink-500 italic">
        Nothing analysed yet — upload a drawing above.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-ink-700/10 rounded-sm border border-ink-700/10">
      {rows.map((r) => {
        const bcaName =
          taxonomy.bcas.find((b) => b.id === r.projects?.bca)?.name ?? r.projects?.bca;
        const isActive = r.id === active;
        const flags = r.analysis?.flags ?? [];
        const must = flags.filter((f) => f.severity === "must_resolve").length;
        const nice = flags.length - must;
        const fixable =
          r.format === "dxf"
            ? flags.filter((f) => "proposed_change" in f && f.proposed_change).length
            : 0;
        const href = {
          pathname: `/projects/${projectId}/drawings`,
          query: r.format === "pdf" ? { plan: r.id } : { cad: r.id },
        };
        return (
          <li
            key={`${r.format}-${r.id}`}
            className={`flex items-center gap-2 pr-3 ${
              isActive ? "bg-ink-700/5" : "hover:bg-ink-700/5"
            }`}
          >
            <Link
              href={href}
              className="flex-1 min-w-0 flex items-center justify-between px-4 py-3 text-sm gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">
                  <span className="inline-block mr-2 text-[10px] font-semibold tracking-wide rounded-sm bg-ink-700/10 px-1.5 py-0.5">
                    {r.format.toUpperCase()}
                  </span>
                  {r.filename}
                </p>
                <p className="text-xs text-ink-500">
                  {bcaName} · {new Date(r.created_at).toLocaleDateString()} ·{" "}
                  {r.status === "analysed"
                    ? `${flags.length} flags (${must} must / ${nice} nice)${
                        r.format === "dxf" ? ` · ${fixable} fixable` : ""
                      }`
                    : r.status}
                </p>
              </div>
              <span
                className={`rounded-sm px-2 py-0.5 text-xs ${
                  r.status === "analysed"
                    ? must > 0
                      ? "bg-red-100 text-red-800"
                      : "bg-emerald-100 text-emerald-800"
                    : r.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-ink-700/10"
                }`}
              >
                {r.status}
              </span>
            </Link>
            <DeleteRowButton format={r.format} id={r.id} filename={r.filename} />
          </li>
        );
      })}
    </ul>
  );
}

function SelectedHeader({ row, projectId }: { row: Row; projectId: string }) {
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-2">
      <div>
        <p className="text-xs text-ink-500">{row.format.toUpperCase()}</p>
        <h2 className="text-xl font-semibold">{row.filename}</h2>
      </div>
      <Link
        href={`/projects/${projectId}/drawings`}
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        Close →
      </Link>
    </div>
  );
}
