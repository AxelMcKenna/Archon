import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";

async function createProject(formData: FormData) {
  "use server";
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      address: String(formData.get("address") ?? ""),
      bca: String(formData.get("bca") ?? ""),
      project_type: String(formData.get("project_type") ?? ""),
      description: String(formData.get("description") ?? "") || null,
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
        <button className="rounded-lg bg-ink-900 text-white px-5 py-2 text-sm font-medium">
          Create
        </button>
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
