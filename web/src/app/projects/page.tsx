import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { ProjectsTable, type Row } from "./projects-table";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await getSupabaseServer();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, address, bca, project_type, status, updated_at")
    .order("updated_at", { ascending: false });

  // For each project, compute open RFI count + oldest open issue date.
  let rows: Row[] = [];
  if (projects?.length) {
    const ids = projects.map((p) => p.id);
    const { data: letters } = await supabase
      .from("rfi_letters")
      .select("project_id, status, issue_date")
      .in("project_id", ids);

    const byProject = new Map<string, typeof letters>();
    for (const l of letters ?? []) {
      const list = byProject.get(l.project_id) ?? [];
      list.push(l);
      byProject.set(l.project_id, list);
    }

    rows = projects.map((p) => {
      const all = byProject.get(p.id) ?? [];
      const open = all.filter(
        (l) => l.status === "uploaded" || l.status === "extracted" || l.status === "classified",
      );
      let oldestOpenDays: number | null = null;
      for (const l of open) {
        if (!l.issue_date) continue;
        const days = Math.floor(
          (Date.now() - new Date(l.issue_date).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (oldestOpenDays === null || days > oldestOpenDays) oldestOpenDays = days;
      }
      const bcaName = taxonomy.bcas.find((b) => b.id === p.bca)?.name ?? p.bca;
      return {
        id: p.id,
        address: p.address,
        bca: p.bca,
        bca_name: bcaName,
        project_type: p.project_type,
        status: p.status,
        updated_at: p.updated_at,
        open_rfis: open.length,
        oldest_open_days: oldestOpenDays,
      };
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded-lg bg-ink-900 text-white px-4 py-2 text-sm font-medium"
        >
          New project
        </Link>
      </div>
      {!rows.length ? (
        <p className="text-ink-500">No projects yet. Create one to start.</p>
      ) : (
        <ProjectsTable rows={rows} />
      )}
    </div>
  );
}
