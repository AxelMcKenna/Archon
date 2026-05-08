import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await getSupabaseServer();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, address, bca, project_type, status, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded-lg bg-ink-900 text-white px-4 py-2 text-sm font-medium"
        >
          New project
        </Link>
      </div>
      {!projects?.length ? (
        <p className="text-ink-500">No projects yet. Create one to start.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-ink-500 border-b border-ink-700/10">
            <tr>
              <th className="py-2">Address</th>
              <th>BCA</th>
              <th>Type</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const bca = taxonomy.bcas.find((b) => b.id === p.bca);
              return (
                <tr key={p.id} className="border-b border-ink-700/5 hover:bg-ink-700/5">
                  <td className="py-3">
                    <Link href={`/projects/${p.id}`} className="hover:underline">
                      {p.address}
                    </Link>
                  </td>
                  <td>{bca?.name ?? p.bca}</td>
                  <td>{p.project_type}</td>
                  <td>
                    <span className="inline-block rounded bg-ink-700/10 px-2 py-0.5 text-xs">
                      {p.status}
                    </span>
                  </td>
                  <td className="text-ink-500">{new Date(p.updated_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
