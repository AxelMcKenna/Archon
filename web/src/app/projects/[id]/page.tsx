import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { UploadRfi } from "./upload-rfi";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (!project) notFound();

  const { data: letters } = await supabase
    .from("rfi_letters")
    .select("id, rfi_number, issue_date, response_deadline, status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const bca = taxonomy.bcas.find((b) => b.id === project.bca);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <header>
        <p className="text-sm text-ink-500">{bca?.name}</p>
        <h1 className="text-2xl font-semibold">{project.address}</h1>
        <p className="mt-2 text-sm text-ink-500">
          {project.project_type} · status {project.status}
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">RFI letters</h2>
        {!letters?.length ? (
          <p className="text-ink-500 text-sm mb-4">No RFI letters yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700/10 mb-6">
            {letters.map((l) => (
              <li key={l.id} className="py-3 flex justify-between text-sm">
                <a href={`/projects/${id}/rfi/${l.id}`} className="hover:underline">
                  RFI {l.rfi_number ?? "?"} — {l.issue_date ?? "(no date)"}
                </a>
                <span className="text-ink-500">{l.status}</span>
              </li>
            ))}
          </ul>
        )}
        <UploadRfi projectId={id} bca={project.bca} />
      </section>
    </div>
  );
}
