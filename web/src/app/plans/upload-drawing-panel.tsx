import { UploadPlanInline } from "@/app/plans/upload-plan-inline";

type Project = { id: string; address: string; bca: string; project_type: string };

/**
 * Shared upload container so the RFI flagger page and the value-engineering
 * page present the drawing upload identically. Wraps {@link UploadPlanInline}
 * in the standard raised card with an uppercase eyebrow heading.
 */
export function UploadDrawingPanel({
  projects,
  title = "Analyse a drawing",
  onUploaded,
  analyseRfi = true,
}: {
  projects: Project[];
  title?: string;
  onUploaded?: (id: string, kind: "pdf" | "dxf") => void;
  analyseRfi?: boolean;
}) {
  return (
    <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
        {title}
      </h2>
      <UploadPlanInline
        projects={projects}
        onUploaded={onUploaded}
        analyseRfi={analyseRfi}
      />
    </section>
  );
}
