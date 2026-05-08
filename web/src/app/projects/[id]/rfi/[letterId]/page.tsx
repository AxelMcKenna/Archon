import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { LetterReview } from "./letter-review";

export const dynamic = "force-dynamic";

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string; letterId: string }>;
}) {
  const { id: projectId, letterId } = await params;
  const supabase = await getSupabaseServer();

  const { data: letter } = await supabase
    .from("rfi_letters")
    .select("*")
    .eq("id", letterId)
    .single();
  if (!letter) notFound();

  const { data: items } = await supabase
    .from("rfi_items")
    .select("*")
    .eq("rfi_letter_id", letterId)
    .order("ordering");

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-6">
        <a href={`/projects/${projectId}`} className="text-sm text-ink-500 hover:text-ink-900">
          ← back to project
        </a>
        <h1 className="text-2xl font-semibold mt-2">
          RFI {letter.rfi_number ?? "?"}
          {letter.issue_date ? ` — ${letter.issue_date}` : ""}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          extracted via{" "}
          <span className="font-mono">
            {(letter.extraction_metadata as { extractor?: string })?.extractor}
          </span>{" "}
          · {(items ?? []).length} items
        </p>
      </div>
      <LetterReview letterId={letterId} items={items ?? []} />
    </div>
  );
}
