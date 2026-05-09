import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { deleteProject } from "./actions";
import { ProjectDeleteButton } from "@/components/project-delete-button";
import { ProjectDocumentsSection } from "@/components/project-documents-section";
import {
  buildProjectFormValues,
  normalizeProjectDetails,
} from "@/lib/project-details";
import { getProjectById } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project, error } = await getProjectById(supabase, id);
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

  const bca = taxonomy.bcas.find((b) => b.id === project.bca);
  const deleteProjectAction = deleteProject.bind(null, id);
  const projectFormValues = buildProjectFormValues(project);
  const projectDetails = normalizeProjectDetails(project.project_details, project.project_type);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">{bca?.name}</p>
          <h1 className="text-2xl font-semibold">{project.address}</h1>
          <p className="mt-2 text-sm text-ink-500">
            {project.project_type} · status {project.status}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/projects/${id}/edit`}
            className="inline-flex items-center rounded-lg border border-ink-700/10 bg-white px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Edit project details
          </a>
          <a
            href={`/projects/${id}/risk`}
            className="inline-flex items-center rounded-lg border border-ink-700/10 bg-white px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Pre-lodgement risk check
          </a>
        </div>
      </header>

      <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Project details</h2>
            <p className="mt-1 text-sm text-ink-500">
              Stored project metadata used by Consent Assessment and downstream workflows.
            </p>
          </div>
          <span className="rounded-full bg-ink-50 px-3 py-1 text-sm font-medium text-ink-700">
            {projectFormValues.projectType.replace(/_/g, " ")}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-ink-500">Estimated floor area</dt>
            <dd className="font-medium text-ink-900">
              {projectDetails.estimatedFloorAreaM2 ? `${projectDetails.estimatedFloorAreaM2} m²` : "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Estimated construction value</dt>
            <dd className="font-medium text-ink-900">
              {projectDetails.estimatedConstructionValueNZD
                ? `$${projectDetails.estimatedConstructionValueNZD.toLocaleString("en-NZ")}`
                : "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Flags</dt>
            <dd className="font-medium text-ink-900">
              {formatFlags([
                projectDetails.involvesStructuralWork && "Structural work",
                projectDetails.involvesEarthworks && "Earthworks",
                projectDetails.existingStructureDemolished && "Demolition",
                projectDetails.newRoadAccess && "New road access",
              ])}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">New service connections</dt>
            <dd className="font-medium text-ink-900">
              {formatFlags([
                projectDetails.newServiceConnections.water && "Water",
                projectDetails.newServiceConnections.wastewater && "Wastewater",
                projectDetails.newServiceConnections.stormwater && "Stormwater",
              ])}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Project activity</h2>
            <p className="mt-1 text-sm text-ink-500">
              Recent RFI activity and shortcuts into the current consent workflow.
            </p>
          </div>
          <a
            href={`/projects/${id}/project-application`}
            className="inline-flex items-center rounded-lg border border-ink-700/10 bg-white px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Open Project Application
          </a>
        </div>

        {!letters?.length ? (
          <p className="mt-5 text-sm text-ink-500">No RFI letters recorded yet.</p>
        ) : (
          <ul className="mt-5 divide-y divide-ink-700/10">
            {letters.slice(0, 5).map((l) => (
              <li key={l.id} className="flex justify-between py-3 text-sm">
                <a href={`/projects/${id}/project-application`} className="hover:underline">
                  RFI {l.rfi_number ?? "?"} — {l.issue_date ?? "(no date)"}
                </a>
                <span className="text-ink-500">{l.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProjectDocumentsSection
        projectId={id}
        address={project.address}
        projectDetails={projectDetails}
      />
      <section className="border-t border-ink-700/10 pt-8">
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
          <h2 className="text-lg font-semibold text-red-900">Danger zone</h2>
          <p className="mt-2 text-sm text-red-800/80">
            Deleting a project permanently removes the project and its associated consent data.
          </p>
          <div className="mt-5">
            <ProjectDeleteButton onDelete={deleteProjectAction} />
          </div>
        </div>
      </section>
    </div>
  );
}

function formatFlags(values: Array<string | false>) {
  const labels = values.filter((value): value is string => Boolean(value));
  return labels.length > 0 ? labels.join(", ") : "None selected";
}
