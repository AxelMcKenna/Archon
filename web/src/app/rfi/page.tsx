import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { LetterReview } from "@/app/projects/[id]/rfi/[letterId]/letter-review";
import { UploadInline } from "./upload-inline";

export const dynamic = "force-dynamic";

type LetterRow = {
  id: string;
  project_id: string;
  rfi_number: number | null;
  issue_date: string | null;
  status: string;
  created_at: string;
  extraction_metadata: { extractor?: string } | null;
  projects: { address: string; bca: string; project_type: string } | null;
};

type ProjectRow = {
  id: string;
  address: string;
  bca: string;
  project_type: string;
};

export default async function RfiPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>;
}) {
  const { letter: letterId } = await searchParams;
  const supabase = await getSupabaseServer();

  const { data: lettersRaw } = await supabase
    .from("rfi_letters")
    .select(
      "id, project_id, rfi_number, issue_date, status, created_at, " +
        "extraction_metadata, projects(address, bca, project_type)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const letters = (lettersRaw ?? []) as unknown as LetterRow[];

  const { data: projectsRaw } = await supabase
    .from("projects")
    .select("id, address, bca, project_type")
    .order("updated_at", { ascending: false });
  const projects = (projectsRaw ?? []) as unknown as ProjectRow[];

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

      const logBy = new Map((log ?? []).map((l) => [l.rfi_item_id, l]));
      const draftBy = new Map((drafts ?? []).map((d) => [d.rfi_item_id, d]));
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
        })),
      };
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">RFI workspace</h1>
        <p className="text-sm text-ink-500 mt-1">
          Process an incoming RFI letter end-to-end. For pre-lodgement plan checks, see{" "}
          <Link href="/plans" className="underline">Building plan analyser</Link>.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          RFI received — process a letter
        </h2>
        <UploadInline projects={projects} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          RFI letters ({letters.length})
        </h2>
        <LettersList letters={letters} activeId={letterId} />
      </section>

      {selectedLetter && (
        <section className="space-y-3 pt-6 border-t border-ink-700/10">
          <SelectedLetterHeader selected={selectedLetter} />
          <LetterReview
            letterId={selectedLetter.letter.id}
            items={
              selectedLetter.items as Parameters<typeof LetterReview>[0]["items"]
            }
          />
        </section>
      )}
    </div>
  );
}

function LettersList({ letters, activeId }: { letters: LetterRow[]; activeId?: string }) {
  if (!letters.length) {
    return (
      <p className="text-sm text-ink-500 italic">No RFI letters yet.</p>
    );
  }
  return (
    <ul className="divide-y divide-ink-700/10 rounded-lg border border-ink-700/10">
      {letters.map((l) => {
        const bcaName =
          taxonomy.bcas.find((b) => b.id === l.projects?.bca)?.name ?? l.projects?.bca;
        const isActive = l.id === activeId;
        return (
          <li key={l.id} className={isActive ? "bg-ink-700/5" : "hover:bg-ink-700/5"}>
            <Link
              href={`/rfi?letter=${l.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {l.projects?.address ?? "(unknown project)"} — RFI {l.rfi_number ?? "?"}
                </p>
                <p className="text-xs text-ink-500">
                  {bcaName} · {l.issue_date ?? "no date"} ·{" "}
                  <span className="font-mono">{l.extraction_metadata?.extractor ?? "?"}</span>
                </p>
              </div>
              <span className="rounded bg-ink-700/10 px-2 py-0.5 text-xs">{l.status}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SelectedLetterHeader({
  selected,
}: {
  selected: {
    letter: LetterRow;
    items: unknown[];
  };
}) {
  const l = selected.letter;
  const bcaName =
    taxonomy.bcas.find((b) => b.id === l.projects?.bca)?.name ?? l.projects?.bca;
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-2">
      <div>
        <p className="text-xs text-ink-500">{bcaName} · {l.projects?.address}</p>
        <h2 className="text-xl font-semibold">
          RFI {l.rfi_number ?? "?"}{l.issue_date ? ` — ${l.issue_date}` : ""}
        </h2>
        <p className="text-xs text-ink-500 mt-1">{selected.items.length} items</p>
      </div>
      <Link href="/rfi" className="text-sm text-ink-500 hover:text-ink-900">
        Close →
      </Link>
    </div>
  );
}
