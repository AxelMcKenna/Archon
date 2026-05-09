import Link from "next/link";
import { notFound } from "next/navigation";
import { taxonomy } from "@consentiq/shared";
import { getSupabaseServer } from "@/lib/supabase/server";
import { UploadRfiInline } from "@/app/plans/upload-rfi-inline";
import { LetterReview } from "@/app/projects/[id]/rfi/[letterId]/letter-review";

export const dynamic = "force-dynamic";

type LetterRow = {
  id: string;
  project_id: string;
  rfi_number: number | null;
  issue_date: string | null;
  status: string;
  created_at: string;
  extraction_metadata: { extractor?: string } | null;
};

export default async function ProjectRfis({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ letter?: string; pipeline?: string }>;
}) {
  const { id: projectId } = await params;
  const { letter: letterId, pipeline } = await searchParams;
  const pipelineFailed = pipeline === "failed";
  const supabase = await getSupabaseServer();

  const { data: project } = await supabase
    .from("projects")
    .select("id, address, bca, project_type")
    .eq("id", projectId)
    .single();
  if (!project) notFound();

  const [{ data: lettersRaw }, { data: plansRaw }, { data: cadsRaw }] =
    await Promise.all([
      supabase
        .from("rfi_letters")
        .select(
          "id, project_id, rfi_number, issue_date, status, created_at, extraction_metadata",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("plan_uploads")
        .select("id, project_id, filename, status, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("cad_uploads")
        .select("id, project_id, filename, status, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
    ]);

  const letters = (lettersRaw ?? []) as unknown as LetterRow[];
  const pdfRows = (plansRaw ?? []) as Array<{
    id: string;
    project_id: string;
    filename: string;
    status: string;
    created_at: string;
  }>;
  const cadRows = (cadsRaw ?? []) as Array<{
    id: string;
    project_id: string;
    filename: string;
    status: string;
    created_at: string;
  }>;

  // Per-letter progress in the list (matched vs total).
  const letterProgress = new Map<
    string,
    { total: number; matched: number; drafted: number }
  >();
  if (letters.length) {
    const ids = letters.map((l) => l.id);
    const { data: itemsForCounts } = await supabase
      .from("rfi_items")
      .select("id, rfi_letter_id")
      .in("rfi_letter_id", ids);
    const itemsByLetter = new Map<string, string[]>();
    for (const it of itemsForCounts ?? []) {
      const arr = itemsByLetter.get(it.rfi_letter_id) ?? [];
      arr.push(it.id);
      itemsByLetter.set(it.rfi_letter_id, arr);
    }
    const allItemIds = (itemsForCounts ?? []).map((i) => i.id);
    const [{ data: ev }, { data: drafts }] = allItemIds.length
      ? await Promise.all([
          supabase
            .from("rfi_item_plan_evidence")
            .select("rfi_item_id, source")
            .in("rfi_item_id", allItemIds),
          supabase
            .from("responses")
            .select("rfi_item_id")
            .in("rfi_item_id", allItemIds),
        ])
      : [{ data: [] }, { data: [] }];
    const matchedSet = new Set(
      ((ev ?? []) as unknown as Array<{ rfi_item_id: string; source: string }>)
        .filter((e) => e.source === "flag")
        .map((e) => e.rfi_item_id),
    );
    const draftSet = new Set((drafts ?? []).map((d) => d.rfi_item_id));
    for (const [lid, itemIds] of itemsByLetter) {
      letterProgress.set(lid, {
        total: itemIds.length,
        matched: itemIds.filter((id) => matchedSet.has(id)).length,
        drafted: itemIds.filter((id) => draftSet.has(id)).length,
      });
    }
  }

  let selectedLetter: {
    letter: LetterRow;
    items: Array<Record<string, unknown>>;
  } | null = null;
  if (letterId) {
    const sel = letters.find((l) => l.id === letterId);
    if (sel) {
      const { data: items } = await supabase
        .from("rfi_items")
        .select("*")
        .eq("rfi_letter_id", letterId)
        .order("ordering");

      const itemIds = (items ?? []).map((i) => i.id);
      const { data: log } = itemIds.length
        ? await supabase.from("reconciliation_log").select("*").in("rfi_item_id", itemIds)
        : { data: [] };
      const { data: drafts } = itemIds.length
        ? await supabase.from("responses").select("*").in("rfi_item_id", itemIds)
        : { data: [] };
      const { data: atts } = itemIds.length
        ? await supabase.from("attachments").select("*").in("rfi_item_id", itemIds)
        : { data: [] };
      const { data: ev } = itemIds.length
        ? await supabase
            .from("rfi_item_plan_evidence")
            .select(
              "rfi_item_id, source, confidence, rationale, evidence, " +
                "flag_index, plan_upload_id, cad_upload_id",
            )
            .in("rfi_item_id", itemIds)
        : { data: [] };

      const logBy = new Map((log ?? []).map((l) => [l.rfi_item_id, l]));
      const draftBy = new Map((drafts ?? []).map((d) => [d.rfi_item_id, d]));
      const evBy = new Map(
        ((ev ?? []) as unknown as Array<{ rfi_item_id: string }>).map((e) => [
          e.rfi_item_id,
          e,
        ]),
      );
      const attsBy = new Map<string, typeof atts>();
      for (const a of atts ?? []) {
        const list = attsBy.get(a.rfi_item_id) ?? [];
        list.push(a);
        attsBy.set(a.rfi_item_id, list);
      }

      selectedLetter = {
        letter: sel,
        items: (items ?? []).map((i) => ({
          ...i,
          reconciliation: logBy.get(i.id) ?? null,
          response: draftBy.get(i.id) ?? null,
          attachments: attsBy.get(i.id) ?? [],
          plan_evidence: evBy.get(i.id) ?? null,
        })),
      };
    }
  }

  const projectsForUpload = [
    {
      id: project.id,
      address: project.address,
      bca: project.bca,
      project_type: project.project_type,
    },
  ];

  const plansForUpload = [
    ...pdfRows.map((r) => ({ ...r, format: "pdf" as const })),
    ...cadRows.map((r) => ({ ...r, format: "dxf" as const })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <header className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Requests for information
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">RFIs</h1>
        <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
          Upload an incoming RFI letter alongside the submitted plan.
          We&rsquo;ll match each item to a flag on the plan and draft a
          covering letter.
        </p>
      </header>

      <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Received an RFI?
        </h2>
        <UploadRfiInline projects={projectsForUpload} plans={plansForUpload} />
      </section>

      <section className="rounded-sm bg-surface-raised shadow-depth p-8 space-y-4">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          RFI letters ({letters.length})
        </h2>
        <LettersList
          letters={letters}
          activeId={letterId}
          progress={letterProgress}
          projectId={projectId}
          projectBca={project.bca}
        />
      </section>

      {selectedLetter && (
        <section className="space-y-4 pt-8 border-t border-ink-200/70">
          <SelectedLetterHeader
            selected={selectedLetter}
            projectId={projectId}
            projectBca={project.bca}
          />
          <LetterReview
            letterId={selectedLetter.letter.id}
            items={
              selectedLetter.items as Parameters<typeof LetterReview>[0]["items"]
            }
            pipelineFailed={pipelineFailed}
          />
        </section>
      )}
    </div>
  );
}

function LettersList({
  letters,
  activeId,
  progress,
  projectId,
  projectBca,
}: {
  letters: LetterRow[];
  activeId?: string;
  progress: Map<string, { total: number; matched: number; drafted: number }>;
  projectId: string;
  projectBca: string;
}) {
  if (!letters.length) {
    return <p className="text-sm text-ink-500 italic">No RFI letters yet.</p>;
  }
  const bcaName = taxonomy.bcas.find((b) => b.id === projectBca)?.name ?? projectBca;
  return (
    <ul className="divide-y divide-ink-200/70 rounded-sm bg-surface-raised shadow-depth overflow-hidden">
      {letters.map((l) => {
        const isActive = l.id === activeId;
        const p = progress.get(l.id);
        return (
          <li key={l.id} className={isActive ? "bg-ink-50" : "hover:bg-ink-50 transition-colors"}>
            <Link
              href={{
                pathname: `/projects/${projectId}/rfis`,
                query: { letter: l.id },
              }}
              className="flex items-center justify-between px-5 py-3.5 text-sm gap-4 cursor-pointer"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink-900 truncate">
                  RFI {l.rfi_number ?? "?"}
                  {l.issue_date ? ` — ${l.issue_date}` : ""}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {bcaName} · {new Date(l.created_at).toLocaleDateString()}
                  {p ? ` · ${p.matched}/${p.total} matched` : ""}
                </p>
              </div>
              <span className="rounded-full bg-ink-100 text-ink-700 px-2.5 py-0.5 text-[11px] font-medium">
                {l.status}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SelectedLetterHeader({
  selected,
  projectId,
  projectBca,
}: {
  selected: { letter: LetterRow; items: unknown[] };
  projectId: string;
  projectBca: string;
}) {
  const l = selected.letter;
  const bcaName = taxonomy.bcas.find((b) => b.id === projectBca)?.name ?? projectBca;
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-2">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">{bcaName}</p>
        <h2 className="text-xl font-semibold tracking-tight text-ink-900">
          RFI {l.rfi_number ?? "?"}
          {l.issue_date ? ` — ${l.issue_date}` : ""}
        </h2>
        <p className="text-xs text-ink-500">{selected.items.length} items</p>
      </div>
      <Link
        href={`/projects/${projectId}/rfis`}
        className="text-sm font-medium text-ink-500 hover:text-ink-900 transition-colors cursor-pointer"
      >
        Close →
      </Link>
    </div>
  );
}
