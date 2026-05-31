import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ValueEngineeringSection } from "@/app/plans/value-engineering-section";
import { DrawingsSubnav } from "@/components/drawings-subnav";

export const dynamic = "force-dynamic";

type DrawingRow = { id: string; filename: string; status: string };

export default async function ProjectValueEngineering({
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
      .select("id, filename, status, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("cad_uploads")
      .select("id, filename, status, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);

  const pdfRows = (plansRaw ?? []) as DrawingRow[];
  const cadRows = (cadsRaw ?? []) as DrawingRow[];

  return (
    <>
      <DrawingsSubnav projectId={projectId} />
      <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
        <header className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
            Cost optimisation
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Value engineering
          </h1>
          <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
            Surface over-specified materials and code-compliant cheaper
            alternatives. Runs independently of the RFI flagger — pick a drawing
            you&apos;ve already uploaded, or upload a new PDF or DXF.
          </p>
        </header>

        <ValueEngineeringSection
          drawings={[
              ...pdfRows.map((p) => ({
                id: p.id,
                filename: p.filename,
                status: p.status,
                kind: "pdf" as const,
              })),
              ...cadRows.map((c) => ({
                id: c.id,
                filename: c.filename,
                status: c.status,
                kind: "dxf" as const,
              })),
            ]}
            project={{
              id: project.id,
              address: project.address,
              bca: project.bca,
              project_type: project.project_type,
            }}
            initialId={cadId ?? planId}
          />
      </div>
    </>
  );
}
