import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { ProjectCreateButton } from "@/components/project-create-button";

async function createProject(formData: FormData) {
  "use server";
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const address = String(formData.get("address") ?? "").trim();
  const bca = String(formData.get("bca") ?? "").trim();
  const projectType = String(formData.get("project_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  const recentThreshold = new Date(Date.now() - 15_000).toISOString();
  const { data: existingProject } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("address", address)
    .eq("bca", bca)
    .eq("project_type", projectType)
    .gte("created_at", recentThreshold)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingProject) {
    redirect(`/projects/${existingProject.id}`);
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      address,
      bca,
      project_type: projectType,
      description,
    })
    .select("id")
    .single();
  if (error) throw error;
  redirect(`/projects/${data.id}`);
}

export default function NewProjectPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">New project</h1>
      <form action={createProject} className="space-y-4">
        <Field label="Project address">
          <input name="address" required className="w-full rounded border border-ink-700/20 px-3 py-2" />
        </Field>
        <Field label="BCA">
          <select name="bca" required className="w-full rounded border border-ink-700/20 px-3 py-2">
            {taxonomy.bcas.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Project type">
          <select name="project_type" required className="w-full rounded border border-ink-700/20 px-3 py-2">
            {taxonomy.project_types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Description (optional)">
          <textarea name="description" rows={4} className="w-full rounded border border-ink-700/20 px-3 py-2" />
        </Field>
        <ProjectCreateButton />
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-ink-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}
