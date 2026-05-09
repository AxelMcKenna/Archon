import { notFound } from "next/navigation";
import { ConsentAssessmentPage } from "@/components/consent-assessment/consent-assessment-page";
import { normalizeProjectDetails } from "@/lib/project-details";
import { getProjectById } from "@/lib/projects";
import { getSupabaseServer } from "@/lib/supabase/server";
import { UploadRfi } from "../upload-rfi";

export const dynamic = "force-dynamic";

export default async function ProjectApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project, error } = await getProjectById(
    supabase,
    id,
    "id, address, bca, project_type",
  );

  if (!project) {
    if (error) {
      throw error;
    }
    notFound();
  }

  const { data: letters } = await supabase
    .from("rfi_letters")
    .select("id, rfi_number, issue_date, response_deadline, status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8 pb-8">
      <ConsentAssessmentPage
        projectId={project.id}
        address={project.address}
        projectDetails={normalizeProjectDetails(project.project_details, project.project_type)}
        heading="Project Application"
        description="Prepare consent submission documents and coordinate downstream application workflow."
        basePath="project-application"
      />

      <section id="rfi-section" className="mx-auto max-w-6xl rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink-500">
              Request For Information
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
              RFI Workspace
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-500">
              Current RFI handling is intentionally lightweight here, but the section is wired into
              the project workflow so fuller review features can be added later.
            </p>
          </div>
          <span className="rounded-full bg-ink-50 px-3 py-1 text-sm font-medium text-ink-700">
            {letters?.length ?? 0} letter{letters?.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr),minmax(18rem,0.95fr)]">
          <div className="rounded-2xl border border-ink-700/10 bg-ink-50 p-5">
            <h3 className="text-sm font-semibold text-ink-900">Current letters</h3>
            {!letters?.length ? (
              <p className="mt-3 text-sm text-ink-500">No RFI letters recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {letters.map((letter) => (
                  <li
                    key={letter.id}
                    className="rounded-xl border border-ink-700/10 bg-white px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink-900">
                        RFI {letter.rfi_number ?? "?"}
                      </span>
                      <span className="text-ink-500">{letter.status ?? "Unknown"}</span>
                    </div>
                    <p className="mt-2 text-ink-500">
                      Issued {letter.issue_date ?? "Unknown"} · Response due{" "}
                      {letter.response_deadline ?? "Not set"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-ink-700/10 bg-ink-50 p-5 text-sm text-ink-600">
              Uploading and extraction are available now. Full structured RFI review and response
              workflows can attach here later without changing the project tab layout.
            </div>
            <UploadRfi projectId={project.id} bca={project.bca} />
          </div>
        </div>
      </section>
    </div>
  );
}
