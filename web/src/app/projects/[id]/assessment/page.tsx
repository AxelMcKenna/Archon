import { notFound } from "next/navigation";
import { AddressChecklist } from "@/components/AddressChecklist";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function Assessment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("id, address, project_type")
    .eq("id", id)
    .single();

  if (!project) notFound();

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-semibold mb-8">Assessment</h1>
      <div className="bg-white p-8 rounded-lg border border-ink-200">
        <AddressChecklist address={project.address} initialProjectType={project.project_type} />
      </div>
    </div>
  );
}
