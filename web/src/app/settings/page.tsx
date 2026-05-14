import { getSupabaseServer } from "@/lib/supabase/server";
import { deleteProjectFromSettings } from "./actions";
import { SettingsDeleteProjectButton } from "./project-row-delete";

export const dynamic = "force-dynamic";

const projectTypeLabels: Record<string, string> = {
  new_dwelling: "New Dwelling",
  extension: "Extension",
  accessory: "Accessory Building",
  deck: "Deck",
};

export default async function Settings() {
  const supabase = await getSupabaseServer();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, address, project_type, application_ref, status, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">
      <header className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Settings
        </h1>
      </header>
      <div className="space-y-5">
        <section className="rounded-sm bg-surface-raised shadow-depth p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Account Settings
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Manage your account preferences and profile.
          </p>
        </section>
        <section className="rounded-sm bg-surface-raised shadow-depth p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Notifications
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Configure your notification preferences.
          </p>
        </section>
        <section className="rounded-sm bg-surface-raised shadow-depth p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Projects
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Manage your projects. Deleting a project permanently removes the project and its associated data.
          </p>
          {!projects || projects.length === 0 ? (
            <p className="mt-5 text-sm text-ink-500">No projects yet.</p>
          ) : (
            <ul className="mt-5 divide-y divide-ink-200/60 border-t border-ink-200/70">
              {projects.map((p) => {
                const label = p.application_ref?.trim() || p.address;
                const typeLabel = projectTypeLabels[p.project_type] ?? p.project_type;
                const action = deleteProjectFromSettings.bind(null, p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{label}</p>
                      <p className="truncate text-xs text-ink-500">
                        {typeLabel}
                        {p.application_ref?.trim() ? ` · ${p.address}` : null}
                        {p.status ? ` · ${p.status}` : null}
                      </p>
                    </div>
                    <SettingsDeleteProjectButton onDelete={action} projectLabel={label} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
