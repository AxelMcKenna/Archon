import Link from "next/link";
import { notFound } from "next/navigation";
import { taxonomy } from "@arro/shared";
import { getSupabaseServer } from "@/lib/supabase/server";
import { UploadDrawingPanel } from "@/app/plans/upload-drawing-panel";
import { UploadSpecInline } from "@/app/plans/upload-spec-inline";
import { PlanReview } from "@/app/plans/plan-review";
import { CadReview } from "@/app/plans/cad-review";
import { SpecReview } from "@/app/plans/spec-review";
import { DeleteRowButton } from "@/app/plans/delete-row-button";
import { DeleteSpecButton } from "@/app/plans/delete-spec-button";
import { CoordinationPanel } from "@/app/plans/coordination-panel";
import { DrawingsSubnav } from "@/components/drawings-subnav";
import { effectiveStatus } from "@/lib/job-status";

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

type SpecRow = {
  format: "spec";
  id: string;
  project_id: string;
  filename: string;
  status: string;
  doc_kind: string | null;
  processing_ms: number | null;
  flags_count: number | null;
  analysis: {
    flags?: { severity: string }[];
    extractor_version?: string;
  } | null;
  created_at: string;
  projects: { address: string; bca: string; project_type: string } | null;
};

type Row = PdfRow | CadRow | SpecRow;

export default async function ProjectDrawings({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string; cad?: string; spec?: string }>;
}) {
  const { id: projectId } = await params;
  const { plan: planId, cad: cadId, spec: specId } = await searchParams;
  const supabase = await getSupabaseServer();

  const { data: project } = await supabase
    .from("projects")
    .select("id, address, bca, project_type")
    .eq("id", projectId)
    .single();
  if (!project) notFound();

  const [
    { data: plansRaw },
    { data: cadsRaw },
    { data: specsRaw },
    { data: coordFlagsRaw },
    { data: coordRunRaw },
  ] = await Promise.all([
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
    supabase
      .from("spec_documents")
      .select(
        "id, project_id, filename, status, doc_kind, processing_ms, flags_count, analysis, created_at, " +
          "projects(address, bca, project_type)",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_coordination_flags")
      .select(
        "id, category, severity, confidence, area, reason, recommended_action, rule, tier, citations",
      )
      .eq("project_id", projectId),
    supabase
      .from("project_coordination_runs")
      .select("ran_at, flags_count")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  // Drawings uploaded from the value-engineering page are stored without an
  // RFI analysis (status 'uploaded'). They belong to the VE page only, so the
  // RFI flagger list filters them out.
  const pdfRows: PdfRow[] = ((plansRaw ?? []) as unknown as object[])
    .map((r) => ({ format: "pdf", ...r }) as unknown as PdfRow)
    .filter((r) => r.status !== "uploaded");
  const cadRows: CadRow[] = ((cadsRaw ?? []) as unknown as object[])
    .map((r) => ({ format: "dxf", ...r }) as unknown as CadRow)
    .filter((r) => r.status !== "uploaded");
  const specRows: SpecRow[] = ((specsRaw ?? []) as unknown as object[]).map(
    (r) => ({ format: "spec", ...r }) as unknown as SpecRow,
  );
  const rows: Row[] = [...pdfRows, ...cadRows, ...specRows].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  // Coordination compares analysed drawings + analysed specs (mirrors the
  // engine's gather). cad rows don't contribute claims yet, so they're excluded.
  const coordinationDocCount =
    pdfRows.filter((r) => r.status === "analysed").length +
    specRows.filter((r) => r.status === "analysed").length;
  const coordinationFlags = (coordFlagsRaw ?? []) as unknown as Parameters<
    typeof CoordinationPanel
  >[0]["flags"];
  const coordinationRun = (coordRunRaw ?? null) as Parameters<
    typeof CoordinationPanel
  >[0]["run"];

  const selected: Row | null = cadId
    ? cadRows.find((c) => c.id === cadId) ?? null
    : specId
      ? specRows.find((s) => s.id === specId) ?? null
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
    <>
      <DrawingsSubnav projectId={projectId} />
      <div className="max-w-[1700px] mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Pre-flight
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">RFI flagger</h1>
        <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
          Pre-flight your consent set against likely council RFIs before
          lodgement. Drop in a building plan or CAD drawing for flagged redlines,
          or a written specification / product document to check product
          assurance, unresolved selections, and specified systems.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <UploadDrawingPanel projects={projectsForUpload} />
        <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
            Analyse a specification
          </h2>
          <UploadSpecInline projects={projectsForUpload} docKind="spec" />
        </section>
        <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
            Analyse a material / product sheet
          </h2>
          <UploadSpecInline projects={projectsForUpload} docKind="material" />
        </section>
      </div>

      <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Documents ({rows.length})
        </h2>
        <RowsList rows={rows} active={selected?.id} projectId={projectId} />
      </section>

      <CoordinationPanel
        projectId={projectId}
        flags={coordinationFlags}
        run={coordinationRun}
        documentCount={coordinationDocCount}
      />

      {selected && (
        <section className="space-y-4 pt-8 border-t border-ink-200/70">
          <SelectedHeader row={selected} projectId={projectId} />
          {selected.format === "pdf" ? (
            <PlanReview
              plan={selected as unknown as Parameters<typeof PlanReview>[0]["plan"]}
            />
          ) : selected.format === "spec" ? (
            <SpecReview
              spec={selected as unknown as Parameters<typeof SpecReview>[0]["spec"]}
            />
          ) : (
            <CadReview
              cad={selected as unknown as Parameters<typeof CadReview>[0]["cad"]}
            />
          )}
        </section>
      )}
      </div>
    </>
  );
}

const FORMAT_LABEL: Record<Row["format"], string> = {
  pdf: "PDF",
  dxf: "DXF",
  spec: "SPEC",
};

// Material datasheets share the "spec" format (same table) but get their own
// badge so the list and the selected-row header agree.
function rowLabel(r: Row): string {
  if (r.format === "spec" && r.doc_kind === "material") return "MATERIAL";
  return FORMAT_LABEL[r.format];
}

function rowQuery(r: Row): { plan: string } | { cad: string } | { spec: string } {
  if (r.format === "pdf") return { plan: r.id };
  if (r.format === "dxf") return { cad: r.id };
  return { spec: r.id };
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
        Nothing analysed yet - upload a drawing or specification above.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-ink-200/70 rounded-sm bg-surface-raised shadow-depth overflow-hidden">
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
        const displayStatus = effectiveStatus(r.status, r.created_at);
        const stalled = displayStatus === "stalled";
        const subtitle =
          r.status === "analysed"
            ? `${flags.length} flags (${must} must / ${nice} nice)${
                r.format === "dxf" ? ` · ${fixable} fixable` : ""
              }`
            : r.format === "spec" && r.status === "no_text_layer"
              ? "No text layer - re-upload a text PDF"
              : stalled
                ? "Analysis stalled - re-upload to retry"
                : displayStatus;
        const href = {
          pathname: `/projects/${projectId}/drawings`,
          query: rowQuery(r),
        };
        return (
          <li
            key={`${r.format}-${r.id}`}
            className={`flex items-center gap-2 pr-3 transition-colors ${
              isActive ? "bg-ink-50" : "hover:bg-ink-50"
            }`}
          >
            <Link
              href={href}
              className="flex-1 min-w-0 flex items-center justify-between px-5 py-3.5 text-sm gap-4 cursor-pointer"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink-900 truncate">
                  <span className="inline-block mr-2 text-[10px] font-semibold tracking-wide rounded-sm bg-ink-100 text-ink-700 px-1.5 py-0.5">
                    {rowLabel(r)}
                  </span>
                  {r.filename}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {bcaName} · {new Date(r.created_at).toLocaleDateString()} ·{" "}
                  {subtitle}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  r.status === "analysed"
                    ? must > 0
                      ? "bg-red-100 text-red-800"
                      : "bg-emerald-100 text-emerald-800"
                    : displayStatus === "failed"
                      ? "bg-red-100 text-red-800"
                      : stalled
                        ? "bg-amber-100 text-amber-800"
                        : "bg-ink-100 text-ink-700"
                }`}
              >
                {displayStatus}
              </span>
            </Link>
            {r.format === "spec" ? (
              <DeleteSpecButton id={r.id} filename={r.filename} projectId={projectId} />
            ) : (
              <DeleteRowButton format={r.format} id={r.id} filename={r.filename} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SelectedHeader({ row, projectId }: { row: Row; projectId: string }) {
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-2">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          {rowLabel(row)}
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-ink-900">{row.filename}</h2>
      </div>
      <Link
        href={`/projects/${projectId}/drawings`}
        className="text-sm font-medium text-ink-500 hover:text-ink-900 transition-colors cursor-pointer"
      >
        Close →
      </Link>
    </div>
  );
}
